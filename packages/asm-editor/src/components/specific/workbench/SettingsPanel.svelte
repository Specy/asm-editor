<script lang="ts">
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    /**
     * Settings, as the Workbench's side panel: the Project's instruction set, the Selected program's
     * Settings and, in a MARS or RARS Project, its Display configuration, the person's Preferences,
     * the layout Preferences, the shortcuts and the theme
     * ([the design record](../../../../../../docs/design/workbench.md), Settings, Shortcuts and
     * Theme). The Program section is titled with the Program's label while the Project has two or
     * more, and says how to make one while it has none
     * ([programs-plan.md](../../../../../../docs/design/programs-plan.md), decision 14). The Display
     * configuration is listed there but is not a Setting
     * ([ADR 0014](../../../../../../docs/adr/0014-settings-split-by-effect.md)): it changes only outside a
     * Debug session, because a change rewrites the program's `@screen` comment.
     */
    import { tick } from 'svelte'
    import Setting from '#cmp/specific/project/settings/Setting.svelte'
    import ProjectSetting from '#cmp/specific/project/settings/ProjectSetting.svelte'
    import ShortcutsSection from '#cmp/specific/project/settings/ShortcutsSection.svelte'
    import ThemeEditor from '#cmp/specific/project/settings/ThemeEditor.svelte'
    import DisplayConfigurationForm from '#cmp/specific/project/screen/DisplayConfigurationForm.svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    import { AVAILABLE_LANGUAGES } from '#lib/Project.svelte.ts'
    import {
        isProjectSettingDecided,
        type ProjectSettingId,
        projectSettingsFor,
        resolveProjectSettings
    } from '#lib/projectSettings.ts'
    import {
        preferencesStore,
        type PreferenceKey,
        type PreferenceSection,
        type PreferenceValue
    } from '#stores/preferencesStore.svelte.ts'
    import { workbenchLayout } from '#stores/workbenchLayoutStore.svelte.ts'
    import type { SettingsTarget } from '#lib/workbench/hostApi.ts'
    import { NO_PROGRAM_MESSAGE } from '#lib/workbench/WorkbenchSession.svelte.ts'
    import CollapsibleSection from './CollapsibleSection.svelte'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        /** Shown but not changeable, for a host that offers the panel read only. */
        readonly?: boolean
    }

    let { readonly = false }: Props = $props()

    const { session, ui } = useWorkbench()
    const project = session.project
    const language = $derived(project.language)
    const languageOptions = AVAILABLE_LANGUAGES.map((value) => ({
        key: languageLabel(value),
        value
    }))
    const declarations = $derived(projectSettingsFor(language))
    const decisions = $derived(project.selected?.settings ?? {})
    const effective = $derived(resolveProjectSettings(language, decisions))
    const programTitle = $derived.by(() => {
        if (session.programChoices.length < 2) return 'Program'
        const label = session.programChoices.find(
            (choice) => choice.entry === project.selectedProgram
        )?.label
        return label ? `Program · ${label}` : 'Program'
    })
    const sections: Partial<Record<SettingsTarget, HTMLElement>> = $state({})

    function decide(
        id: ProjectSettingId,
        value: import('#lib/projectSettings.ts').ProjectSettingValues[ProjectSettingId]
    ) {
        if (readonly) return
        session.applySettings({ ...decisions, [id]: value })
    }

    function reset(id: ProjectSettingId) {
        if (readonly) return
        const next = { ...decisions }
        delete next[id]
        session.applySettings(next)
    }

    function preferencesOf(section: PreferenceSection) {
        return (
            Object.entries(preferencesStore.values) as [PreferenceKey, PreferenceValue<unknown>][]
        ).filter(
            ([, entry]) =>
                entry.section === section && (!entry.onlyFor || entry.onlyFor === language)
        )
    }

    //Settings opened for one section (the Screen's Display button): unfold it and bring it in view;
    //the Display is a part of the Program section, which stands in for it with no Program
    $effect(() => {
        const target = ui.settingsSection
        if (!target || ui.activePanel !== 'settings') return
        const section = target === 'display' ? 'program' : target
        workbenchLayout.setCollapsed(`settings:${section}`, false)
        void tick().then(() => {
            const element = sections[target] ?? sections[section]
            element?.scrollIntoView({ block: 'start', behavior: 'smooth' })
            ui.settingsSection = null
        })
    })
</script>

