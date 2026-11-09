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
    import TabStrip from '#cmp/shared/input/TabStrip.svelte'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import Badge from '#cmp/shared/misc/Badge.svelte'
    import { useWorkbench } from './workbenchContext'
    import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'

    const { session } = useWorkbench()
    /** `panelId` is the id of the editor body every tab shows its File in. */
    let { group, panelId }: { group: EditorGroup; panelId?: string } = $props()
    const paths = $derived(group.tabs.paths)

    function basename(path: string) {
        const parts = path.split('/')
        return parts[parts.length - 1] || path
    }

    //two open Files with the same name are told apart by their folder, the way an IDE does it
    const tabs = $derived.by(() => {
        const counts: Record<string, number> = Object.create(null)
        for (const path of paths) counts[basename(path)] = (counts[basename(path)] ?? 0) + 1
        return paths.map((path) => {
            const name = basename(path)
            const parts = path.split('/')
            const label =
                counts[name] < 2 || parts.length < 2 ? name : `${parts[parts.length - 2]}/${name}`
            const unreached =
                group.sourceView === 'live' &&
                session.languageAnalysis?.fileStatus[path] === 'not-reachable'
            return { id: path, label, unreached, preview: path === group.tabs.preview }
        })
    })

    const liveFile = $derived(session.debugSession && group.sourceView !== 'snapshot')
</script>

<!-- 2.25rem, the height EditorArea's band beside the split continues. Showing a File can be slow
     (an Executable's Listing or Pseudocode), so the arrow keys only move between the tabs and Enter
     or Space opens one -->
<TabStrip
    {tabs}
    selected={group.displayedPath}
    ariaLabel="Open files"
    style="--tab-strip-height: 2.25rem"
    activation="manual"
    panelId={panelId ? () => panelId : undefined}
    onselect={(path) => session.activateTab(path, group)}
    onclose={(path) => session.closeTab(path, group)}
    tabAttributes={(file) => ({
        //the path on the name rather than the whole tab, where it would also show over the close
        //button, beside its Tooltip
        title:
            (file.unreached
                ? `${file.id}: not analyzed from the selected program's Entry file`
                : file.id) + (file.preview ? ' (preview: double-click to keep it open)' : ''),
        draggable: true,
        ondragstart: (event) => session.startFileDrag(event, file.id, group),
        ondragend: () => session.endFileDrag(),
        ondblclick: () => session.keepOpen(file.id, group)
    })}
>
    {#snippet tab(file)}
        <span class="name ellipsis" class:unreached={file.unreached} class:preview={file.preview}
            >{file.label}</span
        >
        {#if session.project.program(file.id)}
            {@const selected = file.id === session.project.selectedProgram}
            <!-- at medium weight in a tab, not a Badge's bold -->
            <Badge
                class={['entry-mark', { selected }]}
                tone={selected ? 'accent' : 'neutral'}
                solid={selected}
                weight="medium"
                title={selected ? 'Entry of the selected program' : 'Entry of a program'}
                >ENTRY</Badge
            >
        {/if}
    {/snippet}
    {#if session.groups.length === 1}
        <IconButton
            fill
            class="group-action"
            label="Split editor"
            {@attach tooltip('Split editor')}
            disabled={!group.displayedPath}
            onClick={() => session.splitEditor()}><FaColumns /></IconButton
        >
    {/if}
    {#if session.groups.length > 1 && !group.tabs.paths.length}
        <IconButton
            fill
            class="group-action"
            label="Close editor"
            {@attach tooltip('Close editor')}
            onClick={() => session.closeGroup(group)}><FaTimes /></IconButton
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
</TabStrip>

<style lang="scss">
    /* the strip itself is TabStrip's, and what follows is what this adds to it. The editor's own
       end of the strip: a filling IconButton, a square as tall as the strip, edge to edge in it
       and square-cornered, in the strip's text. Its bottom border is the strip's rule
       (TabStrip gives it to everything after the tabs), which its hover fill stops at rather than
       tinting it. As the strip's last part, its top-right corner is `--group-action-corner`, which
       the editor sets on the pane in its card's top-right corner (EditorArea), so that it follows
       the card's curve there */
    :global(.group-action) {
        --icon-button-cell: var(--tab-strip-height);
    }
    :global(.group-action:last-child) {
        --icon-button-radius: 0 var(--group-action-corner, 0) 0 0;
    }

    .name {
        padding: 0 0.1rem;

        &.unreached {
            color: var(--text-muted);
        }

        /* italics are the preview tab's, as in an IDE */
        &.preview {
            font-style: italic;
        }
    }

    .version {
        display: flex;
        align-items: center;
        flex: none;
        padding: 0 0.8rem;
        font-size: var(--fs-caption);
        color: var(--hint);
    }
</style>
