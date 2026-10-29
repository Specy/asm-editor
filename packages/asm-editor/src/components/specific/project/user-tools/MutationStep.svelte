<script lang="ts">
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaUndo from '~icons/fa-solid/undo'
    import {
        type ExecutionStep,
        type MutationOperation,
        type PokeWrite,
        type RegisterSize
    } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import { sizeName } from '#lib/languages/sizeNames.ts'
    import { statusFlagsFromBits } from '#lib/languages/statusFlagBits.ts'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import {
        CYCLE_ESTIMATE_MARK,
        cycleEstimateReason,
        formatCycles
    } from '#lib/languages/cycles.ts'

    interface Props {
        step: ExecutionStep
        /** Why "Undo to here" cannot take the program back to this row; undefined when it can. */
        undoBlocked?: string
        flags: string[]
        /** The Target, which names the width a written mutation reports (`sizeNames.ts`). */
        language: AvailableLanguages
        /**
         * The processor the program is written for, as the panels name it, which says why its
         * cycles are an estimate: `68020`, or `68000 with bit fields`.
         */
        processor?: string
        /** Contrast with the section surface when shown in a docked History panel. */
        docked?: boolean
        /** "Undo to here" was pressed. */
        onUndo?: () => void
        /** "Go to line" was pressed, to show the step's line in the code. */
        onHighlight?: (step: ExecutionStep) => void
    }

    let {
        step,
        flags,
        language,
        processor,
        undoBlocked,
        docked = false,
        onUndo,
        onHighlight
    }: Props = $props()
    //each Core records its own status register, so the bits are read with the Target's own layout
    let ccr = $derived(statusFlagsFromBits(language, step.new_ccr.bits))

    /**
     * A Poke is a row of its own ([the design record](../../../../../../../docs/design/pokes.md)): what
     * was poked and the value it held before, with no PC line and nothing to go to, since no
     * instruction ran. The writes are the step's own, not its mutations, so the row names the
     * register the way the Register file spells it.
     */
    const pokes = $derived(step.kind === 'poke' ? (step.writes ?? []) : [])

    /**
     * An IRQ is a row of its own too (M68K,
     * [m68k-machine.md](../../../../../../../docs/design/m68k-machine.md), decision 28): no
     * instruction ran, so its heading is the request it took and the handler it went to, "IRQ 2 →
     * timer at $102C", and what follows is what taking it wrote. One whose vector held no handler
     * pushed nothing, and its title says so.
     */
    const irq = $derived(
        step.kind === 'irq'
            ? step.mutations.find(
                  (mutation): mutation is Extract<MutationOperation, { type: 'TakeException' }> =>
                      mutation.type === 'TakeException'
              )
            : undefined
    )
    /** What the row lists under its heading: everything but the IRQ the heading names. */
    const listed = $derived(
        irq ? step.mutations.filter((mutation) => mutation !== irq) : step.mutations
    )

    function hex(value: bigint): string {
        return value.toString(16).toUpperCase()
    }

    /**
     * The two values of a poked register, padded to the same number of digits so the row reads
     * across: a `PokeWrite` carries no register width, so the wider of the two is what the other is
     * padded to, the way the memory branch pads each byte to its two digits.
     */
    function pokedHex(value: bigint, other: bigint): string {
        return hex(value).padStart(Math.max(hex(value).length, hex(other).length), '0')
    }

    function bytes(values: number[]): string {
        return values.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    }

    /**
     * Where the row says the value went: the register, upper-cased because the panel beside the
     * row draws every name that way (a Z80 `hl` poked from the panel reads `HL` here too, as the
     * verification matrix asks), or the address of a run of memory bytes.
     */
    function pokeTarget(write: PokeWrite): string {
        return write.type === 'register' ? write.name.toUpperCase() : `$${hex(write.address)}`
    }

    /** The value a Poke wrote, or the one it found: hex for a register, the bytes for memory. */
    function pokeValue(write: PokeWrite, which: 'old' | 'new'): string {
        if (write.type === 'register') {
            return `0x${which === 'new' ? pokedHex(write.new, write.old) : pokedHex(write.old, write.new)}`
        }
        return bytes(write[which])
    }

    type Write = Extract<
        MutationOperation,
        { type: 'WriteRegister' | 'WriteMemory' | 'WriteMemoryBytes' }
    >

    function isWrite(mutation: MutationOperation): mutation is Write {
        return (
            mutation.type === 'WriteRegister' ||
            mutation.type === 'WriteMemory' ||
            mutation.type === 'WriteMemoryBytes'
        )
    }

    /** A value in the digits of the width it was written at: the low word of a `.w` write. */
    function hexSized(value: bigint, size: RegisterSize): string {
        return `0x${BigInt.asUintN(8 * size, value)
            .toString(16)
            .toUpperCase()
            .padStart(2 * size, '0')}`
    }

    /** Where a write went, the register upper-cased the way the panel beside the row draws it. */
    function writeTarget(mutation: Write): string {
        return mutation.type === 'WriteRegister'
            ? mutation.value.register.toUpperCase()
            : `$${hex(mutation.value.address)}`
    }

    /** What a write is called: its width, or its byte count, and where it went. */
    function writeLabel(mutation: Write): string {
        const width =
            mutation.type === 'WriteMemoryBytes'
                ? `${mutation.value.old.length} bytes`
                : sizeName(mutation.value.size, language).long
        return `Wrote ${width} to ${writeTarget(mutation)}`
    }

    /**
     * The two sides of a write as the Core reports them: what it wrote, when the Core says, and in
     * parentheses what it found. Neither is reconstructed here, so a write whose Core hands over
     * neither side has no detail to open.
     */
    function writeValues(mutation: Write): { written?: string; found?: string } {
        if (mutation.type === 'WriteMemoryBytes') {
            return {
                written: mutation.value.new && bytes(mutation.value.new),
                found: bytes(mutation.value.old)
            }
        }
        const { size } = mutation.value
        return {
            written:
                mutation.value.new === undefined ? undefined : hexSized(mutation.value.new, size),
            found: mutation.value.old === undefined ? undefined : hexSized(mutation.value.old, size)
        }
    }

    function hasValues(mutation: MutationOperation): boolean {
        if (!isWrite(mutation)) return false
        const values = writeValues(mutation)
        return values.written !== undefined || values.found !== undefined
    }

    function writeDetail(mutation: Write): string {
        const width =
            mutation.type === 'WriteMemoryBytes'
                ? `${mutation.value.old.length} bytes`
                : sizeName(mutation.value.size, language).long
        const { written, found } = writeValues(mutation)
        const wrote = written === undefined ? `Wrote ${width}` : `Wrote ${width} ${written}`
        const was = found === undefined ? '' : ` (was ${found})`
        return `${wrote} to ${writeTarget(mutation)}${was}`
    }

    /**
     * The writes opened to their values, by position in the step. The list is rebuilt on every
     * refresh and this component is reused for whatever step lands at its index, so what was
     * opened is kept only while the step under it is the same one: a step is told by its address,
     * its line and what it did.
     */
    let expanded: number[] = $state([])
    let expandedFor = $state('')
    const stepKey = $derived(
        `${step.pc}/${step.line}/${step.mutations
            .map((mutation) =>
                mutation.type === 'Other'
                    ? mutation.value
                    : `${mutation.type}:${JSON.stringify(mutation.value, (_key, value) =>
                          typeof value === 'bigint' ? value.toString() : value
                      )}`
            )
            .join('|')}`
    )
    $effect(() => {
        if (stepKey !== expandedFor) {
            expandedFor = stepKey
            expanded = []
        }
    })

    function toggle(index: number) {
        expanded = expanded.includes(index)
            ? expanded.filter((other) => other !== index)
            : [...expanded, index]
    }