<div class="settings-panel">
    <CollapsibleSection
        variant="outlined"
        id="settings:project"
        title="Project"
        bind:element={sections.project}
    >
        <div class="rows">
            <div class="instruction-set">
                <span>Instruction set</span>
                <Select
                    options={languageOptions}
                    value={language}
                    ariaLabel="Instruction set"
                    disabled={readonly || !session.languageEditable}
                    style="padding: 0.4rem 0.6rem; background: var(--tertiary); color: var(--tertiary-text)"
                    wrapperStyle="min-width: 9rem; max-width: 12rem"
                    onChange={(next) => {
                        if (!readonly) session.setLanguage(next)
                    }}
                />
            </div>

            {#if session.debugSession || session.fileSystemLocked}
                <p class="hint">Stop the Debug session to change the instruction set.</p>
            {/if}
        </div>
    </CollapsibleSection>
    <CollapsibleSection
        variant="outlined"
        id="settings:program"
        title={programTitle}
        bind:element={sections.program}
    >
        <div class="rows">
            {#if project.selected}
                {#each declarations as declaration (declaration.id)}
                    <ProjectSetting
                        {declaration}
                        value={effective[declaration.id]}
                        decided={isProjectSettingDecided(decisions, declaration.id)}
                        onDecide={(value) => decide(declaration.id, value)}
                        onReset={() => reset(declaration.id)}
                    />
                {/each}
                <p class="hint">These belong to this program and take effect at the next Build.</p>
                {#if session.configurableDisplay}
                    <div class="display" bind:this={sections.display}>
                        <h3 class="part-title">Display</h3>
                        <DisplayConfigurationForm
                            display={session.currentDisplay}
                            origin={session.displayOrigin}
                            baseLabel={session.displayBaseLabel}
                            disabled={readonly || !session.displayEditable}
                            heading={false}
                            panel
                            onChange={(next) => session.applyDisplay(next)}
                        />
                        {#if session.fileSystemLocked}
                            <p class="hint">Stop the Debug session to change the display.</p>
                        {/if}
                    </div>
                {/if}
            {:else}
                <p class="hint">{NO_PROGRAM_MESSAGE}</p>
            {/if}
        </div>
    </CollapsibleSection>
    <CollapsibleSection
        variant="outlined"
        id="settings:preferences"
        title="Preferences"
        bind:element={sections.preferences}
    >
        <div class="rows">
            {#each preferencesOf('preferences') as [key, entry] (key)}
                <Setting
                    {entry}
                    onChange={(value) =>
                        // @ts-expect-error -- the entries erase the key/value correlation
                        preferencesStore.setValue(key, value)}
                />
            {/each}
        </div>
    </CollapsibleSection>
    <CollapsibleSection
        variant="outlined"
        id="settings:layout"
        title="Layout"
        bind:element={sections.layout}
    >
        <div class="rows">
            {#each preferencesOf('layout') as [key, entry] (key)}
                <Setting
                    {entry}
                    onChange={(value) =>
                        // @ts-expect-error -- the entries erase the key/value correlation
                        preferencesStore.setValue(key, value)}
                />
            {/each}
            {#if ui.compact}
                <p class="hint">
                    On this screen the Stack pointer, History and Call stack are always sections.
                </p>
            {/if}
        </div>
    </CollapsibleSection>
    <CollapsibleSection
        variant="outlined"
        id="settings:shortcuts"
        title="Shortcuts"
        defaultCollapsed
        bind:element={sections.shortcuts}
    >
        <ShortcutsSection visible={ui.activePanel === 'settings'} style="padding-top: 0.4rem" />
    </CollapsibleSection>
    <CollapsibleSection
        variant="outlined"
        id="settings:theme"
        title="Theme"
        defaultCollapsed
        bind:element={sections.theme}
    >
        <div class="theme">
            <ThemeEditor />
        </div>
    </CollapsibleSection>
</div>

<style lang="scss">
    /* spaced like the Documentation panel's Chapters, which the sections are drawn like */
    .settings-panel {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.5rem 0.35rem 0.8rem;
        flex: 1;
    }

    .rows {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding: 0.5rem;
    }

    .hint {
        margin: 0.2rem 0.6rem 0;
        font-size: 0.75rem;
        color: var(--hint);
        line-height: 1.4;
    }

    /* the Display within the Program section, ruled off from its Settings */
    .display {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid var(--wb-line);
    }

    .part-title {
        margin: 0;
        padding: 0.2rem 0.4rem;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--hint);
    }

    .instruction-set {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.4rem;
        min-height: calc(2rem + 0.4rem);
        padding: 0.2rem 0.4rem;
        font-size: 0.9rem;
    }

    .theme {
        padding: 0.5rem;
    }
</style>
