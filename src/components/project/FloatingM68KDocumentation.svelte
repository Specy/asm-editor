<script lang="ts">
	import FloatingContainer from '../layout/FloatingContainer.svelte'
	import Input from '$cmp/inputs/Input.svelte'
	import M68KDocumentation from '$cmp/M68KDocumentation.svelte'
	export let visible: boolean
	let searchValue = ''
</script>

<FloatingContainer bind:visible title="M68K Documentation" style="width: 45rem">
	<div class="search-bar" slot="header">
		<Input
			bind:value={searchValue}
			placeholder="Search"
			style="padding: 0rem; background-color: var(--tertiary); color: var(--tertiary-text);"
		/>
	</div>
	<div class="scroll">
		<M68KDocumentation bind:searchValue bind:visible defaultOpen={false} showRedirect={false}/>
	</div>
</FloatingContainer>

<style>
	.search-bar {
		max-width: 15rem;
	}
	.scroll{
		height: 80vh;
		overflow-y: auto;
	}
</style>
