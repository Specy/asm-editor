<script lang="ts">
    import { navigationStore } from '$stores/navigationStore'
    import { fly } from 'svelte/transition'
    interface Props {
        cropped?: boolean | string
        style?: string
        contentStyle?: string
        children?: import('svelte').Snippet
        hasNavbar?: boolean
    }

    let { cropped = false, style = '', contentStyle = '', children, hasNavbar }: Props = $props()
</script>

<main
    class="content"
    {style}
    in:fly|global={{ x: $navigationStore.direction === 'back' ? 30 : -30, duration: 500 }}
>
    <div
        class="column"
        class:has-nav={hasNavbar}
        style="max-width: {cropped ? (typeof cropped === 'string' ? cropped : '60rem') : 'unset'}; width:100%;height: 100%; {contentStyle}"
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
    .has-nav{
        padding-top: 3.2rem;
    }
</style>
