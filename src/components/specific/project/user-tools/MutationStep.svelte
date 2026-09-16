<script lang="ts">
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import { ccrToFlagsArray } from '@specy/s68k'
    import { createEventDispatcher } from 'svelte'
    import FaUndo from '~icons/fa-solid/undo'
    import {
        type ExecutionStep,
        type MutationOperation,
        type PokeWrite,
        type RegisterSize
    } from '$lib/languages/commonLanguageFeatures.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import { sizeName } from '$lib/languages/sizeNames'

    interface Props {
        step: ExecutionStep
        flags: string[]
        /** The Target, which names the width a written mutation reports (`sizeNames.ts`). */
        language: AvailableLanguages
    }

    let { step, flags, language }: Props = $props()
    let ccr = $derived(ccrToFlagsArray(step.new_ccr.bits).reverse())

    /**
     * A Poke is a row of its own ([the design record](../../../../../docs/design/pokes.md)): what
     * was poked and the value it held before, with no PC line and nothing to go to, since no
     * instruction ran. The writes are the step's own, not its mutations, so the row names the
     * register the way the Register file spells it.
     */
    const pokes = $derived(step.kind === 'poke' ? (step.writes ?? []) : [])

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

    const dispatcher = createEventDispatcher<{
        undo: void
        highlight: ExecutionStep
    }>()
</script>

<div class="column step">
    <div class="step-header column">
        <button
            title="Undo to here"
            class="undo-to-here"
            onclick={() => {
                dispatcher('undo')
            }}
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
        {:else}
            <div class="row space-between">
                <span> PC </span>
                <span class="pc">
                    <span style="opacity: 0.6"> 0x </span>{step.pc.toString(16).toUpperCase()}
                    <button
                        title="Go to line"
                        class="go-to-line"
                        onclick={() => {
                            dispatcher('highlight', step)
                        }}
                    >
                        go
                    </button>
                </span>
            </div>
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
        {/if}
    </div>

    {#if step.kind !== 'poke' && step.mutations.length !== 0}
        <div class="column mutations">
            {#each step.mutations as mutation, i (i)}
                {#if isWrite(mutation) && hasValues(mutation)}
                    <!--
                        a write opens to the values its Core reports, and stays marked while open
                    -->
                    <button
                        class="mutation"
                        class:expanded={expanded.includes(i)}
                        title={expanded.includes(i) ? 'Hide the values' : 'Show the values'}
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
                {:else if mutation.type === 'Other'}
                    <div class="mutation-plain">{mutation.value}</div>
                {/if}
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
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
            .undo-to-here {
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

    .poke-value {
        font-family: monospace;
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
        border-top: var(--tertiary) solid 2px;
    }

    .mutation-plain {
        padding: 0.15rem 0.3rem;
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
