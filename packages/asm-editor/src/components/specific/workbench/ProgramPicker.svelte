<script lang="ts">
    /**
     * The Program picker, at the right end of the bottom panel's tab strip
     * ([programs.md](../../../../../../docs/design/programs.md), decision 10): which of the Project's
     * Programs is the Selected program, the one Shift+B builds and whose Settings and Testcases the
     * panels show. It lists the Programs by label, a missing Entry marked, and is hidden while there
     * are fewer than two. Picking leaves the panes as they are. While the Programs cannot change it
     * is disabled, saying why; a Debug session shows its own Program, which Stop frees to switch. A
     * phone's strip has room for the label alone, cut short with an ellipsis rather than pushing
     * what follows it off the strip.
     */
    import Select from '#cmp/shared/input/Select.svelte'
    import FaChevronDown from '~icons/fa-solid/chevron-down'
    import { useWorkbench } from './workbenchContext'

    const { session, ui } = useWorkbench()
    const choices = $derived(session.programChoices)
    const locked = $derived(session.programsLocked)
    //the session's Program is its Build's, which a Debug session holds the selection to
    const shown = $derived(
        (session.debugSession ? session.emulator.buildSources?.entry : undefined) ??
            session.project.selectedProgram
    )
    const current = $derived(choices.find((choice) => choice.entry === shown))
    const options = $derived(
        choices.map((choice) => ({
            key: choice.entry,
            searchText: choice.label,
            value: choice.entry
        }))
    )
</script>

{#if choices.length >= 2}
    <div
        class="program-picker"
        class:phone={ui.deviceClass === 'phone'}
        title={locked ?? 'The selected program, whose Settings and Testcases the panels show'}
    >
        <Select
            {options}
            bind:value={() => shown ?? '', (entry) => session.selectProgram(entry)}
            disabled={locked !== undefined}
            ariaLabel="Program"
            popupWidth={240}
            openAbove
            chevron={FaChevronDown}
            listStyle="border: 1px solid var(--tertiary);"
            wrapperStyle="height: 100%; min-width: 0;"
            style="height: 100%; padding: {ui.deviceClass === 'phone'
                ? '0 0.6rem 0 0.5rem'
                : '0 0.9rem 0 0.6rem'}; gap: 0.45rem; border-radius: 0; background: transparent; color: var(--secondary-text); font-size: 0.78rem; font-weight: 600;"
        >
            {#snippet trigger()}
                {#if ui.deviceClass !== 'phone'}<span class="caption">Program</span>{/if}
                <span>{current?.label ?? ''}</span>
                {#if current?.missing}<span class="missing">— missing</span>{/if}
            {/snippet}
            {#snippet item(option)}
                {@const choice = choices.find((candidate) => candidate.entry === option.value)}
                <span class="choice" class:missing={choice?.missing} title={option.value}>
                    {choice?.label ?? option.value}{choice?.missing ? ' — missing' : ''}
                </span>
            {/snippet}
        </Select>
    </div>
{/if}

<style lang="scss">
    /* drawn as the strip's own text, like the run info and the tabs, on the strip's rule */
    .program-picker {
        display: flex;
        align-items: stretch;
        flex: 0 1 auto;
        min-width: 0;
        max-width: 16rem;
        font-size: 0.78rem;

        &.phone {
            max-width: 9rem;
        }
    }

    .caption {
        font-weight: 400;
        color: var(--hint);
    }

    .missing {
        font-weight: 400;
        color: var(--hint);
    }

    .choice {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
