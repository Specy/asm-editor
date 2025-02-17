<script lang="ts">
    import { afterNavigate } from '$app/navigation'
    import Button from '$cmp/shared/button/Button.svelte'
    import ColorThemeRow from '$cmp/specific/ColorThemeRow.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Title from '$cmp/shared/layout/Header.svelte'
    import { ThemeStore } from '$stores/themeStore.svelte'
    import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
    import { scale } from 'svelte/transition'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
    import { Prompt } from '$stores/promptStore'
    import FaTrashAlt from 'svelte-icons/fa/FaTrashAlt.svelte'

    let theme = ThemeStore.themeList
    let previousPage: string = $state('/projects')


    afterNavigate(({ from }) => {
        previousPage = from?.url.pathname ?? previousPage
    })
</script>

<svelte:head>
    <title>Theme</title>
    <meta name="description" content="Change the theme of the app" />
    <meta property="og:description" content="Change the theme of the app" />
    <meta property="og:title" content="Theme" />
</svelte:head>

<Page cropped contentStyle="max-width: 40rem; padding: 1rem; gap: 1rem">
    <div class="header">
        <a href={previousPage} class="go-back" title="Go to previous page">
            <Button hasIcon cssVar="primary" style="padding: 0.4rem" title="Go to previous page">
                <Icon size={2}>
                    <FaAngleLeft />
                </Icon>
            </Button>
        </a>
        <Title noMargin>Theme</Title>
    </div>
    <h1>Theme Presets</h1>
    <Row wrap gap="1rem">
        {#each ThemeStore.themes as t}
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
                    {#each Object.keys(t.theme) as key}
                        {#if !t.theme[key].readonly}
                            <div
                                style="background-color: {t.theme[key]
                                    .color}; flex:1; display: flex;"
                            ></div>
                        {/if}
                    {/each}
                </Row>

                <Row justify="between" style={'width: 100%'}>
                    <div style="text-align: center; padding: 1rem;">
                        {t.name}
                    </div>
                    {#if t.editable}
                        <Button
                            onClick={async () => {
                                if (
                                    !(await Prompt.confirm(
                                        'Are you sure you want to delete this theme?'
                                    ))
                                )
                                    return
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
                <div in:scale|global={{ delay: i * 50 + 200, start: 0.9, duration: 150 }}>
                    <ColorThemeRow bind:color={theme[i]} />
                </div>
            {/if}
        {/each}
    </Column>
</Page>

<style lang="scss">
    .header {
        display: flex;
        margin-top: 4rem;
        margin-bottom: 1rem;
        align-items: center;
    }
    .colors {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-bottom: 3rem;
    }
    .theme-selector {
        display: flex;
        flex-direction: column;
        border-radius: 0.5rem;
        min-width: min(100%, 10rem);

        overflow: hidden;
    }
    @media screen and (min-width: 650px) {
        .go-back {
            position: absolute;
            top: 1rem;
            left: 1rem;
        }
    }
    @media screen and (max-width: 650px) {
        .header {
            margin-top: 1rem;
        }
    }
</style>
