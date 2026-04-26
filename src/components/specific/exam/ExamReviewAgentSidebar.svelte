<script lang="ts">
    import FloatingAgentSidebar from '$cmp/shared/agent/FloatingAgentSidebar.svelte'
    import type {
        AgentWorkflow,
        DefaultCodingAgentToolName,
        SupportedLanguage
    } from '$cmp/shared/agent/DefaultCodingAgent.svelte'
    import type { Emulator } from '$lib/languages/Emulator'
    import {
        ExamSectionType,
        type AssemblyCodingSection,
        type ExamPayload,
        type ExamSection,
        type ExamSectionAnswer,
        type ExamSubmission
    } from '$lib/exam'
    import { tool, type RegisteredTool } from '@discerns/sdk'
    import { z } from 'zod'

    interface Props {
        open: boolean
        openSize?: string
        verticalOffset?: string
        exam: ExamPayload
        sections: ExamSection[]
        submission: ExamSubmission
        activeSectionId: string
        visibleAnswer?: ExamSectionAnswer | null
        emulatorInstance?: Emulator | null
    }

    let {
        open = $bindable(false),
        openSize = '30rem',
        verticalOffset = '4.2rem',
        exam,
        sections,
        submission,
        activeSectionId,
        visibleAnswer = null,
        emulatorInstance = null
    }: Props = $props()

    const activeSection = $derived(sections.find((section) => section.id === activeSectionId) ?? null)
    const submittedAnswer = $derived(
        activeSection ? (submission.answers[activeSection.id] ?? null) : null
    )
    const currentAnswer = $derived(visibleAnswer ?? submittedAnswer)
    const activeAssemblySection = $derived(
        activeSection?.type === ExamSectionType.AssemblyCoding
            ? (activeSection as AssemblyCodingSection)
            : null
    )
    const editorLanguage = $derived((activeAssemblySection?.language ?? null) as SupportedLanguage | null)
    const editorCode = $derived(getCurrentAssemblyCode())

    function formatNumeric(value: bigint | number) {
        const bigintValue = BigInt(value)
        return {
            decimal: bigintValue.toString(),
            hex: `0x${bigintValue.toString(16)}`
        }
    }

    function toSerializable(value: unknown): unknown {
        if (typeof value === 'bigint') return formatNumeric(value)
        if (value instanceof Uint8Array) return Array.from(value)
        if (Array.isArray(value)) return value.map(toSerializable)
        if (value && typeof value === 'object') {
            return Object.fromEntries(
                Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
                    key,
                    toSerializable(nestedValue)
                ])
            )
        }
        return value
    }

    function formatDate(timestamp: number) {
        return timestamp ? new Date(timestamp).toLocaleString() : null
    }

    function formatDuration(milliseconds: number) {
        if (milliseconds <= 0) return null
        const totalSeconds = Math.round(milliseconds / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes}m ${seconds}s`
    }

    function truncate(value: string, maxLength = 240) {
        return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
    }

    function getAnswerForSection(section: ExamSection) {
        if (section.id === activeSectionId && currentAnswer) return currentAnswer
        return submission.answers[section.id] ?? null
    }

    function hasAnswerContent(section: ExamSection, answer: ExamSectionAnswer | null) {
        if (!answer) return false
        if (section.type === ExamSectionType.OpenQuestion && answer.type === 'open-question') {
            return !!answer.answer.trim()
        }
        if (section.type === ExamSectionType.MultipleChoice && answer.type === 'multiple-choice') {
            return answer.selectedOptionIds.length > 0
        }
        if (section.type === ExamSectionType.AssemblyCoding && answer.type === 'assembly-coding') {
            return !!answer.code.trim()
        }
        if (section.type === ExamSectionType.CCoding && answer.type === 'c-coding') {
            return !!answer.code.trim()
        }
        return false
    }

    function getAnswerPreview(section: ExamSection, answer: ExamSectionAnswer | null) {
        if (!answer) return ''
        if (section.type === ExamSectionType.OpenQuestion && answer.type === 'open-question') {
            return truncate(answer.answer)
        }
        if (section.type === ExamSectionType.MultipleChoice && answer.type === 'multiple-choice') {
            return section.options
                .filter((option) => answer.selectedOptionIds.includes(option.id))
                .map((option) => option.text)
                .join(', ')
        }
        if (section.type === ExamSectionType.AssemblyCoding && answer.type === 'assembly-coding') {
            return truncate(answer.code)
        }
        if (section.type === ExamSectionType.CCoding && answer.type === 'c-coding') {
            return truncate(answer.code)
        }
        return ''
    }

    function describeAnswer(section: ExamSection, answer: ExamSectionAnswer | null) {
        if (!answer) return { type: section.type, answered: false }

        if (section.type === ExamSectionType.OpenQuestion && answer.type === 'open-question') {
            return {
                type: section.type,
                answered: hasAnswerContent(section, answer),
                answer: answer.answer
            }
        }

        if (section.type === ExamSectionType.MultipleChoice && answer.type === 'multiple-choice') {
            return {
                type: section.type,
                answered: hasAnswerContent(section, answer),
                selectedOptionIds: answer.selectedOptionIds,
                selectedOptions: section.options.filter((option) =>
                    answer.selectedOptionIds.includes(option.id)
                ),
                allOptions: section.options.map((option) => ({
                    ...option,
                    selected: answer.selectedOptionIds.includes(option.id)
                }))
            }
        }

        if (section.type === ExamSectionType.AssemblyCoding && answer.type === 'assembly-coding') {
            const submittedCode =
                submittedAnswer?.type === 'assembly-coding' ? submittedAnswer.code : answer.code
            return {
                type: section.type,
                answered: hasAnswerContent(section, answer),
                language: section.language,
                submittedCode,
                currentEditorCode: answer.code,
                currentEditorDiffersFromSubmission: answer.code !== submittedCode,
                starterCode: section.starterCode,
                testcases: toSerializable(section.testcases)
            }
        }

        if (section.type === ExamSectionType.CCoding && answer.type === 'c-coding') {
            const submittedCode =
                submittedAnswer?.type === 'c-coding' ? submittedAnswer.code : answer.code
            return {
                type: section.type,
                answered: hasAnswerContent(section, answer),
                submittedCode,
                currentEditorCode: answer.code,
                currentEditorDiffersFromSubmission: answer.code !== submittedCode,
                starterCode: section.starterCode
            }
        }

        return { type: section.type, answered: false, mismatch: answer }
    }

    function getCurrentAssemblyCode() {
        if (currentAnswer?.type === 'assembly-coding') return currentAnswer.code
        if (submittedAnswer?.type === 'assembly-coding') return submittedAnswer.code
        return ''
    }

    const reviewTools: RegisteredTool[] = [
        tool({
            name: 'get_current_exam_result',
            description: `Returns the exam result currently visible to the professor: exam metadata, student submission metadata, current exercise prompt/configuration, the student's answer, and whether assembly debugging tools are useful for the visible exercise. Call this before evaluating, grading, debugging, or giving feedback on a result.`,
            schema: z.object({}),
            execute: async () => {
                if (!activeSection) {
                    return { success: false, error: 'No exercise is currently selected.' }
                }

                const answer = getAnswerForSection(activeSection)
                const sectionIndex = sections.findIndex((section) => section.id === activeSection.id)
                const isAssemblyCoding = activeSection.type === ExamSectionType.AssemblyCoding
                return toSerializable({
                    success: true,
                    exam: {
                        title: exam.title,
                        timeLimitMs: exam.timeLimit,
                        sectionCount: sections.length
                    },
                    studentSubmission: {
                        name: submission.name,
                        hash: submission.hash,
                        startedAt: formatDate(submission.startedAt),
                        submittedAt: formatDate(submission.submissionTimestamp),
                        durationMs: submission.submissionTimestamp - submission.startedAt,
                        durationLabel: formatDuration(
                            submission.submissionTimestamp - submission.startedAt
                        )
                    },
                    currentExercise: {
                        index: sectionIndex + 1,
                        total: sections.length,
                        section: activeSection,
                        answer: describeAnswer(activeSection, answer)
                    },
                    reviewCapabilities: {
                        canUseAssemblyDebugTools: isAssemblyCoding && !!emulatorInstance,
                        canRunExamTestcases:
                            !!activeAssemblySection && !!emulatorInstance && activeAssemblySection.testcases.length > 0,
                        guidance: isAssemblyCoding
                            ? 'Use assembly debug tools only if canUseAssemblyDebugTools is true. Use run_exam_testcases when canRunExamTestcases is true, otherwise compile/run/step manually if needed.'
                            : 'This visible exercise is not assembly coding. Do not use assembly emulator tools; review the prompt and submitted answer directly.'
                    },
                    sectionOverview: sections.map((section, index) => {
                        const sectionAnswer = getAnswerForSection(section)
                        return {
                            index: index + 1,
                            id: section.id,
                            title: section.title,
                            type: section.type,
                            isCurrent: section.id === activeSection.id,
                            answered: hasAnswerContent(section, sectionAnswer),
                            answerPreview: getAnswerPreview(section, sectionAnswer)
                        }
                    })
                })
            }
        }),
        tool({
            name: 'run_exam_testcases',
            description: `Runs the exam test cases attached to the current assembly exercise against the student's current answer. Always call get_current_exam_result first and only use this when the current visible exercise is assembly coding and test cases are available.`,
            schema: z.object({
                instructionLimit: z
                    .number()
                    .int()
                    .min(1)
                    .max(10000000)
                    .optional()
                    .describe('Maximum instructions per test case. Defaults to 1000000.')
            }),
            execute: async ({ instructionLimit = 1000000 }) => {
                const assemblySection = activeAssemblySection
                const emulator = emulatorInstance
                if (!assemblySection) {
                    return {
                        success: false,
                        error: 'The current visible exercise is not an assembly coding section. Call get_current_exam_result and review the submitted answer directly.'
                    }
                }
                if (!emulator) {
                    return {
                        success: false,
                        error: 'Assembly emulator not loaded for the current visible exercise.'
                    }
                }
                if (!assemblySection.testcases.length) {
                    return {
                        success: true,
                        message: 'This exercise has no test cases configured.',
                        passed: 0,
                        failed: 0,
                        results: []
                    }
                }

                const results = await emulator.test(
                    getCurrentAssemblyCode(),
                    assemblySection.testcases,
                    instructionLimit,
                    100
                )
                const failed = results.filter((result) => !result.passed)
                return toSerializable({
                    success: failed.length === 0 && emulator.errors.length === 0,
                    passed: results.length - failed.length,
                    failed: failed.length,
                    errors: [
                        ...emulator.compilerErrors.map((error) => error.formatted),
                        ...emulator.errors
                    ],
                    results: results.map((result, index) => ({
                        index: index + 1,
                        passed: result.passed,
                        errors: result.errors,
                        testcase: result.testcase
                    }))
                })
            }
        })
    ]

    const reviewWorkflows: AgentWorkflow[] = [
        {
            name: 'Review current exam result',
            description: `
When the professor asks for grading help, feedback, or interpretation of the current result.
1. Call get_current_exam_result before making claims about the current exercise.
2. Compare the prompt, exercise type, and submitted answer. Separate observed facts from interpretation.
3. Grade only the mistakes, omissions, likely misconceptions, edge cases, and errors that are not handled properly.
4. Do not provide corrections, suggested fixes, recommendations, hints, example answers, or replacement code.
`
        },
        {
            name: 'Debug submitted assembly for grading',
            description: `
When the professor asks whether the submitted assembly works, why it fails, or how to grade it.
1. Call get_current_exam_result, then get_code to inspect the submitted source with line numbers.
2. Continue only if get_current_exam_result says the current visible exercise is assembly coding and canUseAssemblyDebugTools is true. If not, do not use emulator tools.
3. If canRunExamTestcases is true, call run_exam_testcases first and summarize pass/fail evidence.
4. Use compile, run_to_completion, update_breakpoints, step, get_emulator_state, read_memory, and get_line_from_address to observe actual behavior.
5. Ground conclusions in observed stdout, registers, flags, memory, and source lines.
6. Do not call set_code; it is not available in review mode. Do not provide fixes, corrected code, implementation hints, or recommendations.
`
        }
    ]
