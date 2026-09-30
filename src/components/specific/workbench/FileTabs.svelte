<script lang="ts">
    /**
     * The open Files, shown on desktop even when there is only one
     * ([the design record](../../../../docs/design/workbench.md), File tabs). The row also carries
     * what the old editor floated over the code: at its right end, "Live file" while a Debug
     * session shows a File's current contents rather than the Build's own, and a dimmed tab for a
     * File the language service does not reach from the Entry file.
     */
    import FaTimes from '~icons/fa-solid/times'
    import { useWorkbench } from './workbenchContext'

    const { session } = useWorkbench()
    const paths = $derived(session.tabs.paths)

    function basename(path: string) {
        const parts = path.split('/')
        return parts[parts.length - 1] || path
    }

    //two open Files with the same name are told apart by their folder, the way an IDE does it
    const labels = $derived.by(() => {
        const counts: Record<string, number> = Object.create(null)
        for (const path of paths) counts[basename(path)] = (counts[basename(path)] ?? 0) + 1
        return paths.map((path) => {
            const name = basename(path)
            if (counts[name] < 2) return name
            const parts = path.split('/')
            return parts.length > 1 ? `${parts[parts.length - 2]}/${name}` : name
        })
    })

    const liveFile = $derived(session.debugSession && session.sourceView !== 'snapshot')
</script>

<div class="file-tabs" role="tablist" aria-label="Open files">
    <div class="tabs">
        {#each paths as path, index (path)}
            {@const active = path === session.displayedPath}
            {@const unreached = session.analysisStatus?.[path] === 'not-reachable'}
            <div
                class="tab"
                class:active
                class:unreached
                title={unreached ? `${path}: not analyzed from the Entry file` : path}
            >
                <button
                    class="tab-select"
                    role="tab"
                    aria-selected={active}
                    onclick={() => session.activateTab(path)}
                    onauxclick={(event) => {
                        if (event.button === 1) session.closeTab(path)
                    }}
                >
                    <span class="ellipsis">{labels[index]}</span>
                    {#if path === session.project.entry}
                        <span class="entry-mark" title="The Entry file">ENTRY</span>
                    {/if}
                </button>
                {#if paths.length > 1}
                    <button
                        class="tab-close"
                        title="Close {labels[index]}"
                        aria-label="Close {labels[index]}"
                        onclick={() => session.closeTab(path)}
                    >
                        <FaTimes />
                    </button>
                {/if}
            </div>
        {/each}
        <div class="tabs-rest"></div>
    </div>
    {#if liveFile}
        <span class="version" title="The current contents of a File the program created or changed">
            Live file
        </span>
    {/if}
</div>

<style lang="scss">
    /* the mockup's tabs, ruled as the bottom panel's are: a strip a shade darker than the editor
       with a rule under it, each tab ruled on its right, the shown File's tab in the editor's own
       colour and open at the bottom onto it, the others quiet on the strip */
    .file-tabs {
        display: flex;
        align-items: stretch;
        flex: none;
        height: 2.25rem;
        background-color: var(--wb-strip);
    }

    /* the rule under the strip is each part's own bottom border, so the shown tab can leave its
       own out; borders, unlike a shadow, round to whole screen pixels */
    .tab,
    .tabs-rest,
    .version {
        border-bottom: 1px solid var(--wb-line);
    }

    .tabs-rest {
        flex: 1;
        min-width: 0;
    }

    .tabs {
        display: flex;
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        scrollbar-width: thin;
    }

    .tab {
        display: flex;
        align-items: center;
        gap: 0.2rem;
        flex: none;
        max-width: 14rem;
        padding: 0 0.4rem 0 0.9rem;
        color: var(--secondary-text);
        border-right: 1px solid var(--wb-line);

        &.active {
            background-color: var(--secondary);
            border-bottom-color: var(--secondary);
        }

        &:not(.active) .tab-select {
            opacity: 0.6;
        }

        &:not(.active):hover .tab-select {
            opacity: 0.85;
        }

        &.unreached .tab-select span:first-child {
            opacity: 0.55;
            font-style: italic;
        }
    }

    .tab-select {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        height: 100%;
        min-width: 0;
        padding: 0;
        background: transparent;
        color: inherit;
        font-size: 0.82rem;
        cursor: pointer;
    }

    .tab-close {
        display: grid;
        place-items: center;
        width: 1.3rem;
        height: 1.3rem;
        margin-left: 0.3rem;
        padding: 0.32rem;
        border-radius: 0.25rem;
        background: transparent;
        color: var(--secondary-text);
        opacity: 0.55;
        cursor: pointer;

        &:hover {
            opacity: 1;
            background-color: color-mix(in srgb, var(--secondary) 60%, var(--tertiary));
        }
    }

    .entry-mark {
        flex: none;
        padding: 0 0.3rem;
        color: var(--accent);
        border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
        border-radius: 999px;
        font-size: 0.5rem;
        font-weight: 700;
        line-height: 0.8rem;
        letter-spacing: 0.04em;
    }

    .version {
        display: flex;
        align-items: center;
        flex: none;
        padding: 0 0.8rem;
        font-size: 0.75rem;
        color: var(--hint);
    }
</style>
