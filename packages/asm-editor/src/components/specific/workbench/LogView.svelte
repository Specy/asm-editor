<script lang="ts">
    /** The Log: what the Workbench did, newest at the bottom. */
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
        <p class="empty">
            Builds, test runs, program exits and notes on what a run met are recorded here.
        </p>
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
        font-family: 'Fira Code', monospace;
        font-size: 0.82rem;
        line-height: 1.55;
    }

    .empty {
        margin: 0;
        font-family: Rubik, sans-serif;
        font-size: 0.8rem;
        color: var(--hint);
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
            border-radius: 0.2rem;
            background-color: color-mix(in srgb, var(--hint) 16%, transparent);
        }
    }

    .success .mark {
        color: var(--green);
        filter: brightness(1.6);
    }

    .warning .mark {
        color: var(--warning, #d49a30);
    }

    .error .mark {
        color: var(--red);
    }

    .info .mark {
        color: var(--hint);
    }
</style>
