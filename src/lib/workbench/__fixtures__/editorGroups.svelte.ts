import { makeProject } from '$lib/Project.svelte'
import type { BuildSources } from '$lib/projectFiles'
import type { Emulator } from '$lib/languages/Emulator'
import { WorkbenchSession } from '../WorkbenchSession.svelte'

/** Reactive emulator boundary without a Core or a language worker. */
export function editorGroupsFixture() {
    const project = makeProject({
        language: 'RISC-V',
        entry: 'main.c',
        files: {
            'main.c': { encoding: 'plain', content: 'int main(void) { return 0; }' },
            'value.h': { encoding: 'plain', content: '#define VALUE 0' },
            'main.s': { encoding: 'plain', content: 'nop\nnop' },
            'other.c': { encoding: 'plain', content: 'int main(void) { return 1; }' }
        }
    })
    const emulator = $state({
        pc: 0n,
        systemSize: 4,
        systemSize_: 4,
        terminated: false,
        canExecute: false,
        buildSources: undefined as BuildSources | undefined,
        currentFile: 'main.s',
        line: 0,
        compilerDiagnostics: [],
        errors: [],
        breakpoints: [],
        setSources: (_sources: BuildSources) => {},
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
        dispose: () => {
            disposeEffects()
            session.models.dispose()
        }
    }
}
