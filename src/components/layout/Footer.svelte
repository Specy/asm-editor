<script lang="ts">
	import FaGithub from 'svelte-icons/fa/FaGithub.svelte'
	import FaDiscord from 'svelte-icons/fa/FaDiscord.svelte'
</script>

<footer class="footer">
	<div class="footer-inner">
		<div class="footer-justify">
			<div class="logo-mobile">
				<a class="logo-wrapper" href="https://portfolio.specy.app" >
					<img src="/images/logo.png" alt="logo" class="logo" />
					<div target="_blank"> Portfolio </div>
				</a>
			</div>
			<a class="logo-desktop" href="https://specy.app">
				<div class="logo-wrapper">
					<img src="/images/logo.png" alt="logo" class="logo" />
					<div class="logo-text">Specy</div>
				</div>
			</a>

			<div class="desktop-portfolio">
				<a href="https://portfolio.specy.app" target="_blank"> Portfolio </a>
			</div>
			<div class="icon-wrapper">

				<a class="icon" href="https://github.com/Specy/soundboard" target="_blank">
					<FaGithub />
				</a>
				<a
					class="icon"
					href="https://discord.gg/Arsf65YYHq"
					target="_blank"
					style="margin-top: 0.2rem;"
				>
					<FaDiscord />
				</a>
			</div>
		</div>
		<div class="copyright">
			© {new Date().getFullYear()} Specy. All rights reserved.
		</div>
	</div>
</footer>

<style lang="scss">
	@import '../../variables.scss';
	.logo-wrapper {
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
		color: #bfbfbf;
		transition: all 0.2s ease-in-out;
	}
	a:hover {
		color: $accent;
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
		}
	}
	.copyright {
		font-size: 0.8rem;
		margin-top: 0.3rem;
		color: lightgray;
	}
	.footer {
		margin-top: auto;
	}
	.footer-justify {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.footer-inner {
		height: 6rem;
		background-color: $dark;
		color: $textWhite;
		padding: 1.5rem;
		padding-bottom: 0rem;
		display: flex;
		z-index: 2;
		flex-direction: column;
	}
	.logo-mobile{
		display: none;
	}
	@media (max-width: 480px) {
		.footer-inner {
			padding: 1rem;
			height: unset;
		}
		.copyright{
			margin-top: 1.2rem;
		}
		.logo-wrapper {
			> .logo {
				width: 2rem;
				height: 2rem;
			}
		}
		.logo-mobile{
			display: flex;
		}
		.logo-desktop{
			display:none ;
		}
		.desktop-portfolio{
			display: none;
		}
	}
</style>