import lzstring from 'lz-string'
import { BASE_CODE } from '$lib/Config'
import type { AvailableLanguages, ProjectData, Testcase } from '$lib/Project.svelte'
import { serializer } from '$lib/json'
import { decryptData } from '$lib/utils'

export enum ExamSectionType {
    OpenQuestion = 'open-question',
    MultipleChoice = 'multiple-choice',
    AssemblyCoding = 'assembly-coding',
    CCoding = 'c-coding'
}

export type ExamSectionBase = {
    id: string
    title: string
    prompt: string
}

export type OpenQuestionSection = ExamSectionBase & {
    type: ExamSectionType.OpenQuestion
    placeholder: string
}

export type MultipleChoiceOption = {
    id: string
    text: string
}

export type MultipleChoiceSection = ExamSectionBase & {
    type: ExamSectionType.MultipleChoice
    allowMultiple: boolean
    options: MultipleChoiceOption[]
}

export type AssemblyCodingSection = ExamSectionBase & {
    type: ExamSectionType.AssemblyCoding
    language: AvailableLanguages
    starterCode: string
    testcases: Testcase[]
    promptEncrypted?: boolean
}

export type CCodingSection = ExamSectionBase & {
    type: ExamSectionType.CCoding
    starterCode: string
    placeholder: string
}

export type ExamSection =
    | OpenQuestionSection
    | MultipleChoiceSection
    | AssemblyCodingSection
    | CCodingSection

export type OpenQuestionAnswer = {
    type: 'open-question'
    answer: string
}

export type MultipleChoiceAnswer = {
    type: 'multiple-choice'
    selectedOptionIds: string[]
}

export type AssemblyCodingAnswer = {
    type: 'assembly-coding'
    code: string
}

export type CCodingAnswer = {
    type: 'c-coding'
    code: string
}

export type ExamSectionAnswer =
    | OpenQuestionAnswer
    | MultipleChoiceAnswer
    | AssemblyCodingAnswer
    | CCodingAnswer

export type ExamSubmission = {
    name: string
    submissionTimestamp: number
    startedAt: number
    hash: string
    fullscreenExitCount?: number
    answers: Record<string, ExamSectionAnswer>
}

export type ExamPayload = {
    version: 2
    title: string
    instructions: string
    unlockPasswordHash: string
    accessPasswordHash?: string
    timeLimit: number
    sections: ExamSection[]
    encryptedSections?: string
    submission?: ExamSubmission
}

export function createExamEntityId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID()
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function createDefaultExamSection(type: ExamSectionType): ExamSection {
    const id = createExamEntityId()
    if (type === ExamSectionType.OpenQuestion) {
        return {
            id,
            type,
            title: '',
            prompt: '',
            placeholder: 'Write your answer here'
        }
    }

    if (type === ExamSectionType.MultipleChoice) {
        return {
            id,
            type,
            title: '',
            prompt: '',
            allowMultiple: false,
            options: [
                { id: createExamEntityId(), text: 'Option 1' },
                { id: createExamEntityId(), text: 'Option 2' }
            ]
        }
    }

    if (type === ExamSectionType.CCoding) {
        return {
            id,
            type,
            title: '',
            prompt: '',
            placeholder: 'Write C code here',
            starterCode: `#include <stdio.h>\n\nint main(void) {\n    // Write your code\n    return 0;\n}`
        }
    }

    return {
        id,
        type: ExamSectionType.AssemblyCoding,
        title: '',
        prompt: '',
        language: 'M68K',
        starterCode: BASE_CODE.M68K,
        testcases: []
    }
}

export function createDefaultExamPayload(): ExamPayload {
    return {
        version: 2,
        title: 'Untitled exam',
        instructions: '',
        unlockPasswordHash: '',
        timeLimit: -1,
        sections: [createDefaultExamSection(ExamSectionType.AssemblyCoding)]
    }
}

export function encodeExamPayload(payload: ExamPayload): string {
    return lzstring.compressToEncodedURIComponent(serializer.stringify(payload))
}

export function decodeExamPayload(encodedPayload: string): ExamPayload | null {
    const decoded = lzstring.decompressFromEncodedURIComponent(encodedPayload)
    if (!decoded) return null
    try {
        const parsed = serializer.parse<ExamPayload>(decoded)
        if (!parsed || parsed.version !== 2) return null
        return parsed
    } catch (e) {
        console.error(e)
        return null
    }
}

export function createExamSessionLink(payload: ExamPayload): string {
    return `${window.location.origin}/exam/session?exam=${encodeExamPayload(payload)}`
}

export function hasEncryptedLegacyPrompts(sections: ExamSection[]) {
    return sections.some((section) => {
        if (section.type !== ExamSectionType.AssemblyCoding) return false
        return !!section.promptEncrypted
    })
}

export async function unlockExamSections(
    payload: ExamPayload,
    accessPassword: string
): Promise<ExamSection[]> {
    if (payload.encryptedSections) {
        const decrypted = await decryptData(payload.encryptedSections, accessPassword)
        return serializer.parse<ExamSection[]>(decrypted)
    }

    if (!hasEncryptedLegacyPrompts(payload.sections)) {
        return payload.sections
    }

    const updatedSections: ExamSection[] = []
    for (const section of payload.sections) {
        if (section.type !== ExamSectionType.AssemblyCoding || !section.promptEncrypted) {
            updatedSections.push(section)
            continue
        }
        const decryptedPrompt = await decryptData(section.prompt, accessPassword)
        updatedSections.push({
            ...section,
            prompt: decryptedPrompt,
            promptEncrypted: false
        })
    }
    return updatedSections
}

export function parseLegacyProjectExamPayload(projectParam: string): ExamPayload | null {
    const decoded = lzstring.decompressFromEncodedURIComponent(projectParam)
    if (!decoded) return null
    try {
        const parsed = serializer.parse<ProjectData>(decoded)
        if (!parsed?.exam) {
            return null
        }

        const sectionId = createExamEntityId()
        const legacySection: AssemblyCodingSection = {
            id: sectionId,
            type: ExamSectionType.AssemblyCoding,
            title: 'Assembly',
            prompt: parsed.exam.track,
            promptEncrypted: !!parsed.exam.accessPasswordHash,
            language: parsed.language,
            starterCode: parsed.code,
            testcases: parsed.testcases
        }

        const answers: Record<string, ExamSectionAnswer> = {}
        if (parsed.exam.submission) {
            answers[sectionId] = {
                type: 'assembly-coding',
                code: parsed.code
            }
        }

        return {
            version: 2,
            title: parsed.name || 'Migrated exam',
            instructions: parsed.description || '',
            unlockPasswordHash: parsed.exam.passwordHash,
            accessPasswordHash: parsed.exam.accessPasswordHash,
            timeLimit: parsed.exam.timeLimit ?? -1,
            sections: [legacySection],
            submission: parsed.exam.submission
                ? {
                      ...parsed.exam.submission,
                      answers
                  }
                : undefined
        }
    } catch (e) {
        console.error(e)
        return null
    }
}
