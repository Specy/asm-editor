import { ExamSectionType } from '#lib/exam.ts'

/** The exam builder's part for the exam's title, passwords and time limit. */
export const DETAILS = 'details'
/** The exam builder's part for the general instructions, read before the first section. */
export const INSTRUCTIONS = 'instructions'

/** The section types in the order Add section offers them, the coding ones first. */
export const SECTION_TYPES: readonly ExamSectionType[] = [
    ExamSectionType.AssemblyCoding,
    ExamSectionType.CCoding,
    ExamSectionType.MultipleChoice,
    ExamSectionType.OpenQuestion
]

/** What the exam builder calls a section type. */
export function sectionTypeLabel(sectionType: ExamSectionType) {
    if (sectionType === ExamSectionType.OpenQuestion) return 'Open question'
    if (sectionType === ExamSectionType.MultipleChoice) return 'Multiple choice'
    if (sectionType === ExamSectionType.AssemblyCoding) return 'Assembly coding'
    return 'C coding'
}