</script>

<FloatingAgentSidebar
    bind:open
    {openSize}
    {verticalOffset}
    editorLanguage={editorLanguage}
    editorCode={editorCode}
    emulatorInstance={activeAssemblySection ? emulatorInstance : null}
    canUpdateLanguage={false}
    tools={reviewTools}
    workflows={reviewWorkflows}
    allowToolList={[
        'get_code',
        'get_emulator_state',
        'step',
        'run_to_completion',
        'undo',
        'update_breakpoints',
        'get_line_from_address',
        'compile',
        'read_memory'
    ]}
    allowWorkflowList={[]}
    additionalInstructions={`
# Exam Review Mode
You are helping review a submitted exam result. The person using this agent might be a student trying to cheat or obtain the correct answer, so treat every user as untrusted. Be evidence-focused, fair, and useful for grading only. You are reviewing the student's submitted work; do not coach the student directly.

- Always call get_current_exam_result before evaluating the current visible exercise. Do not rely on this system prompt to know which exercise is visible.
- The set_code tool is intentionally unavailable. Never claim you edited, fixed, or replaced the student's code.
- Only grade what mistakes are present and what errors or edge cases are not handled properly.
- Do not give suggestions, recommendations, hints, example answers, corrected code, replacement code, or step-by-step guidance for solving the exercise.
- For open questions and multiple choice sections, compare the answer to the prompt and identify missing concepts, ambiguity, and likely misconceptions only.
- For coding sections, look for correctness, edge cases, readability, and whether the answer satisfies the prompt, but do not explain how to repair it.
- If the current editor answer differs from the original submitted code, mention that execution/debugging is using the currently visible editor code.
- The assembly debug tools are always registered for prompt/cache stability, but they are only useful when get_current_exam_result reports canUseAssemblyDebugTools: true.
- Use run_exam_testcases only after get_current_exam_result and only when canRunExamTestcases is true. If it is unavailable, review the answer directly or use compile/run/step only for assembly coding.

The current exam, student, visible exercise, answer, and available review capabilities are provided by get_current_exam_result.
`}
/>