</script>

<!--
    what the step took on a Target that counts cycles, an M68K's with its processor's timing, marked
    "≈ 8" where that is an estimate, the 68020's cache case or a bit field's under `opt bit`, which
    the hover explains
-->
{#snippet cyclesRow(cycles: number)}
    <div class="row space-between">
        <span> Cycles </span>
        {#if step.cyclesEstimate}
            <span class="cycles" {@attach tooltip(`An estimate. ${cycleEstimateReason(processor)}`)}
                >{CYCLE_ESTIMATE_MARK} {formatCycles(cycles)}</span
            >
        {:else}
            <span class="cycles">{formatCycles(cycles)}</span>
        {/if}
    </div>
{/snippet}

<div class="column step" class:docked>
    <div class="step-header column">
        <button
            {@attach tooltip(undoBlocked ?? 'Undo to here')}
            aria-label="Undo to here"
            disabled={undoBlocked !== undefined}
            class="undo-to-here"
            onclick={() => onUndo?.()}
        >
            <Icon size={0.75}>
                <FaUndo />
            </Icon>
        </button>
        {#if step.kind === 'poke'}
            <!--
                no PC line and no flags: nothing ran, and a Core that reports no flags for a Poke
                would have the row drawing every one of them as clear
            -->
            <div class="column pokes">
                {#if step.title}
                    <!-- what the Poke was for, such as a patched instruction, above the bytes it wrote -->
                    <div class="poke-title">{step.title}</div>
                {/if}
                {#each pokes as write, i (i)}
                    <!--
                        one sentence, in the words the instruction rows below use, so the two
                        values need no legend: what was written, where, and what was there
                    -->
                    <div class="poke-write">
                        Wrote <span class="poke-value">{pokeValue(write, 'new')}</span> to
                        {pokeTarget(write)}
                        <span class="poked-old"
                            >(was <span class="poke-value">{pokeValue(write, 'old')}</span>)</span
                        >
                    </div>
                {/each}
            </div>
        {:else if step.kind === 'irq'}
            <div class="irq-title exception">
                {#if irq}
                    {irq.value.name} →
                    {#if irq.value.label}<code class="handler">{irq.value.label}</code>{:else}the
                        handler{/if} at ${hex(irq.value.handler)}
                {:else}
                    {step.title ?? 'IRQ'}
                {/if}
            </div>
            {#if step.cycles !== undefined}
                {@render cyclesRow(step.cycles)}
            {/if}
        {:else}
            <div class="row space-between">
                <span> PC </span>
                <span class="pc">
                    <span style="opacity: 0.6"> 0x </span>{step.pc.toString(16).toUpperCase()}
                    <button
                        {@attach tooltip('Go to line')}
                        class="go-to-line"
                        onclick={() => onHighlight?.(step)}
                    >
                        go
                    </button>
                </span>
            </div>
            {#if step.disassembly}
                <!-- what ran where no source line says: in data, or in code the program changed -->
                <div class="row space-between">
                    <span> Ran </span>
                    <code
                        class="disassembly"
                        {@attach tooltip(
                            step.line < 0
                                ? 'Decoded from memory: no line of the source is here'
                                : 'Decoded from memory: this line’s bytes changed since the Build'
                        )}>{step.disassembly}</code
                    >
                </div>
            {/if}
            {#if step.undoable === false}
                <div class="stretch">Undo stops here: effects are not recorded.</div>
            {/if}
            {#if step.stretch}
                <!-- a Step that ran through library code: one Undo takes all of it back. A C++
                     function it called reads short, its signature and raw name in the tooltip -->
                <div
                    class="stretch"
                    title={[
                        step.stretch.detail,
                        step.undoable === false
                            ? 'This call includes effects Undo cannot restore'
                            : 'One Undo takes back the call and the library code it ran'
                    ]
                        .filter(Boolean)
                        .join('\n')}
                >
                    Called {step.stretch.library}: {step.stretch.instructions.toLocaleString()} instructions
                </div>
            {/if}
            {#if flags.length !== 0}
                <div class="row space-between">
                    <span> CCR </span>
                    <span>
                        <div class="row flags">
                            {#each flags as flag, i (flag)}
                                <div class="flag" class:flag-active={ccr[i]}>
                                    {flag}
                                </div>
                            {/each}
                        </div>
                    </span>
                </div>
            {/if}
            {#if step.cycles !== undefined}
                {@render cyclesRow(step.cycles)}
            {/if}
        {/if}
    </div>

    {#if step.kind !== 'poke' && !step.stretch && listed.length !== 0}
        <div class="column mutations">
            {#each listed as mutation, i (i)}
                {#if isWrite(mutation) && hasValues(mutation)}
                    <!--
                        a write opens to the values its Core reports, and stays marked while open
                    -->
                    <button
                        class="mutation"
                        class:expanded={expanded.includes(i)}
                        {@attach tooltip(
                            expanded.includes(i) ? 'Hide the values' : 'Show the values'
                        )}
                        onclick={() => toggle(i)}
                    >
                        {expanded.includes(i) ? writeDetail(mutation) : writeLabel(mutation)}
                    </button>
                {:else if isWrite(mutation)}
                    <div class="mutation-plain">{writeLabel(mutation)}</div>
                {:else if mutation.type === 'PopCallStack'}
                    <div class="mutation-plain">
                        Popped call from {hex(mutation.value.from)} to {hex(mutation.value.to)}
                    </div>
                {:else if mutation.type === 'PushCallStack'}
                    <div class="mutation-plain">
                        Pushed call from {hex(mutation.value.from)} to {hex(mutation.value.to)}
                    </div>
                {:else if mutation.type === 'TakeException'}
                    <!--
                        what the instruction raised, the vector the processor went through and the
                        handler it jumped to: "Divide by zero → vector 5, div_handler at $1040"
                    -->
                    <div class="mutation-plain exception">
                        {mutation.value.name} → vector {mutation.value.vector},
                        {#if mutation.value.label}<code class="handler">{mutation.value.label}</code
                            >{:else}the handler{/if} at ${hex(mutation.value.handler)}
                    </div>
                {:else if mutation.type === 'ReturnFromException'}
                    <div class="mutation-plain">
                        Returned from the exception to ${hex(mutation.value.to)}
                    </div>
                {:else if mutation.type === 'Other'}
                    <div class="mutation-plain">{mutation.value}</div>
                {/if}
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    .disassembly {
        font-family: 'Fira Code', monospace;
        font-size: 0.8rem;
        overflow-wrap: anywhere;
        text-align: right;
    }
    .cycles {
        font-family: 'Fira Code', monospace;
        font-size: 0.85rem;
    }
    .stretch {
        font-size: 0.8rem;
        opacity: 0.85;
        overflow-wrap: anywhere;
    }
    .undo-to-here {
        position: absolute;
        top: 0;
        left: 0rem;
        width: 2.4rem;
        padding: 0.2rem 0.4rem;
        height: 100%;
        border: none;
        background-color: var(--accent);
        color: var(--accent-text);
        display: flex;
        opacity: 0;
        pointer-events: none;
        align-items: center;
        justify-content: center;
        font-size: 0.8rem;
        transition: all 0.2s;
        font-family: Rubik;
        border-radius: 0.2rem;
    }

    .go-to-line {
        position: absolute;
        top: 0;
        right: 0;
        border: none;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        background-color: var(--accent);
        color: var(--accent-text);
        font-size: 0.8rem;
        font-family: Rubik;
        border-radius: 0.2rem;
        opacity: 0;
    }

    .pc {
        position: relative;
    }

    .step-header {
        justify-content: center;
        position: relative;

        &:hover:not(:has(.go-to-line:hover)) {
            .undo-to-here:not(:disabled) {
                opacity: 1;
                cursor: pointer;
                pointer-events: all;
            }
        }
        &:hover:not(:has(.undo-to-here:hover)) {
            .go-to-line {
                opacity: 1;
                cursor: pointer;
                pointer-events: all;
            }
        }
    }

    .step {
        border-radius: 0.4rem;
        padding: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }

    .step.docked {
        padding: 0.3rem;
        background-color: var(--primary);
        color: var(--primary-text);
        border: 1px solid var(--wb-line, var(--tertiary));
    }

    .flags {
        gap: 0.3rem;
    }

    .flag {
        border-radius: 0.2rem;
        opacity: 0.3;

        &.flag-active {
            opacity: 1;
            font-weight: bold;
            color: var(--accent);
        }
    }

    //what a Poke changed, which is the row's whole content: the value it found and the value it left
    .pokes {
        gap: 0.1rem;
        //the undo button covers the left of the header, so the text starts past it
        padding-left: 0.1rem;
    }

    .poke-write {
        font-size: 0.9rem;
        overflow-wrap: anywhere;
    }

    .poke-title {
        font-size: 0.9rem;
        font-weight: 500;
        overflow-wrap: anywhere;
    }

    .poke-value {
        font-family: monospace;
    }

    //an IRQ's heading: the request and its handler, the whole of what the row is about
    .irq-title {
        font-size: 0.9rem;
        font-weight: 500;
        padding: 0.15rem 0.3rem;
    }

    //the value the Poke found, in the colour the panels give a previous value
    .poked-old {
        color: var(--accent);
    }

    .mutations {
        gap: 0.1rem;
        margin-top: 0.3rem;
        padding-top: 0.3rem;
        font-size: 0.9rem;
        border-top: var(--wb-line, var(--tertiary)) solid 2px;
    }

    .mutation-plain {
        padding: 0.15rem 0.3rem;
    }

    //an exception taken is what the row is about, so it stands out from the frame it pushed
    .exception {
        overflow-wrap: anywhere;
        border-left: 2px solid var(--accent);
        border-radius: 0.2rem;
        background-color: color-mix(in srgb, var(--accent) 10%, transparent);
    }

    .handler {
        font-family: 'Fira Code', monospace;
        font-size: 0.85em;
    }

    //a write the person can open: tinted with the accent on hover, and more while it stands open
    //on its values, so the row that is showing more is the row that was clicked
    .mutation {
        text-align: left;
        padding: 0.15rem 0.3rem;
        border-radius: 0.3rem;
        font: inherit;
        color: inherit;
        background-color: transparent;
        cursor: pointer;
        overflow-wrap: anywhere;
        transition: background-color 0.15s;

        &:hover {
            background-color: color-mix(in srgb, var(--accent) 12%, transparent);
        }

        &.expanded {
            background-color: color-mix(in srgb, var(--accent) 24%, transparent);
        }
    }
</style>
