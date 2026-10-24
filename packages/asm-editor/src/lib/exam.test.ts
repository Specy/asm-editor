import { describe, expect, it } from 'vite-plus/test'
import lzstring from 'lz-string'
import { serializer } from '#lib/json.ts'
import { ExamSectionType, parseLegacyProjectExamPayload } from '#lib/exam.ts'

/**
 * An exam from before exam links were their own payload is a shared Project with `exam` set. Its
 * one Program is the coding section: the Entry file's text is the starter code and the Program's
 * Testcases are the section's ([programs.md](../../../../docs/design/programs.md), "Exams").
 */
describe('parseLegacyProjectExamPayload', () => {
    const exam = { track: 'Sum two numbers', passwordHash: 'hash', timeLimit: 600 }
    const testcase = {
        input: [],
        expectedOutput: '3',
        startingRegisters: {},
        expectedRegisters: { d0: 3n },
        startingMemory: [],
        expectedMemory: []
    }
    const link = (project: Record<string, unknown>) =>
        lzstring.compressToEncodedURIComponent(serializer.stringify({ ...project, exam }))

    it.each([
        ['in the shape before Programs', { entry: 'main.m68k', testcases: [testcase] }],
        ['with Programs', { programs: { 'main.m68k': { settings: {}, testcases: [testcase] } } }]
    ])('reads the Entry text and Testcases of the one Program, %s', (_shape, program) => {
        const payload = parseLegacyProjectExamPayload(
            link({
                name: 'Exam',
                language: 'M68K',
                files: { 'main.m68k': { encoding: 'plain', content: 'move.l #1, d0' } },
                ...program
            })
        )
        const [section] = payload?.sections ?? []
        expect(section).toMatchObject({
            type: ExamSectionType.AssemblyCoding,
            prompt: 'Sum two numbers',
            starterCode: 'move.l #1, d0'
        })
        expect(section?.type === ExamSectionType.AssemblyCoding && section.testcases).toEqual([
            testcase
        ])
    })
})
