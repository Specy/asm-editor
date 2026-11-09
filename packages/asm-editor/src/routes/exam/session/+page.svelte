<script lang="ts">
    /**
     * An exam session (CONTEXT.md, Exam): a start Card that says what the exam's guards do and
     * asks for the student's name (and the access password, when the exam has one), then the
     * exam one part at a time, the instructions and each section, under a slim bar with the
     * title, the student, the parts as dots with Previous and Next round their count, the time
     * left and Finish exam. A coding section's answer is the Workbench (docs/design/workbench.md)
     * beside its prompt, which folds away to give it the width; the others answer in fields under
     * theirs.
     */
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import { browser } from '$app/env'
    import { page } from '$app/state'
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'
    import Page from '#cmp/shared/layout/Page.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import CopyButton from '#cmp/shared/button/CopyButton.svelte'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import ErrorState from '#cmp/shared/layout/ErrorState.svelte'
    import TextField from '#cmp/shared/input/TextField.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import Form from '#cmp/shared/layout/Form.svelte'
    import MarkdownRenderer from '#cmp/shared/markdown/MarkdownRenderer.svelte'
    import Editor from '#cmp/specific/project/Editor.svelte'
    import ExamAssemblySection from '#cmp/specific/exam/ExamAssemblySection.svelte'
    import { sectionTypeLabel } from '#cmp/specific/exam/examBuilder.ts'
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
    import { MediaQuery } from 'svelte/reactivity'
    import FaClock from '~icons/fa-regular/clock'
    import FaExpand from '~icons/fa-solid/expand'
    import FaLock from '~icons/fa-solid/lock'
    import FaLink from '~icons/fa-solid/link'
    import FaHourglass from '~icons/fa-solid/hourglass-half'
    import FaChevronLeft from '~icons/fa-solid/chevron-left'
    import FaChevronRight from '~icons/fa-solid/chevron-right'
    import FaAngleDoubleLeft from '~icons/fa-solid/angle-double-left'
    import FaAngleDoubleRight from '~icons/fa-solid/angle-double-right'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import { AI_FEATURES_ENABLED } from '#lib/Config.ts'
    import type { Emulator } from '#lib/languages/Emulator.ts'
    import SparklesIcon from '#cmp/shared/agent/SparklesIcon.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { preloadAllEmulators } from '#lib/languages/Emulator.ts'

    const EXAM_SESSION_SNAPSHOT_VERSION = 1
    const EXAM_SESSION_SNAPSHOT_PREFIX = 'asm-editor_exam_session_snapshot:'
    /** The time left from which the timer is drawn in the warning colour. */
    const LOW_TIME_MS = 5 * 60_000

    type StoredExamSessionSnapshot = {
        version: number
        sourceHash: string
        savedAt: number
        answers: Record<string, ExamSectionAnswer>
    }

    /** One page of the session: the instructions (`id` empty) or a section. */
    type ExamPart = { id: string; section?: ExamSection; number: number }

    let exam = $state<ExamPayload | null>(null)
    let sections = $state([] as ExamSection[])
    /** `start`: the start Card waits for the student's name, or a reviewer's access password. */
    let status: 'loading' | 'start' | 'loaded' | 'error' = $state('loading')
    let errorMessage = $state('Invalid exam link.')
    /** What went wrong when the failure was the page's own rather than the link's, to report. */
    let loadError = $state<unknown>(undefined)
    let activeSectionId = $state('')
    let examDisabled = $state(false)
    let unlockPasswordInput = $state('')
    let submissionUrl = $state('')
    /** Whether finishing put the submission link in the clipboard, which the notice then says. */
    let submissionCopied = $state(false)

    //the start Card's fields, and what is wrong with them after a press of Start exam
    let nameInput = $state('')
    let accessPasswordInput = $state('')
    let nameError = $state('')
    let accessPasswordError = $state('')
    let starting = $state(false)
    let nameField = $state<HTMLInputElement>()
    let accessPasswordField = $state<HTMLInputElement>()

    /**
     * The session is inert under the "Exam disabled" and "Exam finished" notices, which would leave
     * focus on the page's body when one opens and again when Unlock closes it: the notice takes
     * focus when it opens (its unlock field, or Copy submission link), and what had it before, or
     * the session itself, gets it back once the exam is unlocked.
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

    /** The panel open in an assembly section's Workbench; the bar's AI button opens the review agent there. */
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
    let partElement = $state<HTMLElement>()
    let pagerElement = $state<HTMLElement>()
    let dotsElement = $state<HTMLElement>()
    /** Whether the dots run past their strip, before its start and past its end: those ends fade. */
    let dotsBefore = $state(false)
    let dotsAfter = $state(false)

    /**
     * The coding section whose question is folded to a strip beside (on a phone, over) the answer,
     * until the student moves to another part: every part opens on its question, the first one
     * and one gone back to alike (owner, 2026-11-08).
     */
    let foldedPrompt = $state<string | null>(null)
    /** The question's Hide button and the strip that shows it again, which take the focus in turn. */
    let promptHideButton = $state<HTMLElement>()
    let promptStripButton = $state<HTMLButtonElement>()
    /**
     * Whether the question is over its answer rather than beside it (the styles' 900px), where the
     * strip is a bar across the top and its Tooltip goes under it: at its right, with no room
     * there, it would slide over the bar under the pointer.
     */
    const promptStacked = new MediaQuery('max-width: 900px', false)

    /** Folds a section's question away or shows it again; the focus goes to what undoes it. */
    async function setPromptFolded(sectionId: string, folded: boolean) {
        foldedPrompt = folded ? sectionId : null
        await tick()
        ;(folded ? promptStripButton : promptHideButton)?.focus()
    }

    function measureDots() {
        if (!dotsElement) return
        const { scrollLeft, scrollWidth, clientWidth } = dotsElement
        dotsBefore = scrollLeft > 1
        dotsAfter = scrollLeft + clientWidth < scrollWidth - 1
    }
    const [debouncedSaveSnapshot, clearSnapshotDebounce] = createDebouncer(250)
    const activeSection = $derived(sections.find((section) => section.id === activeSectionId))
    const activeVisibleAnswer = $derived(
        activeSection ? collectAnswerForSection(activeSection) : null
    )
    const activeSectionIndex = $derived(getSectionIndex(activeSectionId))
    const isReviewMode = $derived(!!exam?.submission)
    const hasInstructions = $derived(!!exam?.instructions.trim() && !isReviewMode)
    const isOnInstructions = $derived(hasInstructions && activeSectionId === '')
    const isCodingSection = $derived(
        activeSection?.type === ExamSectionType.AssemblyCoding ||
            activeSection?.type === ExamSectionType.CCoding
    )

    /** The pages the dots stand for, the instructions first when there are any. */
    const parts = $derived<ExamPart[]>([
        ...(hasInstructions ? [{ id: '', number: 0 }] : []),
        ...sections.map((section, index) => ({ id: section.id, section, number: index + 1 }))
    ])
    const activePartIndex = $derived(parts.findIndex((part) => part.id === activeSectionId))

    const canGoToPreviousSection = $derived(activePartIndex > 0 && !examDisabled)
    const canGoToNextSection = $derived(
        activePartIndex >= 0 && activePartIndex + 1 < parts.length && !examDisabled
    )

    /** Where Previous and Next lead, which their Tooltips say; nothing at either end. */
    const previousPartLabel = $derived(
        canGoToPreviousSection ? `Go to ${partLabel(parts[activePartIndex - 1])}` : ''
    )
    const nextPartLabel = $derived(
        canGoToNextSection ? `Go to ${partLabel(parts[activePartIndex + 1])}` : ''
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
    const isTimeLow = $derived(remainingMs >= 0 && remainingMs <= LOW_TIME_MS)
    /** What a screen reader hears when another part opens, the dots and the pager keeping focus. */
    const partAnnouncement = $derived(
        isOnInstructions
            ? 'Instructions'
            : activeSection
              ? `Section ${activeSectionIndex + 1} of ${sections.length}, ${sectionTypeLabel(activeSection.type)}`
              : ''
    )

    function formatRemainingTime(milliseconds: number) {
        if (milliseconds < 0) return ''
        const totalSeconds = Math.ceil(milliseconds / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }

    /** A time limit in words, for the start Card. */
    function formatTimeLimit(milliseconds: number) {
        const minutes = Math.max(1, Math.round(milliseconds / 60_000))
        return minutes === 1 ? '1 minute' : `${minutes} minutes`
    }

    /** A part as its heading reads: "Instructions", or "Section 2 · Multiple choice". */
    function partLabel(part: ExamPart) {
        return part.section
            ? `Section ${part.number} · ${sectionTypeLabel(part.section.type)}`
            : 'Instructions'
    }

    function getSectionIndex(sectionId: string) {
        return sections.findIndex((section) => section.id === sectionId)
    }

    /** Whether the student has given an answer: some text, a choice, or code changed from the start. */
    function isAnswered(section: ExamSection) {
        if (section.type === ExamSectionType.OpenQuestion) {
            return !!(openAnswers[section.id] ?? '').trim()
        }
        if (section.type === ExamSectionType.MultipleChoice) {
            return (multipleChoiceAnswers[section.id] ?? []).length > 0
        }
        const code =
            section.type === ExamSectionType.AssemblyCoding
                ? assemblyAnswers[section.id]
                : cAnswers[section.id]
        return (code ?? section.starterCode).trim() !== section.starterCode.trim()
    }

    function goToPart(index: number) {
        const part = parts[index]
        if (!part || examDisabled) return
        activeSectionId = part.id
        foldedPrompt = null
    }

    /**
     * After Previous or Next: a button that the move disabled (Previous on the first part, Next on
     * the last) gave its focus to the page's body, so it goes to the pager's other button, and not
     * on to Finish exam, which a second press of Enter would then open.
     */
    async function keepPagerFocus() {
        await tick()
        const active = document.activeElement
        if (!pagerElement || !(active === document.body || (active as HTMLButtonElement)?.disabled))
            return
        const enabled = pagerElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        enabled[enabled.length - 1]?.focus()
    }

    function goToPreviousSection() {
        goToPart(activePartIndex - 1)
        void keepPagerFocus()
    }

    function goToNextSection() {
        goToPart(activePartIndex + 1)
        void keepPagerFocus()
    }

    //another part opens at its top, and its dot, when they scroll, is in view
    $effect(() => {
        void activeSectionId
        if (partElement) partElement.scrollTop = 0
        const dot = dotsElement?.querySelector<HTMLElement>('.current')
        if (dotsElement && dot) {
            dotsElement.scrollLeft =
                dot.offsetLeft - (dotsElement.clientWidth - dot.offsetWidth) / 2
        }
        measureDots()
    })

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
        if (isReviewMode || examDisabled) return
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

    function unlockOnEnter(event: KeyboardEvent) {
        if (event.key !== 'Enter') return
        event.preventDefault()
        void unlockExam()
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
            const unanswered = sections.filter((section) => !isAnswered(section)).length
            const warning =
                unanswered === 0
                    ? ''
                    : unanswered === 1
                      ? 'One section has no answer yet. '
                      : `${unanswered} sections have no answer yet. `
            const wantsToFinish = await Prompt.confirm(
                `${warning}Do you want to finish the exam? You will not be able to edit the answers anymore.`
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
            submissionCopied = true
            toast.logPill('Submission link copied to clipboard')
        } catch (e) {
            console.error(e)
            submissionCopied = false
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

    /**
     * The exam's sections, opened with the access password when it has one; or what is wrong with
     * the password, said under its field.
     */
    async function resolveSectionsWithAccessPassword(
        payload: ExamPayload,
        accessPassword: string
    ): Promise<ExamSection[] | string> {
        if (!payload.accessPasswordHash) return payload.sections
        if (!accessPassword) return 'Write the exam access password.'
        const hash = (await makeHash(accessPassword)).slice(0, 6)
        if (hash !== payload.accessPasswordHash) return 'Wrong access password.'
        try {
            return await unlockExamSections(payload, accessPassword)
        } catch (e) {
            console.error(e)
            return 'Unable to unlock the exam with this password.'
        }
    }

    /** The exam on its first part, the instructions when it has some and is not a review. */
    function openSession() {
        if (!exam) return
        activeSectionId =
            exam.submission || !exam.instructions.trim() ? (sections[0]?.id ?? '') : ''
        initializeAnswers()
        status = 'loaded'
    }

    /** The start Card's Start exam (or, for a review behind an access password, Open submission). */
    async function beginExam() {
        if (!exam || starting) return
        const review = !!exam.submission
        nameError = ''
        accessPasswordError = ''
        const name = nameInput.trim()
        if (!review && !name) {
            nameError = 'Write your name to start the exam.'
            nameField?.focus()
            return
        }
        starting = true
        try {
            const unlockedSections = await resolveSectionsWithAccessPassword(
                exam,
                accessPasswordInput
            )
            if (typeof unlockedSections === 'string') {
                accessPasswordError = unlockedSections
                accessPasswordField?.focus()
                accessPasswordField?.select()
                return
            }
            sections = unlockedSections
            if (exam.submission) {
                examSubmission = normalizeExamSubmission($state.snapshot(exam.submission))
            } else {
                examSubmission = {
                    name,
                    submissionTimestamp: 0,
                    startedAt: Date.now(),
                    hash: '',
                    fullscreenExitCount: 0,
                    answers: {}
                }
                examSubmission.hash = (
                    await makeHash(`${examSubmission.name}${examSubmission.startedAt}`)
                ).slice(0, 4)
                examSubmission.answers = readExamSnapshot()?.answers ?? {}
                //still within the press of the button, which full screen needs
                await startExam()
            }
            openSession()
        } catch (e) {
            console.error(e)
            status = 'error'
            errorMessage = 'Unexpected error while starting the exam.'
            loadError = e
        } finally {
            starting = false
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

            if (parsedPayload.encryptedSections && !parsedPayload.accessPasswordHash) {
                status = 'error'
                errorMessage = 'Unable to unlock this exam: it needs an access password.'
                return
            }

            if (parsedPayload.submission) {
                //a reviewer gives the access password on the start Card; without one it opens
                if (parsedPayload.accessPasswordHash) {
                    status = 'start'
                    return
                }
                sections = parsedPayload.sections
                examSubmission = normalizeExamSubmission($state.snapshot(parsedPayload.submission))
                openSession()
                return
            }

            await initializeSnapshotStorage(encodedExam)
            status = 'start'
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
        window.addEventListener('resize', measureDots)

        return () => {
            clearInterval(intervalId)
            window.removeEventListener('resize', measureDots)
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

    /** Focus on what it is given as soon as it is drawn: the notice's first control. */
    function focusOnMount(element: HTMLElement) {
        element.focus()
    }
</script>

<svelte:head>
    <title>{exam?.title || 'Exam Session'} - ASM Editor</title>
    <meta name="description" content="Take and review multi-section exams" />
</svelte:head>

{#snippet reviewAgent(emulator: Emulator)}
    {#if exam && activeSection}
        <!-- the review assistant's code loads when it is shown -->
        {#await import('#cmp/specific/exam/ExamReviewAgent.svelte') then { default: ExamReviewAgent }}
            <ExamReviewAgent
                {exam}
                {sections}
                submission={examSubmission}
                activeSectionId={activeSection.id}
                visibleAnswer={activeVisibleAnswer}
                emulatorInstance={emulator}
                style="flex: 1; min-height: 0;"
            />
        {/await}
    {/if}
{/snippet}

<!-- the student, by name and the code that tells two attempts apart -->
{#snippet student()}
    <span class="student-name">{examSubmission.name}</span>
    <span class="student-code"><span class="visually-hidden">Code </span>{examSubmission.hash}</span
    >
{/snippet}

<!-- a section's header band: its number and type, its title muted at the right; a coding
     section's (`foldable`) has its title under them and, at its right, the button that folds the
     question away -->
{#snippet sectionHead(section: ExamSection, number: number, foldable = false)}
    <header class="part-head" class:foldable>
        <h2 id="exam-part-title" class="part-title">
            Section {number}
            <span class="part-type">· {sectionTypeLabel(section.type)}</span>
        </h2>
        {#if section.title?.trim()}
            <p class="part-name">{section.title}</p>
        {/if}
        {#if foldable}
            <IconButton
                label="Hide the question"
                class="prompt-hide"
                quiet
                aria-expanded="true"
                aria-controls="exam-prompt"
                bind:el={promptHideButton}
                onClick={() => setPromptFolded(section.id, true)}
                {@attach tooltip('Give the editor more room')}
            >
                <FaAngleDoubleLeft />
            </IconButton>
        {/if}
    </header>
{/snippet}

{#snippet promptCard(section: ExamSection, number: number)}
    <Card element="section" aria-labelledby="exam-part-title">
        {@render sectionHead(section, number)}
        <div class="part-body prompt-body">
            <MarkdownRenderer source={section.prompt} disableLinks monacoColors centered={false} />
        </div>
    </Card>
{/snippet}

<!-- a coding section's question: a panel of its own from the bar to the window's bottom at the
     left of its answer (over it on a phone), on the page's fill rather than a card, so that it
     does not read as part of the Workbench; or, folded, a strip as tall that shows it again from
     anywhere along it. The folded panel stays built, hidden, so it opens again where it was
     scrolled to -->
{#snippet promptColumn(section: ExamSection, number: number)}
    {@const folded = foldedPrompt === section.id}
    {#if folded}
        <button
            type="button"
            class="prompt-strip"
            aria-expanded="false"
            aria-controls="exam-prompt"
            bind:this={promptStripButton}
            onclick={() => setPromptFolded(section.id, false)}
            {@attach tooltip(
                `Section ${number} · ${sectionTypeLabel(section.type)}${section.title?.trim() ? `: ${section.title.trim()}` : ''}`,
                { placement: promptStacked.current ? 'bottom' : 'right' }
            )}
        >
            <FaAngleDoubleRight />
            <span class="strip-label">Show the question</span>
        </button>
    {/if}
    <section id="exam-prompt" class="prompt-panel" class:folded aria-labelledby="exam-part-title">
        {@render sectionHead(section, number, true)}
        <div class="part-body prompt-body">
            <MarkdownRenderer source={section.prompt} disableLinks monacoColors centered={false} />
        </div>
    </section>
{/snippet}

<Page fillsScreen>
    {#if status === 'loading' || status === 'start'}
        <!-- the start Card, in place of the browser's prompts: what the exam's guards do, then the
             student's name and the access password -->
        <div class="start-room">
            <Card
                element="section"
                class="start-card"
                aria-labelledby="exam-start-title"
                aria-busy={status === 'loading'}
            >
                <header class="card-head">
                    <h1 id="exam-start-title" class="start-title">{exam?.title || 'Exam'}</h1>
                    {#if exam?.submission}
                        <p class="start-subtitle">Submission of {exam.submission.name}</p>
                    {/if}
                </header>
                {#if status === 'loading' || !exam}
                    <div class="card-body start-loading">
                        <Spinner size="lg" label="Loading exam…" />
                    </div>
                {:else}
                    <Form onSubmit={beginExam}>
                        <div class="card-body">
                            {#if exam.submission}
                                <p class="start-text">
                                    Enter the exam access password to review this submission.
                                </p>
                            {:else}
                                <ul class="rules">
                                    <li>
                                        <div class="rule-icon">
                                            <Icon size="body"><FaExpand /></Icon>
                                        </div>
                                        <span>When you start, the page goes full screen.</span>
                                    </li>
                                    <li>
                                        <div class="rule-icon">
                                            <Icon size="body"><FaLock /></Icon>
                                        </div>
                                        <span>
                                            Leaving full screen, or switching to another tab or
                                            window, locks the editor. It stays locked until your
                                            teacher enters the unlock password.
                                        </span>
                                    </li>
                                    {#if exam.timeLimit > 0}
                                        <li>
                                            <div class="rule-icon">
                                                <Icon size="body"><FaHourglass /></Icon>
                                            </div>
                                            <span>
                                                You have {formatTimeLimit(exam.timeLimit)} from the moment
                                                you start. When the time is up, the exam is submitted
                                                on its own.
                                            </span>
                                        </li>
                                    {/if}
                                    <li>
                                        <div class="rule-icon">
                                            <Icon size="body"><FaLink /></Icon>
                                        </div>
                                        <span>
                                            When you finish, you get a submission link to send to
                                            your teacher.
                                        </span>
                                    </li>
                                </ul>
                                <div class="start-field">
                                    <TextField
                                        label="Your name"
                                        autocomplete="name"
                                        focus
                                        bind:el={nameField}
                                        bind:value={nameInput}
                                        invalid={!!nameError}
                                        aria-invalid={nameError ? 'true' : undefined}
                                        aria-describedby={nameError ? 'exam-name-error' : undefined}
                                    />
                                    {#if nameError}
                                        <p class="field-error" id="exam-name-error">{nameError}</p>
                                    {/if}
                                </div>
                            {/if}
                            {#if exam.accessPasswordHash}
                                <div class="start-field">
                                    <TextField
                                        label="Exam access password"
                                        concealed
                                        focus={!!exam.submission}
                                        bind:el={accessPasswordField}
                                        bind:value={accessPasswordInput}
                                        invalid={!!accessPasswordError}
                                        aria-invalid={accessPasswordError ? 'true' : undefined}
                                        aria-describedby={accessPasswordError
                                            ? 'exam-access-error'
                                            : undefined}
                                    />
                                    {#if accessPasswordError}
                                        <p class="field-error" id="exam-access-error">
                                            {accessPasswordError}
                                        </p>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                        <footer class="card-foot">
                            <Button type="submit" disabled={starting} aria-busy={starting}>
                                {#if starting}<Spinner />{/if}
                                {exam.submission ? 'Open submission' : 'Start exam'}
                            </Button>
                        </footer>
                    </Form>
                {/if}
            </Card>
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
                <Card
                    element="section"
                    class="notice"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="exam-notice-title"
                >
                    <header class="card-head">
                        <h1 id="exam-notice-title" class="notice-title">Exam disabled</h1>
                    </header>
                    <div class="card-body">
                        <p class="notice-text">
                            You left full screen or switched to another tab or window, so the editor
                            is locked. Ask your teacher to enter the unlock password.
                        </p>
                        <p class="notice-student">
                            {@render student()}
                            {#if remainingMs >= 0}
                                <span class="notice-time">{remainingTimeLabel} left</span>
                            {/if}
                        </p>
                        <div class="unlock-row">
                            <TextField
                                focus
                                concealed
                                aria-label="Unlock password"
                                placeholder="Unlock password"
                                bind:value={unlockPasswordInput}
                                onkeydown={unlockOnEnter}
                            />
                            <Button onClick={unlockExam}>Unlock</Button>
                        </div>
                    </div>
                </Card>
            </div>
        {/if}

        {#if examDisabled && submissionUrl}
            <div class="overlay scrim">
                <Card
                    element="section"
                    class="notice"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="exam-notice-title"
                >
                    <header class="card-head">
                        <h1 id="exam-notice-title" class="notice-title">Exam finished</h1>
                    </header>
                    <div class="card-body">
                        <p class="notice-text">
                            {#if submissionCopied}
                                Your answers are submitted, and the submission link is in your
                                clipboard. Send it to your teacher.
                            {:else}
                                Your answers are submitted. Copy the submission link and send it to
                                your teacher.
                            {/if}
                        </p>
                        <p class="notice-student">{@render student()}</p>
                        <div class="notice-actions">
                            <CopyButton
                                copy={() => copyText(submissionUrl, 'Submission link')}
                                {@attach focusOnMount}
                            >
                                Copy submission link
                            </CopyButton>
                            <Button
                                kind="secondary"
                                onClick={async () => {
                                    textDownloader(
                                        submissionUrl,
                                        `${examSubmission.name}-${examSubmission.hash}-submission-link.txt`
                                    )
                                }}
                            >
                                Download submission
                            </Button>
                        </div>
                    </div>
                    <footer class="card-foot notice-unlock">
                        <p class="unlock-hint">Your teacher can reopen the exam:</p>
                        <div class="unlock-row">
                            <TextField
                                concealed
                                aria-label="Unlock password"
                                placeholder="Unlock password"
                                bind:value={unlockPasswordInput}
                                onkeydown={unlockOnEnter}
                            />
                            <Button kind="secondary" onClick={unlockExam}>Unlock</Button>
                        </div>
                    </footer>
                </Card>
            </div>
        {/if}

        <!-- blocked while the exam is disabled, its notice standing in for the page -->
        <div class="exam-session" inert={examDisabled} tabindex="-1" bind:this={sessionElement}>
            <!-- the exam and the student at the left, the parts, the time left and Finish exam at
                 the right; two lines on a phone -->
            <header class="top-bar">
                <div class="who">
                    <!-- the page's title, the exam's, at a part's heading size so the bar stays
                         slim -->
                    <h1 class="exam-title">{loadedExam.title}</h1>
                    <span class="separator" aria-hidden="true">·</span>
                    {@render student()}
                </div>

                {#if parts.length > 0}
                    <nav class="progress" aria-label="Exam parts">
                        <ol
                            class="dots"
                            class:fade-start={dotsBefore}
                            class:fade-end={dotsAfter}
                            bind:this={dotsElement}
                            onscroll={measureDots}
                        >
                            {#each parts as part, index (part.id)}
                                {@const current = index === activePartIndex}
                                {@const answered = part.section ? isAnswered(part.section) : true}
                                <li>
                                    <button
                                        type="button"
                                        class="dot"
                                        class:current
                                        class:answered
                                        class:instructions={!part.section}
                                        aria-current={current ? 'step' : undefined}
                                        aria-label={part.section
                                            ? `Section ${part.number}`
                                            : 'Instructions'}
                                        disabled={examDisabled}
                                        onclick={() => goToPart(index)}
                                        {@attach tooltip(
                                            part.section
                                                ? `${sectionTypeLabel(part.section.type)}, ${answered ? 'answered' : 'not answered yet'}`
                                                : 'Read before the first section'
                                        )}
                                    ></button>
                                </li>
                            {/each}
                        </ol>
                        <!-- Previous and Next round the count, one button each, so the one pressed
                             keeps the focus as the parts change; named "Previous section" and
                             "Next section", the last word for screen readers only -->
                        <div class="pager" bind:this={pagerElement}>
                            <Button
                                kind="secondary"
                                size="sm"
                                class="step previous"
                                disabled={!canGoToPreviousSection}
                                onClick={goToPreviousSection}
                                {@attach tooltip(previousPartLabel, { placement: 'bottom' })}
                            >
                                <FaChevronLeft />
                                <span>Previous <span class="visually-hidden">section</span></span>
                            </Button>
                            <span class="count" aria-hidden="true">
                                {activePartIndex + 1} / {parts.length}
                            </span>
                            <Button
                                kind="secondary"
                                size="sm"
                                class="step next"
                                disabled={!canGoToNextSection}
                                onClick={goToNextSection}
                                {@attach tooltip(nextPartLabel, { placement: 'bottom' })}
                            >
                                <span>Next <span class="visually-hidden">section</span></span>
                                <FaChevronRight />
                            </Button>
                        </div>
                    </nav>
                {/if}

                {#if isSubmitted && formattedSubmissionTime}
                    <p class="time">Submitted on {formattedSubmissionTime}</p>
                {:else if remainingMs >= 0}
                    <div class="time" class:low={isTimeLow} role="timer">
                        <Icon size="body"><FaClock /></Icon>
                        <span class="visually-hidden">Time left:</span>
                        {remainingTimeLabel}
                    </div>
                {/if}

                <div class="bar-actions">
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
                    {#if !isReviewMode}
                        <!-- on purpose only on the last section, as before the redesign: the student
                             finishes after reaching the end; kept in the bar, disabled until then, so
                             the bar doesn't move from part to part, and filled there, the one way
                             on from the last section -->
                        <Button
                            kind={isOnLastSection && !isSubmitted ? 'primary' : 'secondary'}
                            size="sm"
                            disabled={isSubmitted || !isOnLastSection}
                            onClick={() => finishExam()}
                        >
                            Finish exam
                        </Button>
                    {/if}
                </div>
            </header>

            <p class="visually-hidden" aria-live="polite">{partAnnouncement}</p>

            <div class="part" class:coding={isCodingSection} bind:this={partElement}>
                {#if isOnInstructions && hasInstructions}
                    <div class="reading">
                        <Card element="section" aria-labelledby="exam-part-title">
                            <header class="part-head">
                                <h2 id="exam-part-title" class="part-title">Instructions</h2>
                            </header>
                            <div class="part-body">
                                <MarkdownRenderer
                                    source={loadedExam.instructions}
                                    disableLinks
                                    monacoColors
                                    centered={false}
                                />
                            </div>
                        </Card>
                    </div>
                {:else if activeSection}
                    {@const number = activeSectionIndex + 1}
                    {#if activeSection.type === ExamSectionType.AssemblyCoding}
                        {@const assemblySection = activeSection as AssemblyCodingSection}
                        <div class="coding-part wb-cards">
                            {@render promptColumn(assemblySection, number)}
                            {#key `${assemblySection.id}-${assemblySection.language}`}
                                <ExamAssemblySection
                                    section={assemblySection}
                                    bind:code={assemblyAnswers[assemblySection.id]}
                                    bind:activePanel={assemblyPanel}
                                    readonly={examDisabled}
                                    review={isReviewMode && AI_FEATURES_ENABLED
                                        ? reviewAgent
                                        : undefined}
                                />
                            {/key}
                        </div>
                    {:else if activeSection.type === ExamSectionType.CCoding}
                        {@const cSection = activeSection as CCodingSection}
                        <div class="coding-part c-part wb-cards">
                            {@render promptColumn(cSection, number)}
                            <section class="c-answer" aria-labelledby="exam-c-answer">
                                <h3 id="exam-c-answer" class="answer-label">Your answer</h3>
                                <div class="c-editor-wrap">
                                    <Editor
                                        language="c"
                                        bind:code={cAnswers[cSection.id]}
                                        disabled={examDisabled}
                                    />
                                </div>
                            </section>
                        </div>
                    {:else}
                        <div class="reading">
                            {@render promptCard(activeSection, number)}
                            {#if activeSection.type === ExamSectionType.OpenQuestion}
                                {@const openSection = activeSection as OpenQuestionSection}
                                <div class="answer open-answer">
                                    <label class="answer-label" for="exam-open-answer">
                                        Your answer
                                    </label>
                                    <textarea
                                        id="exam-open-answer"
                                        placeholder={openSection.placeholder}
                                        bind:value={openAnswers[openSection.id]}
                                        readonly={isReviewMode || examDisabled}
                                        onkeydown={(e) => handleOpenAnswerKeydown(e, openSection)}
                                    ></textarea>
                                </div>
                            {:else if activeSection.type === ExamSectionType.MultipleChoice}
                                {@const mcSection = activeSection as MultipleChoiceSection}
                                {@const chosen = multipleChoiceAnswers[mcSection.id] ?? []}
                                <fieldset class="answer choices">
                                    <legend class="answer-label">
                                        {mcSection.allowMultiple
                                            ? 'Select all that apply'
                                            : 'Select one option'}
                                    </legend>
                                    {#each mcSection.options as option (option.id)}
                                        <label
                                            class="choice"
                                            class:chosen={chosen.includes(option.id)}
                                            class:locked={isReviewMode || examDisabled}
                                        >
                                            <input
                                                disabled={examDisabled}
                                                type={mcSection.allowMultiple
                                                    ? 'checkbox'
                                                    : 'radio'}
                                                name={`mc-${mcSection.id}`}
                                                checked={chosen.includes(option.id)}
                                                onclick={(e) => {
                                                    //a review shows the answer, which no key or click changes
                                                    if (isReviewMode) e.preventDefault()
                                                }}
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
                                </fieldset>
                            {/if}
                        </div>
                    {/if}
                    {#if isReviewMode && AI_FEATURES_ENABLED && activeSection.type !== ExamSectionType.AssemblyCoding}
                        {#await import('#cmp/specific/exam/ExamReviewAgentSidebar.svelte') then { default: ExamReviewAgentSidebar }}
                            <ExamReviewAgentSidebar
                                bind:open={teacherAgentOpen}
                                verticalOffset="3rem"
                                exam={loadedExam}
                                {sections}
                                submission={examSubmission}
                                activeSectionId={activeSection.id}
                                visibleAnswer={activeVisibleAnswer}
                                emulatorInstance={null}
                            />
                        {/await}
                    {/if}
                {/if}
            </div>
        </div>
    {/if}
</Page>

<style lang="scss">
    @use '../../../styles/field.scss';
    @use '../../../styles/focus.scss' as *;
    @use '../../../components/specific/exam/exam.scss';

    /* focused only to give focus back after an unlock, when nothing in it had it: no ring round
       the whole page */
    .exam-session:focus {
        outline: none;
    }

    /* the bar and the part, one screen tall: a coding part's Workbench fills what the bar leaves,
       a reading part scrolls inside. A part's heading and text start `--part-inset` in, from the
       Card's edge or the question panel's, and so does the C answer's label under the panel */
    .exam-session {
        --part-inset: 1rem;
        display: flex;
        flex-direction: column;
        flex: none;
        height: var(--screen-height);
        min-height: 0;
        overflow: hidden;
    }

    /* ---- the start Card, centred on the page ---- */

    .start-room {
        display: grid;
        place-items: center;
        min-height: var(--screen-height);
        padding: 1rem;
    }
    .start-room > :global(.start-card) {
        width: 100%;
        max-width: 34rem;
    }

    /* a Card's heading over a rule, its body, and its actions at the right over a rule, as the
       create page's Card ends */
    .card-head {
        padding: 0.9rem 1.25rem;
        border-bottom: 1px solid var(--line);
    }
    .card-body {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem 1.25rem;
    }
    .card-foot {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem 1rem;
        padding: 0.75rem 1.25rem;
        border-top: 1px solid var(--line);
    }

    .start-title {
        margin: 0;
        font: 600 var(--fs-h3) / 1.25 var(--font-ui);
        overflow-wrap: anywhere;
    }
    .start-subtitle {
        margin: 0.2rem 0 0;
        color: var(--text-muted);
    }
    .start-loading {
        padding-block: 2.5rem;
    }
    .start-text {
        margin: 0;
        line-height: 1.5;
    }

    /* what the exam's guards do, one line each beside its icon */
    .rules {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        margin: 0;
        padding: 0;
        list-style: none;
        line-height: 1.5;
    }
    .rules li {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
    }
    .rule-icon {
        display: flex;
        flex: none;
        padding-top: 0.15rem;
        color: var(--accent);
    }

    .start-field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }
    .field-error {
        margin: 0;
        color: var(--danger);
        font-size: var(--fs-small);
    }

    .failure {
        position: fixed;
        inset: 0;
        z-index: var(--z-drawer);
        display: flex;
    }

    /* ---- the notices over the exam they block ---- */

    .overlay {
        position: fixed;
        inset: 0;
        backdrop-filter: blur(0.45rem);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: var(--z-drawer);
        padding: 1rem;
    }

    /* over the exam it blocks, which it dims as well as blurs */
    .overlay.scrim {
        background-color: var(--scrim);
    }
    .overlay > :global(.notice) {
        width: 100%;
        max-width: 30rem;
        box-shadow: var(--shadow-3);
    }

    .notice-title {
        margin: 0;
        font: 600 var(--fs-lead) / 1.3 var(--font-ui);
    }
    .notice-text {
        margin: 0;
        line-height: 1.5;
    }
    .notice-student {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
        font-weight: 500;
    }
    .notice-time {
        color: var(--text-muted);
        font-weight: 400;
        font-variant-numeric: tabular-nums;
    }
    .notice-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .notice-unlock {
        flex-direction: column;
        align-items: stretch;
    }
    .unlock-hint {
        margin: 0;
        color: var(--text-muted);
        font-size: var(--fs-small);
    }
    .unlock-row {
        display: flex;
        gap: 0.5rem;
    }
    .unlock-row > :global(.text-field) {
        flex: 1;
    }

    /* ---- the bar ---- */

    /* a strip across the top, as the project page's bar (ProjectTopBar): the exam, then the
       student at the left; the parts with Previous and Next, the time and Finish exam at the
       right. Where it is short of room the student's name, then the title, are cut short and the
       dots scroll; the code, Previous and Next with the count, the time and Finish exam keep
       their room */
    .top-bar {
        display: flex;
        align-items: center;
        gap: 0.15rem 1rem;
        flex: none;
        min-height: 2.9rem;
        padding: 0.3rem 0.5rem 0.3rem 1rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        border-bottom: 1px solid var(--line);
    }
    .who {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1 1 12rem;
        min-width: 0;
        overflow: hidden;
    }
    .exam-title {
        flex: 0 1 auto;
        min-width: 4rem;
        margin: 0;
        font: 600 var(--fs-lead) / 1.3 var(--font-ui);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    /* the name after the title, a dot between them, as one line reads "Exam · Ada" */
    .separator {
        flex: none;
        color: var(--text-muted);
    }
    .student-name {
        flex: 0 2 auto;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: var(--text-muted);
    }
    .notice-student .student-name {
        color: inherit;
    }
    /* the code that tells the student's attempts apart, which the teacher reads off the screen */
    .student-code {
        flex: none;
        padding: 0.05rem 0.4rem;
        border: 1px solid color-mix(in srgb, var(--accent) 65%, transparent);
        border-radius: var(--r-chip);
        background-color: color-mix(in srgb, var(--accent) 22%, transparent);
        font: 500 var(--fs-small) / 1.4 var(--font-mono);
    }

    /* the parts as dots: an open ring for a section with no answer yet, filled for one answered
       (and for the instructions, which ask for nothing), the accent with a halo for the one open */
    .progress {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
        flex: 0 1 auto;
        min-width: 18.5rem;
        max-width: 33rem;
    }
    .dots {
        position: relative;
        display: flex;
        min-width: 0;
        margin: 0;
        padding: 0.15rem;
        list-style: none;
        overflow-x: auto;
        scrollbar-width: none;
    }
    /* an end with more dots past it fades out */
    .dots.fade-start {
        mask-image: linear-gradient(to right, transparent, black 1.25rem);
    }
    .dots.fade-end {
        mask-image: linear-gradient(to left, transparent, black 1.25rem);
    }
    .dots.fade-start.fade-end {
        mask-image: linear-gradient(
            to right,
            transparent,
            black 1.25rem,
            black calc(100% - 1.25rem),
            transparent
        );
    }
    .dot {
        display: grid;
        place-items: center;
        width: 1.5rem;
        height: 1.5rem;
        padding: 0;
        border: none;
        border-radius: var(--r-pill);
        background: transparent;
        color: inherit;
        cursor: pointer;
        transition: background-color var(--dur-fast);
        @include focus-ring($inset: true);

        &::before {
            content: '';
            width: 0.6rem;
            height: 0.6rem;
            border-radius: var(--r-pill);
            box-shadow: inset 0 0 0 1.5px color-mix(in srgb, currentColor 60%, transparent);
        }
        &:hover {
            background-color: var(--hover-bg);
        }
        &.answered::before {
            background-color: color-mix(in srgb, currentColor 70%, transparent);
            box-shadow: none;
        }
        &.current::before {
            width: 0.7rem;
            height: 0.7rem;
            background-color: var(--accent);
            box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--accent) 30%, transparent);
        }
    }
    /* Previous and Next round the count, as a pager reads "‹ Previous 2 / 5 Next ›": ghost
       Buttons, their chevron the size of a small control's mark */
    .pager {
        display: flex;
        flex: none;
        align-items: center;
        gap: 0.25rem;
    }
    .progress :global(.btn.step) {
        flex: none;
        padding-inline: 0.55rem;
    }
    .progress :global(.btn.step svg) {
        flex: none;
        width: var(--fs-caption);
        height: var(--fs-caption);
    }
    .count {
        flex: none;
        color: var(--text-muted);
        font-size: var(--fs-small);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    .time {
        display: flex;
        flex: none;
        align-items: center;
        gap: 0.4rem;
        margin: 0;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    /* the last five minutes */
    .time.low {
        color: var(--warning);
        font-weight: 600;
    }

    .bar-actions {
        display: flex;
        flex: none;
        align-items: center;
        gap: 0.4rem;
    }
    /* Ask AI's speech bubble, as the chat page's toggle draws it */
    .bar-actions :global(.btn.ask-ai) {
        padding: 0.35rem;
        width: 2.1rem;
        height: 2.1rem;
        border-radius: 1.5rem 1.5rem 0.4rem 1.5rem;
    }

    /* ---- the part ---- */

    .part {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }
    .part.coding {
        overflow: hidden;
    }

    /* the instructions and a question in a column of the exam builder's Card width, centred */
    .reading {
        display: flex;
        flex-direction: column;
        flex: 1 0 auto;
        gap: 1rem;
        width: 100%;
        max-width: exam.$column;
        margin: 0 auto;
        padding: 1rem;
    }

    /* a coding section: its question in a panel at the left, the answer taking the rest of the
       width on the card tokens (`wb-cards`). 900px wide and less, the question is over the
       answer (below) */
    .coding-part {
        display: flex;
        flex: 1;
        min-height: 0;
    }
    /* the question's panel: from the bar to the window's bottom, flush with its left edge, on the
       page's own fill (`--primary`, which is the background in the built-in themes and the
       lightest tone in a light one) rather than the Workbench's cards, ruled off from them as the
       bar is above; scrolling on its own */
    .prompt-panel {
        display: flex;
        flex-direction: column;
        flex: none;
        width: clamp(20rem, 28vw, 26rem);
        min-height: 0;
        background-color: var(--primary);
        color: var(--primary-text);
        border-right: 1px solid var(--line);

        /* folded: still built, out of sight, so it opens again where it was scrolled to */
        &.folded {
            display: none;
        }
    }
    .prompt-panel .prompt-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
    }

    /* a coding section's band: the heading with the fold button at its right, the title under
       the heading, as the column is too narrow for both on one line */
    .part-head.foldable {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.15rem 0.5rem;
        padding-right: 0.5rem;
    }
    .part-head.foldable .part-name {
        grid-row: 2;
        grid-column: 1;
        margin: 0;
    }
    .part-head.foldable :global(.prompt-hide) {
        grid-row: 1;
        grid-column: 2;
        margin-block: -0.2rem;
    }

    /* the folded question: the panel's surface and rule as a strip 2.75rem wide (44px, a touch
       target), from the bar to the window's bottom, whose whole length shows the question again */
    .prompt-strip {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.7rem;
        flex: none;
        width: 2.75rem;
        min-height: 0;
        padding: 0.85rem 0;
        border: none;
        border-right: 1px solid var(--line);
        background-color: var(--primary);
        color: var(--primary-text);
        font: inherit;
        font-size: var(--fs-body);
        cursor: pointer;
        @include focus-ring($inset: true);

        :global(svg) {
            flex: none;
            width: var(--fs-small);
            height: var(--fs-small);
        }

        /* the row's hover over the panel's surface, which it keeps */
        &:hover {
            background-image: linear-gradient(var(--hover-bg), var(--hover-bg));
        }
    }
    /* read top to bottom, as the debug strip's names are, and cut short on a short screen */
    .strip-label {
        min-height: 0;
        overflow: hidden;
        writing-mode: vertical-rl;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: var(--text-muted);
    }
    .prompt-strip:hover .strip-label {
        color: inherit;
    }

    /* a part's heading over a rule across its Card or the question's panel */
    .part-head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.25rem 1rem;
        flex: none;
        padding: 0.6rem var(--part-inset);
        border-bottom: 1px solid var(--line);
    }
    .part-title {
        margin: 0;
        font: 600 var(--fs-lead) / 1.3 var(--font-ui);
    }
    .part-type {
        color: var(--text-muted);
        font-weight: 400;
    }
    .part-name {
        margin: 0 0 0 auto;
        color: var(--text-muted);
        font-size: var(--fs-small);
    }
    .part-body {
        padding: var(--part-inset);
    }

    .answer {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
    }
    .answer-label {
        margin: 0;
        padding: 0;
        font: 500 var(--fs-body) / 1.4 var(--font-ui);
    }

    /* an answer typed in the field look (styles/field.scss), in code's font */
    .open-answer {
        flex: 1;
    }
    textarea {
        @include field.input;
        flex: 1;
        width: 100%;
        min-height: 14rem;
        padding: 0.8rem;
        font-family: var(--font-mono);
        resize: vertical;
    }

    /* the options as fields (styles/field.scss), the chosen one in the accent's tint and edge */
    .choices {
        margin: 0;
        padding: 0;
        border: none;
    }
    .choices .answer-label {
        margin-bottom: 0.5rem;
    }
    .choice {
        @include field.surface;
        display: flex;
        gap: 0.75rem;
        align-items: center;
        padding: 0.7rem 0.85rem;
        cursor: pointer;
        transition:
            background-color var(--dur-fast),
            border-color var(--dur-fast);

        &:hover {
            border-color: var(--line-strong);
        }
        &.chosen {
            border-color: var(--accent);
            background-color: color-mix(in srgb, var(--accent) 12%, field.$fill);
        }
        &.locked {
            cursor: default;
        }
        &.locked input {
            pointer-events: none;
        }
        input {
            flex: none;
            margin: 0;
            accent-color: var(--accent);
        }
    }

    /* a C section's editor under its label, in the card's edge as the Workbench's editors are */
    .c-answer {
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: 0.4rem;
        min-height: 0;
        padding: 0.75rem var(--wb-gap) var(--wb-gap);
    }
    /* inset from the editor's edge as a Card's text is from the Card's */
    .c-answer .answer-label {
        padding-inline: calc(1rem + 1px);
    }
    .c-editor-wrap {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        position: relative;
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
        overflow: hidden;
    }

    /* 900px wide and less (a phone, a tablet upright) a column beside the answer would leave the
       editor too narrow: the question is over it, at most 35% of the height, and folds to a bar
       across the top; the fold buttons' arrows turn to point up and down */
    @media (max-width: 900px) {
        .coding-part {
            flex-direction: column;
        }
        .prompt-panel {
            width: auto;
            max-height: 35%;
            border-right: none;
            border-bottom: 1px solid var(--line);
        }
        /* folded, a bar across the window 2.75rem tall, as wide a target as the strip */
        .prompt-strip {
            flex-direction: row;
            width: auto;
            min-height: 2.75rem;
            padding: 0 1rem;
            border-right: none;
            border-bottom: 1px solid var(--line);
        }
        .strip-label {
            writing-mode: horizontal-tb;
        }
        /* under the question, in line with its text */
        .c-answer .answer-label {
            padding-inline: calc(var(--part-inset) - var(--wb-gap));
        }
        .prompt-strip :global(svg),
        .part-head.foldable :global(.prompt-hide svg) {
            transform: rotate(90deg);
        }
    }

    /* a phone: the bar in three lines, the exam with the time and Finish exam, then the student,
       then Previous and Next at the two ends of the third with the dots and the count centred
       between them; the dots scroll when there are more than fit */
    @media (max-width: exam.$phone) {
        .exam-session {
            --part-inset: 0.75rem;
        }
        .top-bar {
            flex-wrap: wrap;
            gap: 0.1rem 0.6rem;
            padding: 0.35rem 0.5rem 0.35rem 0.75rem;
        }
        /* the break between the two lines */
        .top-bar::after {
            content: '';
            order: 4;
            flex-basis: 100%;
        }
        .who {
            display: contents;
        }
        .separator {
            display: none;
        }
        .exam-title {
            order: 1;
            flex: 1 1 0;
        }
        .time {
            order: 2;
        }
        .bar-actions {
            order: 3;
        }
        .top-bar .student-name {
            order: 5;
        }
        .top-bar .student-code {
            order: 6;
        }
        /* a line of its own, the whole width */
        .progress {
            order: 7;
            flex: 1 1 100%;
            min-width: 0;
            max-width: none;
        }
        .pager {
            display: contents;
        }
        .progress :global(.btn.previous) {
            order: -1;
        }
        .dots {
            margin-left: auto;
        }
        .count {
            margin-right: auto;
        }
        .reading {
            padding: 0.75rem 0.5rem;
        }
        .prompt-panel {
            max-height: 30%;
        }
        .part-head {
            padding-block: 0.5rem;
        }
        .card-head,
        .card-body,
        .card-foot {
            padding-inline: 1rem;
        }
    }
</style>
