<script lang="ts">
	import Page from '$cmp/layout/Page.svelte'
	import Navbar from '$cmp/Navbar.svelte'
	import { capitalize } from '$lib/utils'
	import FaArrowRight from 'svelte-icons/fa/FaArrowRight.svelte'
	const langs = ['m68k']
</script>

<Navbar>
	<a class="icon" href="/" title="Go to the home">
		<img src="/favicon.png" alt="logo" />
		Home
	</a>
</Navbar>

<Page cropped>
	<h1>Available Languages</h1>
	<div class="langs">
		{#each langs as lang}
			<a class="lang" href="/documentation/{lang}">
				<div>
					{capitalize(lang)}
				</div>
				<div class="arrow">
					<FaArrowRight />
				</div>
			</a>
		{/each}
	</div>
	<h1 style="margin-top: 2rem;">Interactive instructions docs</h1>
	<div class="langs">
		{#each ['m68k'] as lang}
			<a class="lang" href="/documentation/{lang}/instruction">
				<div>
					{capitalize(lang)} interactive
				</div>
				<div class="arrow">
					<FaArrowRight />
				</div>
			</a>
		{/each}
	</div>
</Page>

<style lang="scss">
	.langs {
		display: grid;
		grid-template-columns: repeat(2, minmax(10rem, 1fr));
		gap: 1rem;
		margin-left: 1rem;
	}
	h1{
		font-size: 1.8rem;
		font-weight: normal;
	}
	.lang {
		padding: 1rem 2rem;
		padding-right: 1rem;
		align-items: center;
		border-radius: 0.5rem;
		width: 100%;
		display: flex;
		gap: 1rem;
		font-size: 1.2rem;
		justify-content: space-between;
		background-color: var(--secondary);
		color: var(--secondary-text);
		transition: all 0.2s;
		&:hover {
			background-color: var(--tertiary);
			color: var(--tertiary-text);
		}
	}
	.arrow {
		opacity: 0;
		height: 1.5rem;
		transition: all 0.2s;
		transform: translateX(-1rem);
	}
	.lang:hover .arrow {
		opacity: 1;
		transform: translateX(0);
	}
	.content {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.8rem;
		margin-top: 1rem;
		padding-top: 4rem;
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
