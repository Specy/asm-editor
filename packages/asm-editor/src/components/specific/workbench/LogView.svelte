<script lang="ts">
    /** The Log: what the Workbench did, newest at the bottom. */
    import EmptyState from '#cmp/shared/misc/EmptyState.svelte'
    import { noteSpans, type LogEntry, type LogTone } from '#lib/workbench/workbenchLog.ts'

    interface Props {
        entries: readonly LogEntry[]
        /** Whether its tab is the one shown: a hidden view has no height to scroll. */
        visible?: boolean
    }

    let { entries, visible = true }: Props = $props()
    let element: HTMLDivElement | undefined = $state()

    //also when the tab is shown again, since what was logged meanwhile could not be scrolled to
    $effect(() => {
        if (element && visible && entries.length) element.scrollTop = element.scrollHeight
    })

    function time(entry: LogEntry) {
        return new Date(entry.time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    }

    const MARKS: Record<LogTone, string> = {
        success: '✓',
        warning: '!',
        error: '✗',
        info: '•'
    }
</script>

<div class="log" bind:this={element}>
    {#if entries.length === 0}
        <EmptyState>
            Builds, test runs, program exits and notes on what a run met are recorded here.
        </EmptyState>
    {/if}
    {#each entries as entry (entry.id)}
        <div class="entry {entry.tone}">
            <span class="time">{time(entry)}</span>
            <span class="mark">{MARKS[entry.tone]}</span>
            {#if entry.kind === 'note'}
                <span class="text note"
                    >{#each noteSpans(entry.text) as span, index (index)}{#if span.code}<code
                                >{span.text}</code
                            >{:else}{span.text}{/if}{/each}</span
                >
            {:else}
                <span class="text">{entry.text}</span>
            {/if}
        </div>
        {#each entry.details as detail, index (index)}
            <div class="entry detail {detail.tone}">
                <span class="mark">{MARKS[detail.tone]}</span>
                <span class="text">{detail.text}</span>
            </div>
        {/each}
    {/each}
</div>

<style lang="scss">
    /* the scrollbar keeps its room from the start, so a Log that starts to scroll does not shift
       sideways */
    .log {
        flex: 1;
        min-height: 0;
        overflow: auto;
        scrollbar-gutter: stable;
        padding: var(--wb-output-padding);
        font-family: var(--font-mono);
        font-size: var(--fs-small);
        line-height: 1.55;
    }

    /* the Log's own padding is the empty state's */
    .log {
        --empty-state-padding: 0;
    }

    .entry {
        display: flex;
        gap: 0.6rem;
        align-items: baseline;
    }

    .detail {
        padding-left: 5.2rem;
    }

    .time {
        flex: none;
        color: var(--hint);
    }

    .mark {
        flex: none;
        width: 0.8rem;
        text-align: center;
    }

    .text {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    /* what the Emulator says about the run, with its code set apart */
    .note {
        code {
            font: inherit;
            padding: 0 0.25rem;
            border-radius: var(--r-chip);
            background-color: color-mix(in srgb, var(--hint) 16%, transparent);
        }
    }

    /* the Testcases' passed green, the success colour as text (`--success-ink`): on a dark theme
       the dark green brightened 1.6 times, which reads at 4.5:1 where the green alone does not */
    .success .mark {
        color: var(--success-ink);
    }

    .warning .mark {
        color: var(--warning);
    }

    /* the Testcases' failed red, the danger colour mixed with the text, 4.5:1 where the pure
       colour is not */
    .error .mark {
        color: color-mix(in srgb, var(--danger) 75%, currentColor);
    }

    .info .mark {
        color: var(--hint);
    }
</style>
