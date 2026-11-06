<script lang="ts">
    /**
     * The picture behind the home page's hero: the editor's Workbench, drawn faintly with the
     * editor's own registers, memory and execution dock, running a RISC-V program one instruction
     * at a time and undoing two steps once a pass. The code is a plain code block rather than the
     * editor, which would be far too heavy for this. Nothing in it can be used: the registers and
     * memory are fed from a trace worked out in advance, moved along by one timer that waits while
     * the hero is off screen or the tab is hidden, and never starts for a reader who prefers less
     * motion.
     */
    import { onMount, untrack } from 'svelte'
    import { tokenizeAssembly } from '#lib/content/assemblyHighlight.ts'
    import { assemblyTokenClass } from '#lib/content/assemblyPalette.ts'
    import { codeBlockStyle } from '#lib/content/codeBlockStyle.ts'
    import { makeRegister, RegisterSize } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import { MEMORY_SIZE } from '#lib/Config.ts'
    import RegistersRenderer from '#cmp/specific/project/cpu/RegistersRenderer.svelte'
    import MemoryRenderer from '#cmp/specific/project/memory/MemoryRenderer.svelte'
    import ExecutionDock from '#cmp/specific/project/ExecutionDock.svelte'
    import '#cmp/shared/markdown/codeBlocks.css'
    import '#cmp/specific/workbench/workbench.css'
    import FaCopy from '~icons/fa-solid/copy'
    import FaSearch from '~icons/fa-solid/search'
    import FaFlask from '~icons/fa-solid/flask'
    import FaBook from '~icons/fa-solid/book'
    import FaTags from '~icons/fa-solid/tags'
    import FaHistory from '~icons/fa-solid/history'
    import FaCog from '~icons/fa-solid/cog'
    import { HERO_DATA_BASE, HERO_PROGRAM, heroTrace } from './heroProgram.ts'

    const states = heroTrace()
    const lines = tokenizeAssembly(HERO_PROGRAM, 'RISC-V').map((tokens) =>
        tokens.map((token) => ({
            text: token.text,
            className: assemblyTokenClass(token, 'RISC-V')
        }))
    )
    /** The RISC-V register file, in the order the editor lists it. */
    const REGISTER_NAMES = [
        'zero',
        'ra',
        'sp',
        'gp',
        'tp',
        't0',
        't1',
        't2',
        's0',
        's1',
        'a0',
        'a1',
        'a2',
        'a3',
        'a4',
        'a5',
        'a6',
        'a7',
        's2',
        's3',
        's4',
        's5',
        's6',
        's7',
        's8',
        's9',
        's10',
        's11',
        't3',
        't4',
        't5',
        't6'
    ]
    const valueOf = (state: (typeof states)[number], name: string) =>
        (state.registers as Record<string, number>)[name] ?? 0
    const pc = makeRegister('pc', states[0].pc, RegisterSize.Long)
    const registers = REGISTER_NAMES.map((name) =>
        makeRegister(name, valueOf(states[0], name), RegisterSize.Long)
    )
    /** Rows enough to fill the column, as the editor's memory fills its own. */
    const PAGE_SIZE = 8 * 40
    const page = (memory: number[]) => {
        const bytes = new Uint8Array(PAGE_SIZE)
        bytes.set(memory)
        return bytes
    }
    const SP = BigInt(valueOf(states[0], 'sp'))

    /** The state after the loop's second pass stored its first number and added: each pass undoes
     * those two steps, the store among them. */
    const UNDO_AT = 13
    const STEP_MS = 2200
    const HOLD_MS = 5000

    let position = $state(0)
    let previous = $state(0)
    const current = $derived(states[position])
    const memory = $derived({
        current: page(current.memory),
        prevState: page(states[previous].memory)
    })
    const ended = $derived(position === states.length - 1)

    //the registers keep their own previous value, which is what lights a change up
    //untracked: setValue reads the value it replaces, and depending on it would run this again at
    //once, leaving no change to show
    $effect(() => {
        const state = current
        untrack(() => {
            pc.setValue(state.pc)
            registers.forEach((register, i) => register.setValue(valueOf(state, REGISTER_NAMES[i])))
        })
    })

    let root: HTMLElement
    onMount(() => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            position = previous = UNDO_AT
            return
        }
        let visible = typeof IntersectionObserver === 'undefined'
        let timer: ReturnType<typeof setTimeout> | undefined
        let queue: ('step' | 'undo')[] = []
        let undone = false
        const tick = (): number => {
            if (position === states.length - 1) {
                undone = false
                previous = position = 0
                return STEP_MS
            }
            if (queue.length === 0) {
                if (position === UNDO_AT && !undone) {
                    undone = true
                    queue = ['undo', 'undo', 'step', 'step']
                } else queue = ['step']
            }
            previous = position
            position += queue.shift() === 'step' ? 1 : -1
            return position === states.length - 1 ? HOLD_MS : STEP_MS
        }
        const schedule = (delay: number) => {
            clearTimeout(timer)
            if (visible && document.visibilityState === 'visible')
                timer = setTimeout(() => schedule(tick()), delay)
        }
        const observer =
            typeof IntersectionObserver === 'undefined'
                ? undefined
                : new IntersectionObserver(([entry]) => {
                      visible = entry.isIntersecting
                      schedule(STEP_MS)
                  })
        observer?.observe(root)
        const onVisibility = () => schedule(STEP_MS)
        document.addEventListener('visibilitychange', onVisibility)
        schedule(STEP_MS)
        return () => {
            clearTimeout(timer)
            observer?.disconnect()
            document.removeEventListener('visibilitychange', onVisibility)
        }
    })

    const noop = () => {}
