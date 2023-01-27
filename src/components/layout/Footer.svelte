<script lang="ts">
	import FaGithub from 'svelte-icons/fa/FaGithub.svelte'
	import FaRegCopyright from 'svelte-icons/fa/FaRegCopyright.svelte'
	import Icon from './Icon.svelte'
	import { toast } from '$stores/toastStore'
    import { page } from '$app/stores';
	import AnimatedRgbLine from '$cmp/misc/AnimatedRgbLine.svelte'
	import FaDonate from 'svelte-icons/fa/FaDonate.svelte'
	export let pages = []
</script>

{#if pages.includes($page.url.pathname)}
	<footer class="footer">
		<div class="footer-inner">
			<AnimatedRgbLine />
			<div class="footer-justify">
				<a class="logo-wrapper" href="https://specy.app" title="View my other websites">
					<div class="logo-content">
						<img src="/images/logo.png" alt="logo" class="logo" />
						<div>Specy</div>
					</div>
				</a>
				<a href="/changelog">
					Changelog
				</a>
				<div class="icon-wrapper">
					<a class="icon" href="/donate" title="Donate and support me">
						<Icon size={1.6}>
							<FaDonate />	
						</Icon>
					</a>
					<div class="icon">
						<Icon size={1.6}
							on:click={() => {
								toast.custom(
									'Copyright',
									`© ${new Date().getFullYear()} Specy. All rights reserved.`,
									4000
								)
							}}
						>
							<FaRegCopyright />
						</Icon>
					</div>
					<a class="icon" href="https://github.com/Specy/asm-editor" target="_blank"  rel="noreferrer" title="Visit on github">
						<Icon size={1.6}>
							<FaGithub />
						</Icon>
					</a>
				</div>
			</div>
		</div>
	</footer>
{/if}

<style lang="scss">
	.logo-content {
		display: flex;
		align-items: center;
		> .logo {
			width: 2rem;
			height: 2rem;
			margin-right: 0.5rem;
		}
		> div {
			font-size: 1rem;
		}
	}
	a {
		color: var(--primary-text);
		transition: all 0.2s ease-in-out;
	}
	a:hover {
		color: var(--accent);
	}

	.icon-wrapper {
		display: flex;
		flex-direction: row;
		align-items: center;
		> .icon {
			display: flex;
			align-items: center;
			color: var(--primary-text);
			margin-left: 1rem;
			cursor: pointer;
			transition: all 0.3s;
			&:hover{
				transform: rotate(25deg) scale(1.1);
			}
		}
	}
	.footer {
		margin-top: auto;
		width: 100%;
	}

	.footer-justify {
		display: flex;
		margin-top: 1rem;

		justify-content: space-between;
		align-items: center;
	}
	.footer-inner {
		background-color: var(--primary);
		color: var(--primary-text);
		justify-content: center;
		padding: 1rem 1.5rem;
		display: flex;
		z-index: 2;
		flex-direction: column;
	}
	@media (max-width: 480px) {
		.footer-inner {
			padding: 1rem;
			padding-top: 2rem;
			height: unset;
		}
		.logo-content {
			> .logo {
				width: 2rem;
				height: 2rem;
			}
		}
	}
</style>
