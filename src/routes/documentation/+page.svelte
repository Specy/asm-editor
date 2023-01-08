<script lang="ts">
	import Input from '$cmp/inputs/Input.svelte'
	import M68KDocumentation from '$cmp/M68KDocumentation.svelte'
	let searchValue = ''
</script>

<title> M68K Documentation </title>

<div class="search-bar">
	<a class="icon" href="/" title="Go to the home">
		<img src="/favicon.png" alt="logo" />
		Home
	</a>
	<Input
		bind:value={searchValue}
		placeholder="Search"
		style="padding: 0rem; background-color: var(--tertiary); color: var(--tertiary-text); max-width: 15rem;"
	/>
</div>
<div class="content">
	<M68KDocumentation bind:searchValue visible={true} defaultOpen={true}  style="max-width: 60rem;"/>
</div>

<style lang="scss">
	.content {
		display: flex;
		flex-direction: column;
        align-items: center;
		padding: 0.8rem;
		padding-top: 4rem;
        height: 100vh;
		overflow-y: auto;
	}
	.icon {
		height: 2.2rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		img {
			height: 100%;
		}
		&:hover {
			color: var(--accent);
		}
	}
	.search-bar {
		position: absolute;
		top: 0rem;
		padding: 0.8rem;
		width: 100%;
		gap: 0.8rem;
		border-radius: 0.6rem;
		border-top-left-radius: 0;
		border-top-right-radius: 0;
		display: flex;
		justify-content: space-between;
		background-color: rgba(var(--RGB-secondary), 0.5);
		backdrop-filter: blur(0.4rem);
		z-index: 1;
	}
</style>
