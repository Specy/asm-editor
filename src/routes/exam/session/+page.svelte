<script lang="ts">
    import { browser } from '$app/environment'
    import { page } from '$app/stores'
    import { goto } from '$app/navigation'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Input from '$cmp/shared/input/Input.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import Editor from '$cmp/specific/project/Editor.svelte'
    import ProjectEditor from '../../projects/[project]/Project.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import {
        createExamSessionLink,
        decodeExamPayload,
        ExamSectionType,
        parseLegacyProjectExamPayload,
        unlockExamSections,
        type AssemblyCodingAnswer,
        type AssemblyCodingSection,
        type CCodingAnswer,
        type CCodingSection,
        type ExamPayload,
        type ExamSection,
        type ExamSectionAnswer,
        type ExamSubmission,
        type MultipleChoiceAnswer,
        type MultipleChoiceSection,
        type OpenQuestionAnswer,
        type OpenQuestionSection
    } from '$lib/exam'
    import { createDebouncer, makeHash, textDownloader } from '$lib/utils'
    import { serializer } from '$lib/json'
    import { toast } from '$stores/toastStore'
    import { Prompt } from '$stores/promptStore.svelte'
    import { onMount, tick } from 'svelte'
    import FaArrowLeft from 'svelte-icons/fa/FaArrowLeft.svelte'
    import FaArrowRight from 'svelte-icons/fa/FaArrowRight.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FloatingLanguageDocumentation from '$cmp/specific/project/FloatingLanguageDocumentation.svelte'
    import FaBook from 'svelte-icons/fa/FaBook.svelte'
    import ExamReviewAgentSidebar from '$cmp/specific/exam/ExamReviewAgentSidebar.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import { preloadAllEmulators } from '$lib/languages/Emulator'

    const EXAM_SESSION_SNAPSHOT_VERSION = 1
    const EXAM_SESSION_SNAPSHOT_PREFIX = 'asm-editor_exam_session_snapshot:'

    type StoredExamSessionSnapshot = {
        version: number
        sourceHash: string
        savedAt: number
        answers: Record<string, ExamSectionAnswer>
    }

    let exam = $state<ExamPayload | null>(null)
    let sections = $state([] as ExamSection[])
    let status: 'loading' | 'loaded' | 'error' = $state('loading')
    let errorMessage = $state('Invalid exam link.')
    let activeSectionId = $state('')

    let examDisabled = $state(false)
    let unlockPasswordInput = $state('')
    let submissionUrl = $state('')
    let documentationVisible = $state(false)
    let teacherAgentOpen = $state(false)
    let snapshotStorageKey = ''
    let snapshotSourceHash = ''

    let openAnswers = $state<Record<string, string>>({})
    let multipleChoiceAnswers = $state<Record<string, string[]>>({})
    let assemblyAnswers = $state<Record<string, string>>({})
    let cAnswers = $state<Record<string, string>>({})

    let examSubmission = $state<ExamSubmission>({
        name: '',
        submissionTimestamp: 0,
        startedAt: 0,
        hash: '',
        fullscreenExitCount: 0,
        answers: {}
    })

    let now = $state(Date.now())
    let timeoutSubmissionTriggered = $state(false)
    const [debouncedSaveSnapshot, clearSnapshotDebounce] = createDebouncer(250)

    const activeSection = $derived(sections.find((section) => section.id === activeSectionId))
    const activeVisibleAnswer = $derived(
        activeSection ? collectAnswerForSection(activeSection) : null
    )
    const activeSectionIndex = $derived(getSectionIndex(activeSectionId))
    const isReviewMode = $derived(!!exam?.submission)
    const hasInstructions = $derived(!!exam?.instructions.trim() && !isReviewMode)
    const isOnInstructions = $derived(hasInstructions && activeSectionId === '')
    const canGoToPreviousSection = $derived(
        (activeSectionIndex > 0 || (activeSectionIndex === 0 && hasInstructions)) && !examDisabled
    )
    const canGoToNextSection = $derived(
        (activeSectionIndex < 0 ? sections.length > 0 : activeSectionIndex + 1 < sections.length) &&
            !examDisabled
    )
    const isOnLastSection = $derived(
        activeSectionIndex >= 0 && activeSectionIndex === sections.length - 1
    )
    const isSubmitted = $derived(!!examSubmission.submissionTimestamp)
    const formattedSubmissionTime = $derived(
        examSubmission.submissionTimestamp
            ? new Date(examSubmission.submissionTimestamp).toLocaleString()
            : ''
    )
    const remainingMs = $derived(
        exam &&
            exam.timeLimit > 0 &&
            examSubmission.startedAt > 0 &&
            !examSubmission.submissionTimestamp
            ? Math.max(0, examSubmission.startedAt + exam.timeLimit - now)
            : -1
    )
    const remainingTimeLabel = $derived(formatRemainingTime(remainingMs))
    const exerciseProgressLabel = $derived(
        activeSectionIndex >= 0 ? `${activeSectionIndex + 1}/${sections.length}` : ''
    )

    function formatRemainingTime(milliseconds: number) {
        if (milliseconds < 0) return ''
        const totalSeconds = Math.ceil(milliseconds / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }

    function getSectionIndex(sectionId: string) {
        return sections.findIndex((section) => section.id === sectionId)
    }

    function goToPreviousSection() {
        const index = getSectionIndex(activeSectionId)
        if (index === 0 && hasInstructions) {
            activeSectionId = ''
            return
        }
        if (index <= 0) return
        activeSectionId = sections[index - 1].id
    }

    function goToNextSection() {
        const index = getSectionIndex(activeSectionId)
        if (index < 0) {
            activeSectionId = sections[0]?.id ?? ''
            return
        }
        if (index < 0 || index + 1 >= sections.length) return
        activeSectionId = sections[index + 1].id
    }

    function initializeAnswers() {
        const open: Record<string, string> = {}
        const multiple: Record<string, string[]> = {}
        const assembly: Record<string, string> = {}
        const c: Record<string, string> = {}

        for (const section of sections) {
            const submissionAnswer = examSubmission.answers[section.id]
            if (section.type === ExamSectionType.OpenQuestion) {
                open[section.id] =
                    submissionAnswer && submissionAnswer.type === 'open-question'
                        ? submissionAnswer.answer
                        : ''
            } else if (section.type === ExamSectionType.MultipleChoice) {
                const selected =
                    submissionAnswer && submissionAnswer.type === 'multiple-choice'
                        ? submissionAnswer.selectedOptionIds
                        : []
                multiple[section.id] = section.allowMultiple ? selected : selected.slice(0, 1)
            } else if (section.type === ExamSectionType.AssemblyCoding) {
                assembly[section.id] =
                    submissionAnswer && submissionAnswer.type === 'assembly-coding'
                        ? submissionAnswer.code
                        : section.starterCode
            } else if (section.type === ExamSectionType.CCoding) {
                c[section.id] =
                    submissionAnswer && submissionAnswer.type === 'c-coding'
                        ? submissionAnswer.code
                        : section.starterCode
            }
        }

        openAnswers = open
        multipleChoiceAnswers = multiple
        assemblyAnswers = assembly
        cAnswers = c
    }

    function collectAnswerForSection(section: ExamSection): ExamSectionAnswer {
        if (section.type === ExamSectionType.OpenQuestion) {
            return {
                type: 'open-question',
                answer: openAnswers[section.id] ?? ''
            } satisfies OpenQuestionAnswer
        }
        if (section.type === ExamSectionType.MultipleChoice) {
            const selected = multipleChoiceAnswers[section.id] ?? []
            return {
                type: 'multiple-choice',
                selectedOptionIds: section.allowMultiple ? [...selected] : selected.slice(0, 1)
            } satisfies MultipleChoiceAnswer
        }
        if (section.type === ExamSectionType.AssemblyCoding) {
            return {
                type: 'assembly-coding',
                code: assemblyAnswers[section.id] ?? section.starterCode
            } satisfies AssemblyCodingAnswer
        }
        return {
            type: 'c-coding',
            code: cAnswers[section.id] ?? section.starterCode
        } satisfies CCodingAnswer
    }

    function collectAnswers(): Record<string, ExamSectionAnswer> {
        const answers: Record<string, ExamSectionAnswer> = {}
        for (const section of sections) {
            answers[section.id] = collectAnswerForSection(section)
        }
        return answers
    }

    function normalizeExamSubmission(submission: ExamSubmission): ExamSubmission {
        return {
            ...submission,
            fullscreenExitCount: submission.fullscreenExitCount ?? 0,
            answers: submission.answers ?? {}
        }
    }

    async function initializeSnapshotStorage(encodedExam: string) {
        snapshotSourceHash = (await makeHash(encodedExam)).slice(0, 32)
        snapshotStorageKey = `${EXAM_SESSION_SNAPSHOT_PREFIX}${snapshotSourceHash}`
    }

    function readExamSnapshot(): StoredExamSessionSnapshot | null {
        if (!browser || !snapshotStorageKey || !snapshotSourceHash) return null

        try {
            const stored = localStorage.getItem(snapshotStorageKey)
            if (!stored) return null

            const snapshot = serializer.parse<
                StoredExamSessionSnapshot & {
                    submission?: ExamSubmission
                    exam?: ExamPayload
                }
            >(stored)
            const answers = snapshot.answers ?? snapshot.submission?.answers
            if (
                snapshot.version !== EXAM_SESSION_SNAPSHOT_VERSION ||
                snapshot.sourceHash !== snapshotSourceHash ||
                !!snapshot.submission?.submissionTimestamp ||
                !!snapshot.exam?.submission ||
                !answers
            ) {
                return null
            }

            return {
                version: snapshot.version,
                sourceHash: snapshot.sourceHash,
                savedAt: snapshot.savedAt,
                answers
            }
        } catch (e) {
            console.error(e)
            localStorage.removeItem(snapshotStorageKey)
            return null
        }
    }

    function canPersistExamSnapshot() {
        return (
            browser &&
            status === 'loaded' &&
            !!exam &&
            !!snapshotStorageKey &&
            !!snapshotSourceHash &&
            !isReviewMode &&
            !isSubmitted &&
            !submissionUrl
        )
    }

    function buildExamSnapshot(): StoredExamSessionSnapshot | null {
        if (!exam || !snapshotSourceHash) return null

        return {
            version: EXAM_SESSION_SNAPSHOT_VERSION,
            sourceHash: snapshotSourceHash,
            savedAt: Date.now(),
            answers: collectAnswers()
        }
    }

    function saveExamSnapshot() {
        if (!canPersistExamSnapshot()) return

        const snapshot = buildExamSnapshot()
        if (!snapshot) return

        try {
            localStorage.setItem(snapshotStorageKey, serializer.stringify(snapshot))
        } catch (e) {
            console.error(e)
        }
    }

    function scheduleExamSnapshotSave() {
        if (!canPersistExamSnapshot()) return
        debouncedSaveSnapshot(saveExamSnapshot)
    }

    function clearExamSnapshot() {
        clearSnapshotDebounce()
        if (!browser || !snapshotStorageKey) return
        localStorage.removeItem(snapshotStorageKey)
    }

    function selectOption(section: MultipleChoiceSection, optionId: string, checked: boolean) {
        const current = multipleChoiceAnswers[section.id] ?? []
        if (section.allowMultiple) {
            if (checked) {
                multipleChoiceAnswers[section.id] = [...new Set([...current, optionId])]
            } else {
                multipleChoiceAnswers[section.id] = current.filter((id) => id !== optionId)
            }
            return
        }

        if (!checked) return
        multipleChoiceAnswers[section.id] = [optionId]
    }

    function handleOpenAnswerKeydown(event: KeyboardEvent, section: OpenQuestionSection) {
        if (event.key !== 'Tab' || isReviewMode || examDisabled) return

        event.preventDefault()
        const textarea = event.currentTarget as HTMLTextAreaElement
        const value = openAnswers[section.id] ?? ''
        const start = textarea.selectionStart
        const end = textarea.selectionEnd

        openAnswers[section.id] = `${value.slice(0, start)}\t${value.slice(end)}`
        void tick().then(() => {
            textarea.focus()
            textarea.selectionStart = textarea.selectionEnd = start + 1
        })
    }

    async function unlockExam() {
        if (!exam) return
        const hash = (await makeHash(unlockPasswordInput)).slice(0, 6)
        unlockPasswordInput = ''
        if (hash !== exam.unlockPasswordHash) {
            toast.error('Wrong unlock password')
            return
        }
        await requestExamFullscreen()
        examDisabled = false
        examSubmission.submissionTimestamp = 0
        examSubmission.fullscreenExitCount = examSubmission.fullscreenExitCount ?? 0
        submissionUrl = ''
        exam.submission = undefined
        try {
            await navigator.clipboard.writeText('')
        } catch {
            // clipboard access may be denied
        }
        toast.logPill('Exam unlocked')
    }

    function listenVisibilityChange() {
        if (document.visibilityState === 'hidden' || !document.hasFocus()) {
            examDisabled = true
        }
    }

    function listenFullscreenChange() {
        if (!document.fullscreenElement) {
            if (!isSubmitted) {
                examSubmission.fullscreenExitCount = (examSubmission.fullscreenExitCount ?? 0) + 1
                saveExamSnapshot()
            }
            examDisabled = true
        }
    }

    function detachExamListeners() {
        document.removeEventListener('visibilitychange', listenVisibilityChange)
        document.removeEventListener('fullscreenchange', listenFullscreenChange)
        window.removeEventListener('blur', listenVisibilityChange)
        window.removeEventListener('keydown', preventDefaultKeyPresses)
    }

    function preventDefaultKeyPresses(event: KeyboardEvent) {
        const isMac = navigator.platform.toUpperCase().includes('MAC')
        const modifierKeyPressed = isMac ? event.metaKey : event.ctrlKey

        if (event.key === 'PrintScreen' || event.code === 'PrintScreen') {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            return
        }

        if (modifierKeyPressed) {
            const key = event.key.toLowerCase()
            if (key === 'f' || key === 'p') {
                event.preventDefault()
            }
        }

        if (event.key === 'F11' || event.key === 'F12') {
            event.preventDefault()
        }
    }

    async function requestExamFullscreen() {
        try {
            await document.documentElement.requestFullscreen()
        } catch (e) {
            console.error(e)
            toast.error('Unable to enter fullscreen mode')
            return
        }

        try {
            const keyboard = (
                navigator as Navigator & {
                    keyboard?: { lock?: (keyCodes: string[]) => Promise<void> }
                }
            ).keyboard
            await keyboard?.lock?.(['Escape', 'F11', 'F12', 'PrintScreen'])
        } catch (e) {
            console.warn('Unable to lock exam keyboard shortcuts', e)
        }
    }

    async function startExam() {
        document.addEventListener('visibilitychange', listenVisibilityChange)
        document.addEventListener('fullscreenchange', listenFullscreenChange)
        window.addEventListener('blur', listenVisibilityChange)
        window.addEventListener('keydown', preventDefaultKeyPresses)
        await requestExamFullscreen()
    }

    async function finishExam(autoSubmit = false) {
        if (!exam || isSubmitted) return

        if (!autoSubmit) {
            const wantsToFinish = await Prompt.confirm(
                'Do you want to finish the exam? You will not be able to edit the answers anymore.'
            )
            if (!wantsToFinish) return
        }

        const timeLimitDeadline =
            exam.timeLimit > 0 && examSubmission.startedAt > 0
                ? examSubmission.startedAt + exam.timeLimit
                : Date.now()

        examSubmission.submissionTimestamp = autoSubmit ? timeLimitDeadline : Date.now()
        examSubmission.fullscreenExitCount = examSubmission.fullscreenExitCount ?? 0
        examSubmission.answers = collectAnswers()
        examDisabled = true
        exam = {
            ...exam,
            submission: $state.snapshot(examSubmission)
        }

        const payloadToShare: ExamPayload = {
            ...exam,
            sections: $state.snapshot(sections),
            submission: $state.snapshot(examSubmission)
        }

        const link = createExamSessionLink(payloadToShare)
        submissionUrl = link
        clearExamSnapshot()
        try {
            await navigator.clipboard.writeText(link)
            toast.logPill('Submission link copied to clipboard')
        } catch (e) {
            console.error(e)
            toast.error('Unable to copy the submission link automatically.')
        }

        if (autoSubmit) {
            toast.error('Time is up. The exam was submitted automatically.')
        }

        detachExamListeners()
        if (document.fullscreenElement) {
            await document.exitFullscreen()
        }
    }

    async function resolveSectionsWithAccessPassword(
        payload: ExamPayload
    ): Promise<ExamSection[] | null> {
        if (!payload.accessPasswordHash) {
            if (payload.encryptedSections) {
                toast.error('This exam requires an access password.')
                return null
            }
            return payload.sections
        }

        while (true) {
            const accessPassword = await Prompt.askText(
                payload.submission
                    ? 'Enter the exam access password to review this submission.'
                    : 'Enter the exam access password to start the exam.',
                false
            )
            if (typeof accessPassword !== 'string') {
                toast.error('A valid access password is required.')
                continue
            }
            const hash = (await makeHash(accessPassword)).slice(0, 6)
            if (hash !== payload.accessPasswordHash) {
                toast.error('Wrong access password')
                continue
            }

            try {
                return await unlockExamSections(payload, accessPassword)
            } catch (e) {
                console.error(e)
                toast.error('Unable to unlock exam content with this password.')
            }
        }
    }

    async function loadExam() {
        try {
            timeoutSubmissionTriggered = false
            const encodedExam = $page.url.searchParams.get('exam')
            if (!encodedExam) {
                const legacyExam = $page.url.searchParams.get('project')
                if (legacyExam) {
                    const migratedPayload = parseLegacyProjectExamPayload(legacyExam)
                    if (migratedPayload) {
                        await goto(createExamSessionLink(migratedPayload), { replaceState: true })
                        return
                    }
                }

                status = 'error'
                errorMessage = 'Exam link is missing or invalid.'
                return
            }

            const parsedPayload = decodeExamPayload(encodedExam)
            if (!parsedPayload) {
                status = 'error'
                errorMessage = 'Could not decode exam payload.'
                return
            }

            exam = parsedPayload

            if (parsedPayload.submission) {
                const unlockedSections = await resolveSectionsWithAccessPassword(parsedPayload)
                if (!unlockedSections) {
                    status = 'error'
                    errorMessage = 'Unable to unlock this exam.'
                    return
                }
                sections = unlockedSections
                examSubmission = normalizeExamSubmission($state.snapshot(parsedPayload.submission))
            } else {
                await initializeSnapshotStorage(encodedExam)

                const studentName = await Prompt.askText(
                    'Welcome to the exam! The app will go full screen soon.\n\nIF YOU EXIT FULL SCREEN OR CHANGE PAGE, YOUR EDITOR WILL BE DISABLED.\n\nPlease write your name to start the exam.',
                    false
                )
                if (typeof studentName !== 'string' || !studentName.trim()) {
                    status = 'error'
                    errorMessage = 'A student name is required to start the exam.'
                    return
                }

                examSubmission = {
                    name: studentName.trim(),
                    submissionTimestamp: 0,
                    startedAt: Date.now(),
                    hash: '',
                    fullscreenExitCount: 0,
                    answers: {}
                }
                examSubmission.hash = (
                    await makeHash(`${examSubmission.name}${examSubmission.startedAt}`)
                ).slice(0, 6)

                const unlockedSections = await resolveSectionsWithAccessPassword(parsedPayload)
                if (!unlockedSections) {
                    status = 'error'
                    errorMessage = 'Unable to unlock this exam.'
                    return
                }
                sections = unlockedSections
                examSubmission.answers = readExamSnapshot()?.answers ?? {}

                await startExam()
            }

            activeSectionId =
                parsedPayload.submission || !parsedPayload.instructions.trim()
                    ? (sections[0]?.id ?? '')
                    : ''
            initializeAnswers()
            status = 'loaded'
        } catch (e) {
            console.error(e)
            status = 'error'
            errorMessage = 'Unexpected error while loading the exam.'
        }
    }

    onMount(() => {
        loadExam()
        preloadAllEmulators()

        const intervalId = setInterval(() => {
            now = Date.now()
        }, 1000)

        return () => {
            clearInterval(intervalId)
            clearSnapshotDebounce()
            detachExamListeners()
        }
    })

    $effect(() => {
        if (!canPersistExamSnapshot()) return
        collectAnswers()
        scheduleExamSnapshotSave()
    })

    $effect(() => {
        if (status !== 'loaded') return
        if (timeoutSubmissionTriggered || isSubmitted) return
        if (remainingMs !== 0) return

        timeoutSubmissionTriggered = true
        void finishExam(true)
    })
</script>

<svelte:head>
    <title>{exam?.title || 'Exam Session'} - Asm Editor</title>
    <meta name="description" content="Take and review multi-section exams" />
</svelte:head>

<Page>
    {#if status === 'loading'}
        <div class="overlay">
            <h1 class="loading">Loading exam...</h1>
        </div>
    {/if}

    {#if status === 'error'}
        <div class="overlay">
            <h1 class="error">Failed to load exam</h1>
            <p>{errorMessage}</p>
            <Button onClick={() => goto('/exam')}>Back to exam builder</Button>
        </div>
    {/if}

    {#if status === 'loaded' && exam}
        {#if examDisabled && !submissionUrl}
            <div class="overlay">
                <h1 class="loading">Exam disabled</h1>
                <p>The exam was paused because you left fullscreen or changed tab.</p>
                <Row gap="1rem">
                    <Input
                        autoComplete="one-time-code"
                        type="password"
                        placeholder="Unlock password"
                        bind:value={unlockPasswordInput}
                    />
                    <Button onClick={unlockExam}>Unlock</Button>
                </Row>
                <Card padding="1rem 2rem" background="tertiary">
                    <Header type="h2">{examSubmission.name} ({examSubmission.hash})</Header>
                </Card>
            </div>
        {/if}

        {#if examDisabled && submissionUrl}
            <div class="overlay">
                <h1 class="loading">Exam Finished</h1>
                <p>
                    The submission link is in your clipboard. You can now share the submission link.
                    You can also copy it again if needed.
                </p>
                <Row gap="1rem">
                    <Input
                        autoComplete="one-time-code"
                        type="password"
                        placeholder="Unlock password"
                        bind:value={unlockPasswordInput}
                    />
                    <Button onClick={unlockExam}>Unlock</Button>
                </Row>
                <Button
                    onClick={async () => {
                        await navigator.clipboard.writeText(submissionUrl)
                        toast.logPill('Submission link copied to clipboard')
                    }}
                >
                    Copy submission link again
                </Button>
                <Button
                    onClick={async () => {
                        textDownloader(
                            submissionUrl,
                            `${examSubmission.name}-${examSubmission.hash}-submission-link.txt`
                        )
                    }}
                >
                    Download submission
                </Button>
                <Card padding="1rem 2rem" background="tertiary">
                    <Header type="h2">{examSubmission.name} ({examSubmission.hash})</Header>
                </Card>
            </div>
        {/if}

        <Column style="flex:1">
            <Card padding="0.6rem" background="secondary">
                <div class="session-header">
                    <div class="header-left">
                        <Header type="h2">{exam.title}</Header>
                        <p class="student-code">{examSubmission.hash}</p>
                        <p class="meta-line">
                            {examSubmission.name}
                            {#if isSubmitted && formattedSubmissionTime}
                                - Submitted on {formattedSubmissionTime}
                            {:else if remainingMs >= 0}
                                - {remainingTimeLabel} left
                            {/if}
                        </p>
                    </div>

                    <div class="header-controls">
                        {#if isReviewMode}
                            <Button
                                cssVar="accent"
                                hasIcon
                                onClick={() => (teacherAgentOpen = !teacherAgentOpen)}
                                title="Ask AI to review this result"
                                style="padding:0.4rem; width:2.4rem; height:2.4rem; margin-right: 0.4rem; border-radius: 1.5rem; border-bottom-right-radius: 0.4rem;"
                            >
                                <Icon>
                                    <SparklesIcon />
                                </Icon>
                            </Button>
                        {/if}
                        {#if activeSection?.type === ExamSectionType.AssemblyCoding}
                            {@const assemblySection = activeSection as AssemblyCodingSection}
                            <Button
                                cssVar="accent2"
                                hasIcon
                                onClick={() => (documentationVisible = !documentationVisible)}
                                title="Documentation"
                                style="padding:0.4rem; width:2.4rem; height:2.4rem; margin-right: 2rem;"
                            >
                                <Icon>
                                    <FaBook />
                                </Icon>
                            </Button>
                            <FloatingLanguageDocumentation
                                bind:visible={documentationVisible}
                                language={assemblySection.language}
                                disableLinks
                            />
                        {/if}
                        {#if exerciseProgressLabel}
                            <span style="font-size: 1.2rem; min-width: 3.2ch">
                                {exerciseProgressLabel}
                            </span>
                        {/if}
                        <Button
                            cssVar="secondary"
                            hasIcon
                            disabled={!canGoToPreviousSection}
                            onClick={goToPreviousSection}
                            title="Previous section"
                            style="padding:0.3rem; width:2.2rem; height:2.2rem"
                        >
                            <Icon>
                                <FaArrowLeft />
                            </Icon>
                        </Button>

                        <Button
                            cssVar="secondary"
                            hasIcon
                            disabled={!canGoToNextSection}
                            onClick={goToNextSection}
                            title="Next section"
                            style="padding:0.3rem; width:2.2rem; height:2.2rem"
                        >
                            <Icon>
                                <FaArrowRight />
                            </Icon>
                        </Button>
                        {#if !isReviewMode}
                            <Button
                                cssVar="accent"
                                disabled={!isOnLastSection || isSubmitted}
                                onClick={() => finishExam()}
                                style="margin-left: 0.4rem"
                            >
                                Finish exam
                            </Button>
                        {/if}
                    </div>
                </div>
            </Card>

            {#if isOnInstructions && hasInstructions}
                <Card padding="1rem" background="secondary" style="margin:0.5rem; flex:1;">
                    <Header type="h2">Instructions</Header>
                    <MarkdownRenderer source={exam.instructions} disableLinks />
                    <Row style="justify-content:flex-end; margin-top: auto">
                        <Button onClick={goToNextSection}>Start first section</Button>
                    </Row>
                </Card>
            {:else if activeSection}
                <Column style="flex:1">
                    {#if activeSection.type === ExamSectionType.AssemblyCoding}
                        {@const assemblySection = activeSection as AssemblyCodingSection}
                        {#key `${assemblySection.id}-${assemblySection.language}`}
                            <EmulatorLoader
                                bind:code={assemblyAnswers[assemblySection.id]}
                                language={assemblySection.language}
                            >
                                {#snippet children(emulator)}
                                    <ProjectEditor
                                        readonly={examDisabled}
                                        {emulator}
                                        name={assemblySection.title || 'Assembly section'}
                                        language={assemblySection.language}
                                        bind:code={assemblyAnswers[assemblySection.id]}
                                        testcases={assemblySection.testcases}
                                        embedded={true}
                                        canEditTestcases={false}
                                    >
                                        <MarkdownRenderer
                                            source={assemblySection.prompt}
                                            disableLinks
                                        />
                                    </ProjectEditor>
                                    {#if isReviewMode}
                                        <ExamReviewAgentSidebar
                                            bind:open={teacherAgentOpen}
                                            {exam}
                                            {sections}
                                            submission={examSubmission}
                                            activeSectionId={activeSection.id}
                                            visibleAnswer={activeVisibleAnswer}
                                            emulatorInstance={emulator}
                                        />
                                    {/if}
                                {/snippet}
                                {#snippet loading()}
                                    <Header>Loading emulator...</Header>
                                {/snippet}
                            </EmulatorLoader>
                        {/key}
                    {:else}
                        <div class="non-assembly-layout">
                            <div class="prompt-pane">
                                <MarkdownRenderer source={activeSection.prompt} disableLinks />
                            </div>

                            <div class="answer-pane">
                                {#if activeSection.type === ExamSectionType.OpenQuestion}
                                    {@const openSection = activeSection as OpenQuestionSection}
                                    <Header type="h2">Your answer</Header>
                                    <textarea
                                        placeholder={openSection.placeholder}
                                        bind:value={openAnswers[openSection.id]}
                                        readonly={isReviewMode || examDisabled}
                                        onkeydown={(e) => handleOpenAnswerKeydown(e, openSection)}
                                    ></textarea>
                                {:else if activeSection.type === ExamSectionType.MultipleChoice}
                                    {@const mcSection = activeSection as MultipleChoiceSection}
                                    <Column gap="0.5rem">
                                        <Header type="h2">
                                            {mcSection.allowMultiple
                                                ? 'Select all that apply'
                                                : 'Select one option'}
                                        </Header>
                                        {#each mcSection.options as option}
                                            <label class="option-row">
                                                <input
                                                    disabled={examDisabled}
                                                    type={mcSection.allowMultiple
                                                        ? 'checkbox'
                                                        : 'radio'}
                                                    name={`mc-${mcSection.id}`}
                                                    checked={(
                                                        multipleChoiceAnswers[mcSection.id] ?? []
                                                    ).includes(option.id)}
                                                    style={isReviewMode || examDisabled
                                                        ? 'pointer-events:none;'
                                                        : ''}
                                                    onchange={(e) => {
                                                        selectOption(
                                                            mcSection,
                                                            option.id,
                                                            (e.target as HTMLInputElement).checked
                                                        )
                                                    }}
                                                />
                                                <span>{option.text}</span>
                                            </label>
                                        {/each}
                                    </Column>
                                {:else if activeSection.type === ExamSectionType.CCoding}
                                    {@const cSection = activeSection as CCodingSection}
                                    <Header type="h2">Your answer</Header>
                                    <div class="c-editor-wrap">
                                        <Editor
                                            language="c"
                                            bind:code={cAnswers[cSection.id]}
                                            disabled={examDisabled}
                                        />
                                    </div>
                                {/if}
                            </div>
                        </div>
                        {#if isReviewMode}
                            <ExamReviewAgentSidebar
                                bind:open={teacherAgentOpen}
                                {exam}
                                {sections}
                                submission={examSubmission}
                                activeSectionId={activeSection.id}
                                visibleAnswer={activeVisibleAnswer}
                                emulatorInstance={null}
                            />
                        {/if}
                    {/if}
                </Column>
            {/if}
        </Column>
    {/if}
</Page>

<style lang="scss">
    .session-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
    }

    .header-left {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
    }

    .header-controls {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        margin-left: auto;
    }

    .student-code {
        font-weight: 600;
        background-color: color-mix(in srgb, var(--accent) 25%, transparent);
        border: solid 0.1rem color-mix(in srgb, var(--accent) 65%, transparent);
        border-radius: 0.35rem;
        padding: 0.25rem 0.45rem;
        width: fit-content;
        font-size: 0.9rem;
    }

    .overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(0.45rem);
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        gap: 1rem;
        z-index: 12;
        padding: 1rem;
        text-align: center;
    }
    .loading {
        font-size: 2.6rem;
    }

    .error {
        color: var(--red);
        font-size: 2rem;
    }

    .meta-line {
        color: var(--secondary-text);
        opacity: 0.9;
        font-size: 0.95rem;
    }
    .meta-line {
        padding: 0.35rem 0.45rem;
    }

    textarea {
        width: 100%;
        height: 100%;
        border-radius: 0.5rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        padding: 0.8rem;
        font-family: 'Fira Mono', monospace;
        resize: vertical;
    }

    .option-row {
        display: flex;
        gap: 0.6rem;
        align-items: center;
        padding: 0.5rem;
        border-radius: 0.5rem;
        background-color: var(--secondary);
    }
    .non-assembly-layout {
        display: grid;
        padding: 0.5rem;
        grid-template-columns: minmax(14rem, 0.95fr) minmax(0, 1.35fr);
        gap: 0.8rem;
        height: 100%;
        min-height: calc(var(--screen-height) * 0.5);
    }

    .prompt-pane {
        overflow: auto;
        border-radius: 0.5rem;
        padding: 0.6rem;
        background-color: var(--secondary);
    }

    .answer-pane {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }

    .c-editor-wrap {
        display: flex;
        flex-direction: column;
        height: 100%;
        position: relative;
        border-radius: 0.5rem;
        overflow: hidden;
        border: solid 0.1rem var(--border-color-dark);
    }

    @media (max-width: 840px) {
        .header-controls {
            width: 100%;
            justify-content: flex-end;
        }

        .non-assembly-layout {
            grid-template-columns: 1fr;
            min-height: 0;
        }

        .c-editor-wrap {
            min-height: calc(var(--screen-height) * 0.4);
        }
    }
</style>
