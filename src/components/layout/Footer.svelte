<script lang="ts">
	import FaGithub from 'svelte-icons/fa/FaGithub.svelte'
	import FaRegCopyright from 'svelte-icons/fa/FaRegCopyright.svelte'
	import Kofi from '$cmp/KoFi.svelte'
	import Icon from './Icon.svelte'
	import { toast } from '$cmp/toast'
    import { page } from '$app/stores';
	export let pages = []

</script>

{#if pages.includes($page.url.pathname)}
	<footer class="footer">
		<div class="footer-inner">
			<div class="footer-line" />
			<div class="footer-justify">
				<a class="logo-wrapper" href="https://specy.app">
					<div class="logo-content">
						<img src="/images/logo.png" alt="logo" class="logo" />
						<div>Specy</div>
					</div>
				</a>

				<div class="icon-wrapper">
					<a class="icon" href="https://ko-fi.com/specy">
						<Icon size={2}>
							<Kofi />	
						</Icon>
					</a>
					<div class="icon">
						<Icon size={2}
							on:click={() =>
								toast.custom(
									'Copyright',
									`© ${new Date().getFullYear()} Specy. All rights reserved.`,
									4000
							)}
						>
							<FaRegCopyright />
						</Icon>
					</div>
					<a class="icon" href="https://github.com/Specy/asm-editor" target="_blank">
						<Icon size={2}>
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
		color: #e20c6c;
	}

	.icon-wrapper {
		display: flex;
		flex-direction: row;
		align-items: center;
		> .icon {
			display: flex;
			align-items: center;
			width: 2rem;
			color: #bfbfbf;
			margin-left: 1rem;
			cursor: pointer;
			transition: all 0.4s;
			&:hover{
				transform: rotate(30deg) scale(1.1);
			}
		}
	}
	.footer {
		margin-top: auto;
		width: 100%;
	}

	.footer-line {
		width: 100%;
		height: 0.2rem;
		border-radius: 1rem;
		margin-bottom: 1rem;
		background: linear-gradient(
			60deg,
			hsl(224, 85%, 66%),
			hsl(269, 85%, 66%),
			hsl(314, 85%, 66%),
			hsl(359, 85%, 66%),
			hsl(44, 85%, 66%),
			hsl(89, 85%, 66%),
			hsl(134, 85%, 66%),
			hsl(179, 85%, 66%)
		);
		background-size: 300% 300%;
		background-position: 0 50%;
        animation: moveLine 10s ease-in-out alternate infinite;
	}
    @keyframes moveLine{
        0%{
            background-position: 0% 50%;
        }
        100%{
            background-position: 100% 50%;
        }
    }
	.footer-justify {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.footer-inner {
		height: 7rem;
		background-color: var(--primary);
		color: var(--primary-text);
		justify-content: center;
		padding: 1.5rem;
		padding-bottom: 0rem;
		display: flex;
		z-index: 2;
		flex-direction: column;
	}
	.logo-mobile {
		display: none;
	}
	@media (max-width: 480px) {
		.footer-inner {
			padding: 1rem;
			padding-top: 2rem;
			height: unset;
		}
		.copyright {
			margin-top: 1.2rem;
		}
		.logo-content {
			> .logo {
				width: 2rem;
				height: 2rem;
			}
		}
	}
</style>
