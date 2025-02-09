<script>
    import { createEventDispatcher } from 'svelte'
    /** @type {{style?: string, children?: import('svelte').Snippet}} */
    let { style = '', children } = $props()
    const dispatch = createEventDispatcher()
    function submit(e) {
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
