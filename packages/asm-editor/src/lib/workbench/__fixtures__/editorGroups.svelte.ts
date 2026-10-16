import { makeProject, type AvailableLanguages, type StoredProject } from '#lib/Project.svelte.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import type { Emulator } from '#lib/languages/Emulator.ts'
import {
    sameBreakpoint,
    type Diagnostic,
    type EmulatorNote,
    type SourceBreakpoint
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { ListingDocuments } from '#lib/listing/listingDocuments.svelte.ts'
import type { BuildOutput } from '#lib/buildOutput.ts'
import { WorkbenchSession, type WorkbenchSessionHost } from '../WorkbenchSession.svelte'

/** Reactive emulator boundary without a Core or a language worker. */
export function editorGroupsFixture(
    language: AvailableLanguages = 'RISC-V',
    data: StoredProject = {},
    host: Partial<WorkbenchSessionHost> = {}
) {
    const project = makeProject({
        language,
        entry: 'main.c',
        files: {
            'main.c': { encoding: 'plain', content: 'int main(void) { return 0; }' },
            'value.h': { encoding: 'plain', content: '#define VALUE 0' },
            'main.s': { encoding: 'plain', content: 'nop\nnop' },
            'other.c': { encoding: 'plain', content: 'int main(void) { return 1; }' }
        },
        ...data
    })
    let breakpointResolver:
        | ((breakpoints: readonly SourceBreakpoint[]) => SourceBreakpoint[])
        | undefined
    const emulator = $state({
        pc: 0n,
        systemSize: 4,
        systemSize_: 4,
        terminated: false,
        canExecute: false,
        buildSources: undefined as BuildSources | undefined,
        currentFile: 'main.s',
        line: 0,
        compilerDiagnostics: [] as Diagnostic[],
        errors: [],
        breakpoints: [] as SourceBreakpoint[],
        listings: undefined as ListingDocuments | undefined,
        buildOutput: undefined as BuildOutput | undefined,
        notes: [] as EmulatorNote[],
        /** The Arguments the last Build or test run was given, as `setProgramArguments` passes them. */
        programArguments: '',
        setProgramArguments(text: string) {
            this.programArguments = text
        },
        setScreenHistoryBudgetMb: (_megabytes: number) => {},
        setFileSystemHistoryBudgetMb: (_megabytes: number) => {},
        toggleBreakpoint(line: number, file: string) {
            this.toggleSourceBreakpoint({ file, line })
        },
        toggleAddressBreakpoint(address: number, file: string) {
            this.toggleSourceBreakpoint({ file, address })
        },
        toggleSourceBreakpoint(breakpoint: SourceBreakpoint) {
            const index = this.breakpoints.findIndex((item) => sameBreakpoint(item, breakpoint))
            if (index === -1) this.breakpoints.push(breakpoint)
            else this.breakpoints.splice(index, 1)
        },
        setSources: (_sources: BuildSources) => {},
        //a Build that changes nothing; a test that needs one to fail replaces it
        compile: async (_historySize: number, _sources: BuildSources) => {},
        setBreakpointResolver: (resolver: typeof breakpointResolver) => {
            breakpointResolver = resolver
        },
        setGlobalMemorySize: (_pageSize: number, _rowSize: number) => {},
        clear: () => {}
    })
    let session!: WorkbenchSession
    const disposeEffects = $effect.root(() => {
        session = new WorkbenchSession(project, emulator as unknown as Emulator, {
            readonly: false,
            canEditTestcases: true,
            ...host
        })
    })
    return {
        project,
        emulator,
        session,
        /** The Breakpoints the Core would run with, as the session resolves them. */
        coreBreakpoints: () => breakpointResolver?.(emulator.breakpoints) ?? emulator.breakpoints,
        dispose: () => {
            disposeEffects()
            session.models.dispose()
        }
    }
}
