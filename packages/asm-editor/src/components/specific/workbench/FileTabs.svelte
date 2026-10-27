<script lang="ts">
    /**
     * One editor group's open Files, shown even when there is only one
     * ([the design record](../../../../../../docs/design/workbench.md), File tabs). The row also carries
     * "Live file" while a Debug
     * session shows a File's current contents rather than the Build's own, and a dimmed tab for a
     * File the language service does not reach from the Selected program's Entry file. Every Entry
     * file's tab is marked as its Explorer row is, the Selected program's in the accent colour
     * ([programs-plan.md](../../../../../../docs/design/programs-plan.md), decision 11). The preview
     * tab, a File opened with a single click in the Explorer that the next one takes the place of,
     * is named in italics, as an IDE names it; a double click on it keeps it open.
     */
    import FaTimes from '~icons/fa-solid/times'
    import FaColumns from '~icons/fa-solid/columns'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { useWorkbench } from './workbenchContext'
    import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'

    const { session } = useWorkbench()
    let { group }: { group: EditorGroup } = $props()
    const paths = $derived(group.tabs.paths)

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

    const liveFile = $derived(session.debugSession && group.sourceView !== 'snapshot')
</script>

<div class="file-tabs" role="tablist" aria-label="Open files">
    <div class="tabs">
        {#each paths as path, index (path)}
            {@const active = path === group.displayedPath}
            {@const unreached =
                group.sourceView === 'live' &&
                session.languageAnalysis?.fileStatus[path] === 'not-reachable'}
            {@const preview = path === group.tabs.preview}
            <div class="tab" class:active class:unreached class:preview>
                <!-- the path on the name rather than the whole tab, where it would also show over the
                     close button, beside its Tooltip -->
                <button
                    class="tab-select"
                    title={(unreached
                        ? `${path}: not analyzed from the selected program's Entry file`
                        : path) + (preview ? ' (preview: double-click to keep it open)' : '')}
                    draggable="true"
                    ondragstart={(event) => session.startFileDrag(event, path, group)}
                    ondragend={() => session.endFileDrag()}
                    role="tab"
                    aria-selected={active}
                    onclick={() => session.activateTab(path, group)}
                    ondblclick={() => session.keepOpen(path, group)}
                    onauxclick={(event) => {
                        if (event.button === 1) session.closeTab(path, group)
                    }}
                >
                    <span class="ellipsis">{labels[index]}</span>
                    {#if session.project.program(path)}
                        {@const selected = path === session.project.selectedProgram}
                        <span
                            class="entry-mark"
                            class:selected
                            title={selected
                                ? 'Entry of the selected program'
                                : 'Entry of a program'}>ENTRY</span
                        >
                    {/if}
                </button>
                <button
                    class="tab-close"
                    {@attach tooltip(`Close ${labels[index]}`)}
                    aria-label="Close {labels[index]}"
                    onclick={() => session.closeTab(path, group)}
                >
                    <FaTimes />
                </button>
            </div>
        {/each}
        <div class="tabs-rest"></div>
    </div>
    {#if session.groups.length === 1}
        <button
            class="group-action"
            {@attach tooltip('Split editor')}
            aria-label="Split editor"
            disabled={!group.displayedPath}
            onclick={() => session.splitEditor()}><FaColumns /></button
        >
    {/if}
    {#if session.groups.length > 1 && !group.tabs.paths.length}
        <button
            class="group-action"
            {@attach tooltip('Close editor')}
            aria-label="Close editor"
            onclick={() => session.closeGroup(group)}><FaTimes /></button
        >
    {/if}
    {#if liveFile}
        <span
            class="version"
            {@attach tooltip('The current contents of a File the program created or changed')}
        >
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
    .group-action {
        flex: none;
        width: 1.8rem;
        padding: 0.5rem;
        background: transparent;
        color: var(--secondary-text);
        cursor: pointer;
        border-bottom: 1px solid var(--wb-line);
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
    }

    /* the app's scrollbar (global.css), thinner and on the strip's own colour, since it takes its
       height out of the tabs. No `scrollbar-width` here: Chrome drops the ::-webkit-scrollbar
       rules on an element that sets it, and draws its native bar with arrows */
    .tabs::-webkit-scrollbar {
        height: 0.25rem;
        background: transparent;
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
        }

        /* italics are the preview tab's, as in an IDE */
        &.preview .tab-select span:first-child {
            font-style: italic;
        }
    }

    .tab-select {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        height: 100%;
        min-width: 0;
        background: transparent;
        color: inherit;
        font-size: 0.82rem;
        cursor: pointer;

        span:not(.entry-mark) {
            padding: 0 0.1rem;
        }
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

    /* every Entry file's, neutral; the Selected program's in the accent colour */
    .entry-mark {
        flex: none;
        padding: 0 0.3rem;
        color: color-mix(in srgb, var(--secondary-text) 70%, transparent);
        border: 1px solid color-mix(in srgb, var(--secondary-text) 30%, transparent);
        border-radius: 999px;
        font-size: 0.5rem;
        font-weight: 700;
        line-height: 0.8rem;
        letter-spacing: 0.04em;

        &.selected {
            color: var(--accent);
            border-color: color-mix(in srgb, var(--accent) 55%, transparent);
        }
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
