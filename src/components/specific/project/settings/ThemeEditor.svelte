<script lang="ts">
    /**
     * Choosing and editing the app's theme: the presets, each with a strip of its colours, "Create
     * new theme" (a copy of the current colours), and one row per colour of an editable theme.
     * Everything repaints as it changes, the Workbench beside it included. It was the `/themes` page
     * before it became the Theme section of the Workbench's Settings.
     */
    import Button from '$cmp/shared/button/Button.svelte'
    import ColorThemeRow from '$cmp/specific/ColorThemeRow.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import { ThemeStore } from '$stores/themeStore.svelte'
    import { scale } from 'svelte/transition'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import FaPlus from '~icons/fa-solid/plus'
    import { Prompt } from '$stores/promptStore.svelte'
    import FaTrashAlt from '~icons/fa-solid/trash-alt'

    let theme = ThemeStore.themeList
</script>

<div class="theme-editor">
    <h2 class="presets-title">Theme presets</h2>
    <Row wrap gap="1rem">
        {#each ThemeStore.themes as t (t.id)}
            <button
                class="theme-selector"
                onclick={() => ThemeStore.select(t.id)}
                style={`
            cursor: pointer;
            background-color: ${t.theme.background.color}; 
            color: ${ThemeStore.textOfColor(t.theme.background.color)};
            font-weight: bold;
            border: solid 0.2rem ${
                t.id === ThemeStore.meta.id ? t.theme.accent.color : t.theme.secondary.color
            };
            `}
            >
                <Row style="height: 2rem; width: 100%">
                    {#each Object.values(t.theme) as themeProp (themeProp.prop)}
                        {#if !themeProp.readonly}
                            <div
                                style="background-color: {themeProp.color}; flex:1; display: flex;"
                            ></div>
                        {/if}
                    {/each}
                </Row>

                <Row justify="between" style="width: 100%">
                    <div style="text-align: center; padding: 1rem;">
                        {t.name}
                    </div>
                    {#if t.editable}
                        <Button
                            onClick={async () => {
                                const confirmed = await Prompt.confirm(
                                    'Are you sure you want to delete this theme?'
                                )
                                if (confirmed === null) return
                                if (!confirmed) return
                                ThemeStore.delete(t.id)
                            }}
                            hasIcon
                            bg={t.theme.background.color}
                            color={ThemeStore.textOfColor(t.theme.secondary.color)}
                        >
                            <Icon>
                                <FaTrashAlt />
                            </Icon>
                        </Button>
                    {/if}
                </Row>
            </button>
        {/each}
        <Button
            bg="var(--secondary)"
            color="var(--secondary-text)"
            onClick={async () => {
                const name = await Prompt.askText('Write the name of the theme')
                if (name === null) return
                if (!name) return
                ThemeStore.createNewAndSet(name)
            }}
            style="padding: 1rem 2rem; gap: 0.5rem"
        >
            <Icon>
                <FaPlus />
            </Icon>
            Create new theme
        </Button>
    </Row>
    <Column gap="1rem" style="margin-bottom:3rem; position: relative; margin-top: 2rem">
        {#if !ThemeStore.meta.editable}
            <div
                style="
            background-color: rgba(var(--RGB-secondary), 0.7);
            backdrop-filter: blur(0.2rem);
            position: absolute;
            display: flex;
            margin: -1rem;
            border-radius: 1rem;
            justify-content: center;
            align-items: center;
            font-size: 1.5rem;
            inset: 0;
            "
            >
                Create a new theme to edit it
            </div>
        {/if}
        {#each theme as color, i (color.name)}
            {#if !color.readonly}
                <div in:scale|global={{ delay: i * 50 + 200, start: 0.9, duration: 200 }}>
                    <ColorThemeRow bind:color={theme[i]} />
                </div>
            {/if}
        {/each}
    </Column>
</div>

<style lang="scss">
    .theme-editor {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .presets-title {
        margin: 0;
        font-size: 1.1rem;
    }
    .theme-selector {
        display: flex;
        flex-direction: column;
        border-radius: 0.5rem;
        min-width: min(100%, 10rem);
        flex: 1;

        overflow: hidden;
    }
</style>