</script>

<div class="backdrop wb-cards" bind:this={root} aria-hidden="true" inert style={codeBlockStyle()}>
    <div class="rail card">
        <span class="active"><FaCopy /></span>
        <span><FaSearch /></span>
        <span><FaFlask /></span>
        <span><FaBook /></span>
        <span><FaTags /></span>
        <span><FaHistory /></span>
        <span class="last"><FaCog /></span>
    </div>
    <div class="editor card">
        <div class="tabs">
            <span>README.md</span>
            <span class="active">main.riscv <b>ENTRY</b></span>
        </div>
        <div class="code asm-highlight">
            {#each lines as tokens, index (index)}
                <div class="line" class:current={index === current.line}>
                    <span class="number">{index + 1}</span><span class="text"
                        >{#each tokens as token, t (t)}{#if token.className}<span
                                    class={token.className}>{token.text}</span
                                >{:else}{token.text}{/if}{/each}</span
                    >
                </div>
            {/each}
        </div>
        <div class="dock">
            <ExecutionDock
                attached
                debugging
                building={false}
                running={false}
                buildDisabled={false}
                executionDisabled={ended}
                {ended}
                canUndo={position > 0}
                onBuild={noop}
                onStop={noop}
                onRun={noop}
                onPause={noop}
                onUndo={noop}
                onStep={noop}
            />
        </div>
    </div>
    <div class="registers card">
        <RegistersRenderer
            systemSize={RegisterSize.Long}
            language="RISC-V"
            style="flex: none; overflow: unset; padding: 0;"
            gridStyle="padding: 0 0.2rem"
            align="start"
            size={RegisterSize.Long}
            registers={[pc]}
            withoutHeader
            position="bottom"
        />
        <RegistersRenderer
            systemSize={RegisterSize.Long}
            language="RISC-V"
            style="flex: 1; min-height: 0;"
            size={RegisterSize.Long}
            {registers}
        />
    </div>
    <div class="memory card">
        <MemoryRenderer
            systemSize={RegisterSize.Long}
            endianess="little"
            memorySize={MEMORY_SIZE['RISC-V']}
            dense
            defaultMemoryValue={0}
            bytesPerRow={8}
            pageSize={PAGE_SIZE}
            {memory}
            currentAddress={BigInt(HERO_DATA_BASE)}
            sp={SP}
        />
    </div>
</div>

<style lang="scss">
    /* the whole width of the screen, from the navbar down to the rule over the quick links */
    .backdrop {
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: 2.8rem minmax(0, 1fr) 15rem auto;
        grid-template-rows: minmax(0, 1fr);
        gap: var(--wb-gap);
        padding: var(--wb-gap);
        overflow: hidden;
        pointer-events: none;
        user-select: none;
        background: var(--background);
        mask-image: radial-gradient(ellipse 30% 50% at 50% 50%, transparent 42%, #000 100%);
    }

    /* faint, but the registers and memory a little less, so what each step changes shows */
    /* both sides fade into the page, from the screen's edges to its middle, as the bytes under
       the quick links do: the memory side all the way, the code side lighter */
    .backdrop::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--background) 55%, transparent),
            transparent 50%,
            var(--background)
        );
        pointer-events: none;
    }

    .card {
        opacity: 0.3;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: var(--wb-surface);
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
    }

    .rail {
        grid-row: 1 / -1;
        align-items: center;
        gap: 0.4rem;
        padding: 0.5rem 0;

        span {
            display: grid;
            place-items: center;
            width: 2.1rem;
            height: 2.1rem;
            border-radius: 0.3rem;
            color: color-mix(in srgb, var(--secondary-text) 60%, transparent);

            :global(svg) {
                width: 1rem;
            }
        }

        .active {
            background: var(--tertiary);
            color: var(--tertiary-text);
        }

        .last {
            margin-top: auto;
        }
    }

    .editor {
        position: relative;
        grid-column: 2;
        grid-row: 1;
    }

    .tabs {
        display: flex;
        flex: none;
        height: 2.2rem;
        background: var(--wb-strip);
        font-size: 0.85rem;

        span {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0 1rem;
            color: color-mix(in srgb, var(--secondary-text) 70%, transparent);
        }

        .active {
            background: var(--wb-surface);
            color: var(--secondary-text);
        }

        b {
            font-weight: 500;
            font-size: 0.6rem;
            padding: 0.05rem 0.35rem;
            border-radius: 0.3rem;
            background: var(--accent);
            color: var(--accent-text);
        }
    }

    .code {
        flex: 1;
        padding-top: 0.4rem;
        overflow: hidden;
        font-family: var(--example-font-family, 'Fira Code', monospace);
        font-size: var(--example-font-size, 0.95rem);
        color: var(--secondary-text);
    }

    .line {
        display: flex;
        white-space: pre;
        line-height: var(--example-line-height, 1.5rem);
    }

    .number {
        flex: none;
        width: 3.4rem;
        padding-right: 1.4rem;
        text-align: right;
        opacity: 0.45;
    }

    .line.current {
        background: var(--accent);

        .number,
        .text,
        .text :global(span) {
            color: var(--accent-text);
            opacity: 1;
        }
    }

    .dock {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
    }

    .registers,
    .memory {
        opacity: 0.48;
    }

    /* registers beside memory, as the Workbench's Debug column has them */
    .registers {
        grid-column: 3;
        grid-row: 1 / -1;
        gap: 0.3rem;
        padding-top: 0.2rem;
        --panel-radius: 0px;
    }

    /* as wide as a row of 8 bytes, the Workbench's narrower memory page */
    .memory {
        grid-column: 4;
        grid-row: 1 / -1;
    }

    @media (max-width: 1000px) {
        .backdrop {
            grid-template-columns: 2.8rem minmax(0, 1fr) minmax(14rem, 0.7fr);
            mask-image: radial-gradient(ellipse 55% 48% at 50% 50%, transparent 35%, #000 100%);
        }

        .memory {
            display: none;
        }
    }

    @media (max-width: 640px) {
        .backdrop {
            grid-template-columns: minmax(0, 1fr);
        }

        /* the code alone fills a phone, and the centre already clears for the words */
        .backdrop::after {
            display: none;
        }

        .card {
            opacity: 0.2;
        }

        .rail,
        .registers {
            display: none;
        }

        .editor {
            grid-column: 1;
        }
    }
</style>
