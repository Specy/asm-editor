<script lang="ts">
    import { createEventDispatcher } from 'svelte'

    interface Props {
        style?: string
        children?: import('svelte').Snippet
    }

    let { style = '', children }: Props = $props()
    const dispatch = createEventDispatcher()
    function submit(e: SubmitEvent) {
        e.preventDefault()
        dispatch('submit', e)
    }
</script>

<form onsubmit={submit} {style}>
    {@render children?.()}
</form>

<style lang="scss">
    form {
        display: flex;
        flex-direction: column;
        flex: 1;
    }
</style>
