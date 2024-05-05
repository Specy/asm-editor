<script lang="ts">
	import Navbar from '$cmp/shared/layout/Navbar.svelte'
	import Page from '$cmp/shared/layout/Page.svelte'
	import { versions } from './versions'
	import FaCircle from 'svelte-icons/fa/FaCircle.svelte'
  import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
</script>

<DefaultNavbar/>

<Page cropped contentStyle="padding: 1rem; padding-top: 4rem">
	<h1 style="margin-top: 1rem; margin-bottom: 2rem;">Changelog</h1>
	<div class="column changelog">
		{#each versions as version}
			<div class="column version">
				<div class="row version-header">
					<h3 class="version-title">
						{version.version}
					</h3>
					<p class="date">
						{version.date.toISOString().split('T')[0].replace(/-/g, '/')}
					</p>
				</div>

				<div class="version-content">
					{#if version.title}
						<div class="title">
							{version.title}
						</div>
					{/if}
					<ul>
						{#each version.changes as change}
							<li>
								{change}
							</li>
						{/each}
					</ul>
				</div>
			</div>
		{/each}
	</div>

	<div class="fading">
		<FaCircle />
	</div>
</Page>

<style lang="scss">
	.fading {
		width: 1rem;
		height: 1rem;
		margin-left: 2.1rem;
		margin-top: -0.1rem;
		color: var(--accent);
	}
	.version-title {
		font-weight: normal;
		width: 5rem;
		text-align: center;
		padding: 0.3rem;
		border-radius: 0.4rem;
		background-color: var(--accent);
		color: var(--accent-text);
		font-size: 1.2rem;
	}
	.version-header {
		gap: 1rem;
		align-items: center;
	}
	.title {
		font-size: 1.3rem;
		color: var(--accent);
		margin-bottom: 0.4rem;
	}
	.version-content {
		border-left: solid 0.2rem var(--accent);
		padding: 1rem;
		padding-top: 0rem;
		margin-left: 2.5rem;
		font-size: 1.1rem;
		padding-left: 2rem;
		padding-right: 0;
	}
	@media (max-width: 600px) {
		.version-content {
			padding-left: 1rem;
		}
	}
	ul {
		display: flex;
		margin-top: 0.6rem;
		flex-direction: column;
		padding-left: 2rem;
		gap: 0.4rem;
		> li {
			line-height: 1.4em;
		}
	}

	.changelog {
		gap: 0.6rem;
	}
	.version {
		gap: 0.6rem;
	}


</style>
