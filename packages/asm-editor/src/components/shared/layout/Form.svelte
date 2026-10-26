<script lang="ts">
    interface Props {
        style?: string
        /** The form was submitted, by Enter in a field or a submit button; the page stays put. */
        onSubmit?: () => void
        children?: import('svelte').Snippet
    }

    let { style = '', onSubmit, children }: Props = $props()
    function submit(e: SubmitEvent) {
        e.preventDefault()
        onSubmit?.()
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
