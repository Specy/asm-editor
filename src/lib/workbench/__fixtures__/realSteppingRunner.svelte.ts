import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
import { makeProject } from '$lib/Project.svelte'
import { WorkbenchSession } from '$lib/workbench/WorkbenchSession.svelte'
import { preferencesStore } from '$stores/preferencesStore.svelte'
import BelowLineContent from '$cmp/specific/project/user-tools/BelowLineContent.svelte'
import { flushSync } from 'svelte'

export async function setupRealStepping(language: 'RISC-V' | 'MIPS' = 'RISC-V') {
    const code =
        language === 'RISC-V'
            ? `
.globl main
main:
    li a0, 0x12345678
    addi a0, a0, 1
    ret
`.trim()
            : `
.globl main
main:
    li $t0, 0x12345678
    addi $t0, $t0, 1
    jr $ra
`.trim()

    const sources = {
        entry: 'main.s',
        files: { 'main.s': { encoding: 'plain' as const, content: code } }
    }
    const emulator = language === 'RISC-V' ? RISCVEmulator(sources) : MIPSEmulator(sources)
    await emulator.check()
    await emulator.compile(20, sources)

    const project = makeProject({
        language,
        entry: 'main.s',
        files: { 'main.s': { encoding: 'plain', content: code } }
    })

    let session!: WorkbenchSession
    const disposeEffects = $effect.root(() => {
        session = new WorkbenchSession(project, emulator as never, {
            readonly: false,
            canEditTestcases: true
        })
    })

    // Build project in session
    await session.build()
    const group = session.groups[0]

    let viewZonesRuns = 0
    let editorEffectRuns = 0

    const triggers: string[] = []
    const testRoot = $effect.root(() => {
        $effect(() => {
            void group.sourceView
            triggers.push('group.sourceView')
        })
        $effect(() => {
            void preferencesStore.values.showPseudoInstructions.value
            triggers.push('preferencesStore')
        })
        $effect(() => {
            void emulator.decorations
            triggers.push('emulator.decorations')
        })
        $effect(() => {
            for (const d of emulator.decorations) {
                void d.file
                void d.belowLine
                void d.md
                void d.note
                void d.instructions
            }
            triggers.push('decorations.fields')
        })
        $effect(() => {
            void emulator.buildSources?.entry
            triggers.push('emulator.buildSources?.entry')
        })
        $effect(() => {
            void group.displayedPath
            triggers.push('group.displayedPath')
        })
        $effect(() => {
            void group.displayedLanguage
            triggers.push('group.displayedLanguage')
        })
        $effect(() => {
            void emulator.pc
            triggers.push('emulator.pc')
        })

        const viewZones = $derived.by(() => {
            viewZonesRuns++
            return group.sourceView === 'snapshot' &&
                preferencesStore.values.showPseudoInstructions.value
                ? emulator.decorations
                      .filter(
                          (decoration) =>
                              (decoration.file ?? emulator.buildSources?.entry) ===
                              group.displayedPath
                      )
                      .map((decoration) => {
                          return {
                              afterLineNumber: decoration.belowLine,
                              content: BelowLineContent,
                              props: {
                                  md: decoration.md,
                                  note: decoration.note ?? '',
                                  instructions: decoration.instructions,
                                  language: group.displayedLanguage.toLowerCase(),
                                  isCurrent: (address: bigint) => emulator.pc === address
                              }
                          }
                      })
                : []
        })

        $effect(() => {
            const zones = viewZones
            if (group.modelKey && zones.length > 0) {
                editorEffectRuns++
            }
        })
    })

    flushSync()

    return {
        session,
        emulator,
        group,
        triggers,
        getCounts: () => ({ viewZonesRuns, editorEffectRuns }),
        dispose: () => {
            testRoot()
            disposeEffects()
            session.models.dispose()
        }
    }
}
