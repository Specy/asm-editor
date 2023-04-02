<script lang="ts">
	import Button from '$cmp/buttons/Button.svelte'
	import ButtonLink from '$cmp/buttons/ButtonLink.svelte'
import Input from '$cmp/inputs/Input.svelte'
	import M68KDocumentation from '$cmp/M68KDocumentation.svelte'
	import Navbar from '$cmp/Navbar.svelte'
	import { instructionsDocumentationList } from '$lib/languages/M68K-documentation'
	
	let searchValue = ''
</script>

<svelte:head>
	<title> M68K Documentation </title>
	<meta name="description" content="Read the M68K Documentation, including all the instructions with addressing modes and the assembler features" />
	<meta name="tags" content={instructionsDocumentationList.map((i) => i.name).join(', ')} />
</svelte:head>


<Navbar>
	<a class="icon" href="/" title="Go to the home">
		<img src="/favicon.png" alt="logo" />
		Home
	</a>
	<Input
		bind:value={searchValue}
		placeholder="Search"
		style="padding: 0rem; background-color: var(--tertiary); color: var(--tertiary-text); max-width: 15rem;"
	/>
</Navbar>

<div class="content">
	<div class="column" style="max-width: 60rem; width: 100%;">
		<h1 style="margin-top: 1rem; gap: 1rem; flex-wrap: wrap" class="row">  
			Documentation  
			<ButtonLink href="/documentation/m68k/instruction" style="font-weight: normal;" cssVar="accent2">
				Visit interactive documentation
			</ButtonLink>
		</h1>
		<M68KDocumentation 
			bind:searchValue 
			visible={true} 
			defaultOpen={true}  
			style="max-width: 60rem; overflow-y: unset" 
			showRedirect
			openLinksInNewTab={false}
		/>
	</div>
</div>

<style lang="scss">
	.content {
		display: flex;
		flex-direction: column;
        align-items: center;
		padding: 0.8rem;
		padding-top: 4rem;
		min-height: 100vh;
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
</style>
