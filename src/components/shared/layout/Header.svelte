<script lang="ts">
    export let noMargin = false
    export let style = ''
    export let type: 'h1' | 'h2' | 'h3' | 'h4' = 'h1'
</script>

{#if type === "h1"}
	<h1 class:noMargin {style}>
		<slot />
	</h1>
{:else if type === "h2"}
	<h2 class:noMargin {style}>
		<slot />
	</h2>
{:else if type === "h3"}
	<h3 class:noMargin {style}>
		<slot />
	</h3>
{:else if type === "h4"}
	<h4 class:noMargin {style}>
		<slot />
	</h4>
{/if}


<style>
    h1 {
        margin: 1rem;
        margin-left: 0
    }

    .noMargin {
        margin: 0;
    }
</style>
