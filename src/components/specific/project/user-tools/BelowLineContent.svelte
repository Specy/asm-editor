<script lang="ts">
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import { Monaco } from '$lib/monaco/Monaco'

    interface Props {
        md: string
        note: string
        instructions?: { address: bigint; code: string }[]
        /** Monaco language id, so an expansion is coloured by the Target's own tokenizer. */
        language?: string
        /**
         * Asked per row rather than given the address outright: the executing address changes on
         * every step, and a plain prop would rebuild the whole zone instead of repainting a marker.
         */
        isCurrent?: (address: bigint) => boolean
    }

    let { md, note, instructions, language, isCurrent }: Props = $props()

    /**
     * Monaco colours the expansion with the same tokenizer as the source above it. It colours the
     * block in one call and splits the rows back apart, so each row stays its own element and can
     * carry the step marker. A row count that does not survive the split means the Monaco version
     * changed its separator, and the plain text is rendered instead.
     */
    let highlighted = $state<string[] | null>(null)

    $effect(() => {
        const rows = instructions?.map((instruction) => instruction.code)
        const languageId = language
        if (!rows || rows.length === 0 || !languageId) {
            highlighted = null
            return
        }
        let cancelled = false
        void (async () => {
            try {
                const monaco = await Monaco.get()
                const html = await monaco.editor.colorize(rows.join('\n'), languageId, {})
                if (cancelled) return
                //Monaco ends every line with the separator, the last one included, so the split
                //leaves a trailing empty row to drop before the count can be trusted
                const split = html.split('<br/>')
                if (split[split.length - 1] === '') split.pop()
                highlighted = split.length === rows.length ? split : null
            } catch {
                if (!cancelled) highlighted = null
            }
        })()
        return () => {
            cancelled = true
        }
    })
</script>

<div class="below-line-content">
    {#if instructions}
        <div class="generated-code">
            <!-- The address is deliberately not shown: it repeats for every expanded instruction
                 and crowds the source. The accent bar still marks the one being executed, and the
                 Build hover on the source line gives the addresses when they are wanted. -->
            {#each instructions as instruction, index (`${instruction.address}:${index}`)}
                <div class:current={isCurrent?.(instruction.address)}>
                    {#if highlighted}
                        <!-- Monaco's colorizer escapes the line it is given and emits only its own
                             token spans, and the line it is given is assembly the Core generated,
                             never user markup. -->
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                        <code>{@html highlighted[index]}</code>
                    {:else}
                        <code>{instruction.code}</code>
                    {/if}
                </div>
            {/each}
        </div>
    {:else}
        <MarkdownRenderer source={md} simpleCode />
    {/if}
    {#if note}
        <div class="note">
            {note}
        </div>
    {/if}
</div>

<style lang="scss">
    .below-line-content {
        position: relative;
        background-color: rgba(var(--RGB-tertiary), 0.3);
        //border-top: 0.1rem solid rgba(var(--RGB-accent), 0.5);
        //border-bottom: 0.1rem solid rgba(var(--RGB-accent), 0.5);
        border-left: solid 1px #404040;
        padding: 0.1rem 0;
        font-size: 1rem;
    }

    .note {
        position: absolute;
        top: 50%;
        right: 0.5rem;
        line-height: 1;
        opacity: 0.5;
        font-size: 0.8rem;
        transform: translateY(-50%);
    }

    .generated-code {
        //no horizontal padding: column zero of a row has to be column one of the Editor, so the
        //indent carried in the text is what lines an expansion up with its source instruction
        padding: 0.2rem 0;
        overflow-x: auto;
        background: var(--secondary);
        font-family: 'Fira Mono', monospace;
        white-space: pre;

        > div {
            position: relative;

            //the marker is drawn over the row rather than inset into it, so being the executing
            //instruction does not shift the text sideways
            &.current {
                background: rgba(var(--RGB-accent), 0.16);

                &::before {
                    content: '';
                    position: absolute;
                    inset-block: 0;
                    left: 0;
                    width: 2px;
                    background: var(--accent);
                }
            }
        }
    }
</style>
