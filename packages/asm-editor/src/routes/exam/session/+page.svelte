<script lang="ts">
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import { browser } from '$app/env'
    import { page } from '$app/state'
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'
    import Page from '#cmp/shared/layout/Page.svelte'
    import Column from '#cmp/shared/layout/Column.svelte'
    import Row from '#cmp/shared/layout/Row.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import ErrorState from '#cmp/shared/layout/ErrorState.svelte'
    import TextField from '#cmp/shared/input/TextField.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import MarkdownRenderer from '#cmp/shared/markdown/MarkdownRenderer.svelte'
    import Editor from '#cmp/specific/project/Editor.svelte'
    import ExamAssemblySection from '#cmp/specific/exam/ExamAssemblySection.svelte'
    import {
        createExamSessionLink,
        decodeExamPayload,
        ExamSectionType,
        examSessionPath,
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
    } from '#lib/exam.ts'

    import { copyText, makeHash, textDownloader } from '#lib/utils.ts'
    import { createDebouncer } from '#lib/debounce.ts'
    import { serializer } from '#lib/json.ts'
    import { toast } from '#stores/toastStore.ts'
    import { Prompt } from '#stores/promptStore.svelte.ts'
    import { onMount, tick } from 'svelte'
    import FaArrowLeft from '~icons/fa-solid/arrow-left'
    import FaArrowRight from '~icons/fa-solid/arrow-right'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import ExamReviewAgentSidebar from '#cmp/specific/exam/ExamReviewAgentSidebar.svelte'
    import ExamReviewAgent from '#cmp/specific/exam/ExamReviewAgent.svelte'
    import { AI_FEATURES_ENABLED } from '#lib/Config.ts'
    import type { Emulator } from '#lib/languages/Emulator.ts'
    import SparklesIcon from '#cmp/shared/agent/SparklesIcon.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { preloadAllEmulators } from '#lib/languages/Emulator.ts'

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
    /** What went wrong when the failure was the page's own rather than the link's, to report. */
    let loadError = $state<unknown>(undefined)
    let activeSectionId = $state('')
    let examDisabled = $state(false)
    let unlockPasswordInput = $state('')
    let submissionUrl = $state('')

    /**
     * The session is inert under the "Exam disabled" and "Exam Finished" notices, which would leave
     * focus on the page's body when one opens and again when Unlock closes it: the notice's unlock
     * field takes focus when it opens (`focus`), and what had it before, or the session itself, gets
     * it back once the exam is unlocked.
     */
    let sessionElement = $state<HTMLElement>()
    let focusBeforeDisabled: HTMLElement | null = null
    let disabledShown = false
    //before the notice is drawn and the session made inert, while what has focus still has it
    $effect.pre(() => {
        if (!examDisabled || disabledShown) return
        disabledShown = true
        const active = document.activeElement
        focusBeforeDisabled =
            active instanceof HTMLElement && active !== document.body ? active : null
    })
    $effect(() => {
        if (examDisabled || !disabledShown) return
        disabledShown = false
        const target = focusBeforeDisabled?.isConnected ? focusBeforeDisabled : sessionElement
        focusBeforeDisabled = null
        target?.focus({ preventScroll: true })
    })

    /** The panel open in an assembly section's Workbench; the header's AI button opens the review agent there. */
    let assemblyPanel = $state<string | null>(null)

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
        //a finished exam had its guards taken off, and the student goes back to answering under them
        attachExamListeners()
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

    /**
     * The guards an exam runs under. A listener added twice is added once, so unlocking an exam that
     * was only paused, and kept them, changes nothing.
     */
    function attachExamListeners() {
        document.addEventListener('visibilitychange', listenVisibilityChange)
        document.addEventListener('fullscreenchange', listenFullscreenChange)
        window.addEventListener('blur', listenVisibilityChange)
        window.addEventListener('keydown', preventDefaultKeyPresses)
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
        attachExamListeners()
        await requestExamFullscreen()
    }

    async function finishExam(autoSubmit = false) {
        if (!exam || isSubmitted) return

        if (!autoSubmit) {
            const wantsToFinish = await Prompt.confirm(
                'Do you want to finish the exam? You will not be able to edit the answers anymore.'
            )
            if (wantsToFinish === null) return
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
            if (accessPassword === null) return null
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
            const encodedExam = page.url.searchParams.get('exam')
            if (!encodedExam) {
                const legacyExam = page.url.searchParams.get('project')
                if (legacyExam) {
                    const migratedPayload = parseLegacyProjectExamPayload(legacyExam)
                    if (migratedPayload) {
                        await goto(resolve(examSessionPath(migratedPayload)), { replace: true })
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
                if (studentName === null) {
                    status = 'error'
                    errorMessage = 'Exam start cancelled.'
                    return
                }
                if (!studentName.trim()) {
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
                ).slice(0, 4)

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
            loadError = e
        }
    }

    onMount(() => {
        void loadExam()
        //a warm-up: a Core that fails here loads again, and says why, when a section first needs it
        preloadAllEmulators().catch((error) =>
            console.warn('Could not preload the emulators', error)
        )

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
    <title>{exam?.title || 'Exam Session'} - ASM Editor</title>
    <meta name="description" content="Take and review multi-section exams" />
</svelte:head>

{#snippet reviewAgent(emulator: Emulator)}
    {#if exam && activeSection}
        <ExamReviewAgent
            {exam}
            {sections}
            submission={examSubmission}
            activeSectionId={activeSection.id}
            visibleAnswer={activeVisibleAnswer}
            emulatorInstance={emulator}
            style="border-radius: 0; border: none; box-shadow: none; flex: 1; min-height: 0;"
        />
    {/if}
{/snippet}

<Page fillsScreen>
    {#if status === 'loading'}
        <div class="overlay">
            <Spinner size="lg" label="Loading exam…" />
            {#if examSubmission.hash}
                <p class="student-code">{examSubmission.hash}</p>
            {:else}
                <p style="height: 28.8px"></p>
            {/if}
        </div>
    {/if}

    {#if status === 'error'}
        <div class="failure">
            <ErrorState
                title="This exam didn't open"
                error={loadError}
                reload={loadError !== undefined}
            >
                {errorMessage}
                {#snippet actions()}
                    <Button
                        kind={loadError !== undefined ? 'secondary' : 'primary'}
                        onClick={() => goto(resolve('/exam'))}
                    >
                        Back to exam builder
                    </Button>
                {/snippet}
            </ErrorState>
        </div>
    {/if}

    {#if status === 'loaded' && exam}
        {@const loadedExam = exam}
        {#if examDisabled && !submissionUrl}
            <div class="overlay scrim">
                <Header noMargin>Exam disabled</Header>
                <p>The exam was paused because you left fullscreen or changed tab.</p>
                <Row gap="1rem">
                    <TextField
                        focus
                        autocomplete="one-time-code"
                        type="password"
                        aria-label="Unlock password"
                        placeholder="Unlock password"
                        bind:value={unlockPasswordInput}
                    />
                    <Button onClick={unlockExam}>Unlock</Button>
                </Row>
                <Card padding="1rem 2rem">
                    <Header type="h2" style="font-size: var(--fs-h3)"
                        >{examSubmission.name} ({examSubmission.hash})</Header
                    >
                </Card>
            </div>
        {/if}

        {#if examDisabled && submissionUrl}
            <div class="overlay scrim">
                <Header noMargin>Exam Finished</Header>
                <p>
                    The submission link is in your clipboard. You can now share the submission link.
                    You can also copy it again if needed.
                </p>
                <Row gap="1rem">
                    <TextField
                        focus
                        autocomplete="one-time-code"
                        type="password"
                        aria-label="Unlock password"
                        placeholder="Unlock password"
                        bind:value={unlockPasswordInput}
                    />
                    <Button onClick={unlockExam}>Unlock</Button>
                </Row>
                <Button onClick={() => copyText(submissionUrl, 'Submission link')}>
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
                <Card padding="1rem 2rem">
                    <Header type="h2" style="font-size: var(--fs-h3)"
                        >{examSubmission.name} ({examSubmission.hash})</Header
                    >
                </Card>
            </div>
        {/if}

        <!-- blocked while the exam is disabled, its notice standing in for the page -->
        <div class="exam-session" inert={examDisabled} tabindex="-1" bind:this={sessionElement}>
            <Card padding="0.6rem" style="flex: none;">
                <div class="session-header">
                    <div class="header-left">
                        <!-- the page's title, the exam's, at the size of the session's other headings
                             (--fs-h3) rather than a page title's, so the bar it heads stays one line -->
                        <Header
                            noMargin
                            style="font-size: var(--fs-h3); line-height: normal; letter-spacing: normal;"
                        >
                            {loadedExam.title}
                        </Header>
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
                        {#if isReviewMode && AI_FEATURES_ENABLED}
                            <Button
                                onClick={() => {
                                    //an assembly section shows the agent as a panel of its Workbench
                                    if (activeSection?.type === ExamSectionType.AssemblyCoding) {
                                        assemblyPanel = assemblyPanel === 'review' ? null : 'review'
                                    } else {
                                        teacherAgentOpen = !teacherAgentOpen
                                    }
                                }}
                                {@attach tooltip('Ask AI to review this result')}
                                aria-label="Ask AI"
                                class="ask-ai"
                            >
                                <Icon>
                                    <SparklesIcon />
                                </Icon>
                            </Button>
                        {/if}
                        {#if exerciseProgressLabel}
                            <span style="font-size: var(--fs-lead); min-width: 3.2ch">
                                {exerciseProgressLabel}
                            </span>
                        {/if}
                        <IconButton
                            disabled={!canGoToPreviousSection}
                            onClick={goToPreviousSection}
                            {@attach tooltip('Previous section')}
                            label="Previous section"
                            size="lg"
                        >
                            <Icon>
                                <FaArrowLeft />
                            </Icon>
                        </IconButton>

                        <IconButton
                            disabled={!canGoToNextSection}
                            onClick={goToNextSection}
                            {@attach tooltip('Next section')}
                            label="Next section"
                            size="lg"
                        >
                            <Icon>
                                <FaArrowRight />
                            </Icon>
                        </IconButton>
                        {#if !isReviewMode}
                            <Button
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
                <Card padding="1rem" style="margin:0.5rem; flex:1; min-height:0; overflow:auto;">
                    <Header type="h2" style="font-size: var(--fs-h3)">Instructions</Header>
                    <MarkdownRenderer source={loadedExam.instructions} disableLinks monacoColors />
                    <Row style="justify-content:flex-end; margin-top: auto">
                        <Button onClick={goToNextSection}>Start first section</Button>
                    </Row>
                </Card>
            {:else if activeSection}
                <Column style="flex:1; min-height: 0;">
                    {#if activeSection.type === ExamSectionType.AssemblyCoding}
                        {@const assemblySection = activeSection as AssemblyCodingSection}
                        {#key `${assemblySection.id}-${assemblySection.language}`}
                            <ExamAssemblySection
                                section={assemblySection}
                                bind:code={assemblyAnswers[assemblySection.id]}
                                bind:activePanel={assemblyPanel}
                                readonly={examDisabled}
                                review={isReviewMode && AI_FEATURES_ENABLED
                                    ? reviewAgent
                                    : undefined}
                            >
                                {#snippet prompt()}
                                    <MarkdownRenderer
                                        source={assemblySection.prompt}
                                        disableLinks
                                        monacoColors
                                    />
                                {/snippet}
                            </ExamAssemblySection>
                        {/key}
                    {:else}
                        <div class="non-assembly-layout">
                            <Card class="prompt-pane" padding="0.6rem">
                                <MarkdownRenderer
                                    source={activeSection.prompt}
                                    disableLinks
                                    monacoColors
                                />
                            </Card>

                            <div class="answer-pane">
                                {#if activeSection.type === ExamSectionType.OpenQuestion}
                                    {@const openSection = activeSection as OpenQuestionSection}
                                    <Header type="h2" style="font-size: var(--fs-h3)"
                                        >Your answer</Header
                                    >
                                    <textarea
                                        placeholder={openSection.placeholder}
                                        bind:value={openAnswers[openSection.id]}
                                        readonly={isReviewMode || examDisabled}
                                        onkeydown={(e) => handleOpenAnswerKeydown(e, openSection)}
                                    ></textarea>
                                {:else if activeSection.type === ExamSectionType.MultipleChoice}
                                    {@const mcSection = activeSection as MultipleChoiceSection}
                                    <Column gap="0.5rem">
                                        <Header type="h2" style="font-size: var(--fs-h3)">
                                            {mcSection.allowMultiple
                                                ? 'Select all that apply'
                                                : 'Select one option'}
                                        </Header>
                                        {#each mcSection.options as option (option.id)}
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
                                    <Header type="h2" style="font-size: var(--fs-h3)"
                                        >Your answer</Header
                                    >
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
                        {#if isReviewMode && AI_FEATURES_ENABLED}
                            <ExamReviewAgentSidebar
                                bind:open={teacherAgentOpen}
                                exam={loadedExam}
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
        </div>
    {/if}
</Page>

<style lang="scss">
    @use '../../../styles/field.scss';

    /* focused only to give focus back after an unlock, when nothing in it had it: no ring round
       the whole page */
    .exam-session:focus {
        outline: none;
    }

    .exam-session {
        display: flex;
        flex-direction: column;
        flex: none;
        height: var(--screen-height);
        min-height: 0;
        overflow: hidden;
    }

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
        border: 1px solid color-mix(in srgb, var(--accent) 65%, transparent);
        border-radius: 0.35rem;
        padding: 0.25rem 0.45rem;
        width: fit-content;
        font-size: var(--fs-small);
    }

    /* Ask AI's speech bubble, as the chat page's toggle draws it */
    .header-controls :global(.btn.ask-ai) {
        padding: 0.4rem;
        width: 2.4rem;
        height: 2.4rem;
        margin-right: 0.4rem;
        border-radius: 1.5rem 1.5rem 0.4rem 1.5rem;
    }

    .failure {
        position: fixed;
        inset: 0;
        z-index: 12;
        display: flex;
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

    /* over the exam it blocks, which it dims as well as blurs; the loading one covers an empty
       page and is no scrim */
    .overlay.scrim {
        background-color: var(--scrim);
    }

    .meta-line {
        color: var(--text-muted);
        font-size: var(--fs-body);
    }
    .meta-line {
        padding: 0.35rem 0.45rem;
    }

    /* an answer typed in the field look (styles/field.scss), in code's font */
    textarea {
        @include field.input;
        width: 100%;
        height: 100%;
        padding: 0.8rem;
        font-family: var(--font-mono);
        resize: vertical;
    }

    .option-row {
        display: flex;
        gap: 0.6rem;
        align-items: center;
        padding: 0.5rem;
        border-radius: var(--r-control);
        background-color: var(--secondary);
    }
    .non-assembly-layout {
        display: grid;
        flex: 1;
        padding: 0.5rem;
        grid-template-columns: minmax(14rem, 0.95fr) minmax(0, 1.35fr);
        grid-template-rows: minmax(0, 1fr);
        gap: 0.8rem;
        min-height: 0;
    }

    /* a Card (shared/layout/Card.svelte) that scrolls inside */
    .non-assembly-layout :global(.prompt-pane) {
        overflow: auto;
    }

    .answer-pane {
        min-height: 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        overflow: auto;
    }

    .c-editor-wrap {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        position: relative;
        border-radius: var(--r-control);
        overflow: hidden;
        border: 1px solid var(--line);
    }

    @media (max-width: 840px) {
        .header-controls {
            width: 100%;
            justify-content: flex-end;
        }

        .non-assembly-layout {
            grid-template-columns: 1fr;
            grid-template-rows: repeat(2, minmax(0, 1fr));
        }
    }
</style>
