<script lang="ts">
    /**
     * Settings, as the Workbench's side panel: the Project's Settings, the Display configuration of
     * a MARS or RARS Project, the person's Preferences, the layout Preferences, the shortcuts and the
     * theme ([the design record](../../../../docs/design/workbench.md), Settings, Shortcuts and
     * Theme). The Display configuration is listed here but is not a Setting
     * ([ADR 0014](../../../../docs/adr/0014-settings-split-by-effect.md)): it changes only outside a
     * Debug session, because a change rewrites the program's `@screen` comment.
     */
    import { tick } from 'svelte'
    import Setting from '$cmp/specific/project/settings/Setting.svelte'
    import ProjectSetting from '$cmp/specific/project/settings/ProjectSetting.svelte'
    import ShortcutsSection from '$cmp/specific/project/settings/ShortcutsSection.svelte'
    import ThemeEditor from '$cmp/specific/project/settings/ThemeEditor.svelte'
    import DisplayConfigurationForm from '$cmp/specific/project/screen/DisplayConfigurationForm.svelte'
    import {
        isProjectSettingDecided,
        type ProjectSettingId,
        projectSettingsFor,
        resolveProjectSettings
    } from '$lib/projectSettings'
    import {
        preferencesStore,
        type PreferenceKey,
        type PreferenceSection,
        type PreferenceValue
    } from '$stores/preferencesStore.svelte'
    import { workbenchLayout } from '$stores/workbenchLayoutStore.svelte'
    import type { SettingsSectionId } from '$lib/workbench/hostApi'
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
    const declarations = $derived(projectSettingsFor(language))
    const effective = $derived(resolveProjectSettings(language, project.settings))
    const sections: Partial<Record<SettingsSectionId, HTMLElement>> = $state({})

    function decide(id: ProjectSettingId, value: number | boolean) {
        if (readonly) return
        session.applySettings({ ...project.settings, [id]: value })
    }

    function reset(id: ProjectSettingId) {
        if (readonly) return
        const next = { ...project.settings }
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

    //Settings opened for one section (the Screen's Display button): unfold it and bring it in view
    $effect(() => {
        const section = ui.settingsSection
        if (!section || ui.activePanel !== 'settings') return
        workbenchLayout.setCollapsed(`settings:${section}`, false)
        void tick().then(() => {
            sections[section]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
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
            {#each declarations as declaration (declaration.id)}
                <ProjectSetting
                    {declaration}
                    value={effective[declaration.id]}
                    decided={isProjectSettingDecided(project.settings, declaration.id)}
                    onDecide={(value) => decide(declaration.id, value)}
                    onReset={() => reset(declaration.id)}
                />
            {/each}
            <p class="hint">These belong to this Project and take effect at the next Build.</p>
        </div>
    </CollapsibleSection>
    {#if session.configurableDisplay}
        <CollapsibleSection
            variant="outlined"
            id="settings:display"
            title="Display"
            bind:element={sections.display}
        >
            <div class="rows">
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
        </CollapsibleSection>
    {/if}
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
                    on:changeValue={(e) =>
                        // @ts-expect-error -- the entries erase the key/value correlation
                        preferencesStore.setValue(key, e.detail)}
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
                    on:changeValue={(e) =>
                        // @ts-expect-error -- the entries erase the key/value correlation
                        preferencesStore.setValue(key, e.detail)}
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
    .settings-panel {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.5rem;
        flex: 1;
    }

    .rows {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding: 0.4rem 0.4rem 0.6rem;
    }

    .hint {
        margin: 0.2rem 0.6rem 0;
        font-size: 0.75rem;
        color: var(--hint);
        line-height: 1.4;
    }

    .theme {
        padding: 0.6rem;
    }
</style>
