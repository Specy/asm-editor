import { makeProject, type AvailableLanguages } from '$lib/Project.svelte'
import type { BuildSources } from '$lib/projectFiles'
import type { Emulator } from '$lib/languages/Emulator'
import type { Diagnostic, SourceBreakpoint } from '$lib/languages/commonLanguageFeatures.svelte'
import { WorkbenchSession } from '../WorkbenchSession.svelte'

/** Reactive emulator boundary without a Core or a language worker. */
export function editorGroupsFixture(language: AvailableLanguages = 'RISC-V') {
    const project = makeProject({
        language,
        entry: 'main.c',
        files: {
            'main.c': { encoding: 'plain', content: 'int main(void) { return 0; }' },
            'value.h': { encoding: 'plain', content: '#define VALUE 0' },
            'main.s': { encoding: 'plain', content: 'nop\nnop' },
            'other.c': { encoding: 'plain', content: 'int main(void) { return 1; }' }
        }
    })
    let breakpointResolver:
        ((breakpoints: readonly SourceBreakpoint[]) => SourceBreakpoint[]) | undefined
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
        toggleBreakpoint(line: number, file: string) {
            const index = this.breakpoints.findIndex(
                (item) => item.line === line && item.file === file
            )
            if (index === -1) this.breakpoints.push({ file, line })
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
            canEditTestcases: true
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
