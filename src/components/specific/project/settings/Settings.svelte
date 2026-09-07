<script lang="ts">
    import Setting from './Setting.svelte'
    import ProjectSetting from './ProjectSetting.svelte'
    import { preferencesStore } from '$stores/preferencesStore.svelte'
    import FloatingContainer from '$cmp/shared/layout/FloatingContainer.svelte'
    import FaPalette from '~icons/fa-solid/palette'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import {
        isProjectSettingDecided,
        type ProjectSettingId,
        type ProjectSettingsDecisions,
        projectSettingsFor,
        resolveProjectSettings
    } from '$lib/projectSettings'
    import { resolve } from '$app/paths'

    /**
     * One panel, two sections: the open Project's Settings, when there is a Project, and the
     * Preferences, which are the person's and the same everywhere
     * ([ADR 0014](../../../../../docs/adr/0014-settings-split-by-effect.md)). A Playground passes
     * no Project and gets the Preferences alone.
     */
    interface Props {
        visible: boolean
        language: AvailableLanguages
        /** The Project's decisions; left out where there is no Project. */
        projectSettings?: ProjectSettingsDecisions
        onProjectSettingsChange?: (decisions: ProjectSettingsDecisions) => void
    }

    let {
        visible = $bindable(),
        language,
        projectSettings,
        onProjectSettingsChange
    }: Props = $props()

    const declarations = $derived(projectSettingsFor(language))
    const effective = $derived(resolveProjectSettings(language, projectSettings))

    function decide(id: ProjectSettingId, value: number) {
        onProjectSettingsChange?.({ ...projectSettings, [id]: value })
    }

    function reset(id: ProjectSettingId) {
        const next = { ...projectSettings }
        delete next[id]
        onProjectSettingsChange?.(next)
    }
</script>

<FloatingContainer bind:visible title="Settings">
    <div class="settings-values">
        {#if projectSettings !== undefined}
            <Header type="h3" noMargin style="padding: 0.6rem 0.5rem 0.2rem">Project</Header>
            {#each declarations as declaration (declaration.id)}
                <ProjectSetting
                    {declaration}
                    value={effective[declaration.id]}
                    decided={isProjectSettingDecided(projectSettings, declaration.id)}
                    onDecide={(value) => decide(declaration.id, value)}
                    onReset={() => reset(declaration.id)}
                />
            {/each}
            <Header type="h3" noMargin style="padding: 0.6rem 0.5rem 0.2rem">Preferences</Header>
        {/if}
        {#each Object.entries(preferencesStore.values) as entry, i (i)}
            {#if !entry[1].onlyFor || entry[1].onlyFor === language}
                <Setting
                    entry={entry[1]}
                    on:changeValue={(e) => {
                        // @ts-expect-error -- Object.entries erases the preferences key/value correlation
                        preferencesStore.setValue(entry[0], e.detail)
                    }}
                />
            {/if}
        {/each}
        <div
            class="row"
            style="align-items: center; justify-content: space-between; padding: 0 0.4rem; padding-left: 1rem;"
        >
            <div>Change theme</div>
            <a href={resolve('/themes', {})} title="Edit the theme">
                <Button cssVar="accent2">
                    <Icon>
                        <FaPalette />
                    </Icon>
                </Button>
            </a>
        </div>
    </div>
</FloatingContainer>

<style lang="scss">
    .settings-values {
        display: flex;
        flex-direction: column;
        padding: 0.6rem;
        gap: 0.2rem;
        padding-top: 0.2rem;
    }
</style>
