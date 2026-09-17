<script lang="ts">
    import {
        BUILTIN_THEMES,
        DEFAULT_THEME,
        ScopedTheme,
        ThemeStore,
        themeCssVariables
    } from '$stores/themeStore.svelte'

    interface Props {
        /** The id of the built-in theme this subtree shows, e.g. `LANGUAGE_THEMES.MIPS`. */
        theme: string
        children?: import('svelte').Snippet
    }

    let { theme, children }: Props = $props()

    /**
     * The theme, unless the reader is already wearing one they chose: a theme of their own is a
     * choice, and a language's colours are only the app's own opinion about a page.
     *
     * What the app is *showing* is the test, not what storage says the reader picked — the store
     * keeps its saved themes and the chosen id under separate keys and drops the choice if the
     * first is missing, and a page that backed off for a theme that never loaded would be wearing
     * neither. Nothing here selects into the store, so reading it cannot see its own answer.
     *
     * On the server this is always the default, which is what bakes a language's colours into its
     * prerendered pages and is why they do not flash in. A reader who has chosen a theme has the
     * override dropped as hydration runs.
     */
    const scoped = $derived(
        ThemeStore.meta.id === DEFAULT_THEME.id
            ? (BUILTIN_THEMES.find((builtin) => builtin.id === theme) ?? null)
            : null
    )
    const variables = $derived(scoped ? themeCssVariables(scoped.theme, ThemeStore.meta) : '')

    //the browser's own chrome, the one part of the page that is not inside this element
    $effect(() => {
        ScopedTheme.set(scoped?.id ?? null)
        return () => ScopedTheme.set(null)
    })
</script>

<!-- Custom properties inherit, and a declaration on an element always beats one it inherits, so
     redefining them here is enough to dress everything below without touching the app's theme. -->
<div class="theme-scope" style={variables}>
    {@render children?.()}
</div>

<style lang="scss">
    /* the shape of the theme root it sits inside, so a layout lays itself out the same whether or
       not it is scoped */
    .theme-scope {
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 100%;
        background-color: var(--background);
        color: var(--background-text);
    }
</style>
