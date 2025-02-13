<script lang="ts">
    import { afterNavigate } from '$app/navigation'
    import Button from '$cmp/shared/button/Button.svelte'
    import ColorThemeRow from '$cmp/specific/ColorThemeRow.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Title from '$cmp/shared/layout/Header.svelte'
    import { ThemeStore } from '$stores/themeStore'
    import { onMount } from 'svelte'
    import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
    import { scale } from 'svelte/transition'
    import Column from '$cmp/shared/layout/Column.svelte'
    let theme = $state(ThemeStore.toArray())
    onMount(() => {
        ThemeStore.theme.subscribe((_) => {
            theme = ThemeStore.toArray()
        })
    })
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

<Page cropped contentStyle="max-width: 40rem; padding: 1rem">
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
    <Column gap="1rem" style="margin-bottom:3rem">
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
        margin-bottom: 2rem;
        align-items: center;
    }
    .colors {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-bottom: 3rem;
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
