<script module lang="ts">
    //the first Page after the app starts is the one the reader landed on, which shows at once; only
    //a Page a navigation brings in flies in. A property, which each later Page reads
    const pages = { landed: false }
</script>

<script lang="ts">
    import { navigationStore } from '#stores/navigationStore.ts'
    import { fly } from 'svelte/transition'
    import { motion } from '#src/styles/motion.ts'
    interface Props {
        cropped?: boolean | string
        style?: string
        contentStyle?: string
        children?: import('svelte').Snippet
        hasNavbar?: boolean
        //the page fills the screen and scrolls inside itself, so the document keeps no scrollbar
        fillsScreen?: boolean
    }

    let {
        cropped = false,
        style = '',
        contentStyle = '',
        children,
        hasNavbar,
        fillsScreen = false
    }: Props = $props()

    const arriving = pages.landed
    pages.landed = true
</script>

<main
    class="content"
    class:has-nav={hasNavbar}
    class:fills-screen={fillsScreen}
    {style}
    in:fly|global={{
        y: $navigationStore.direction === 'back' ? 8 : -8,
        duration: arriving ? motion(500) : 0
    }}
>
    <div
        class="column"
        style="max-width: {cropped
            ? typeof cropped === 'string'
                ? cropped
                : '60rem'
            : 'unset'}; width:100%;height: 100%; {contentStyle}"
    >
        {@render children?.()}
    </div>
</main>

<style lang="scss">
    .content {
        display: flex;
        flex-direction: column;
        align-items: center;
        max-width: 100vw;
        position: relative;
        flex: 1;
    }
    .has-nav {
        margin-top: 3.2rem;
    }
    @media print {
        .content {
            height: auto;
            overflow: visible;
        }
        .has-nav {
            margin-top: 0;
        }
    }
</style>
