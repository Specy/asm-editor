<script lang="ts">
	import MdClose from 'svelte-icons/md/MdClose.svelte'
	import MdMenu from 'svelte-icons/md/MdMenu.svelte'
	import { page } from '$app/stores'
	import { theme } from '$stores/theme'
	let currentPath = $page.path
	$: currentPath = $page.path
	let scrollY = 0
	let lastPosition = 10
	let navHidden = false
	let menuOpen = false
	$: {
		if (!menuOpen && scrollY > 300) {
			navHidden = scrollY > lastPosition
			lastPosition = scrollY
		} else {
			navHidden = false
		}
	}
	const paths = [
		{ href: '/', text: 'Home'},
		{ href: '/donate', text: 'Donate'}
	]
</script>

<svelte:window bind:scrollY />
<nav class="nav" class:navDark={$theme === 'dark'}>
	<div class="desktop-menu">
		<div class="links" class:whiteText={$theme === 'dark'}>
			{#each paths as path}
				<a 
					href={path.href} 
					style={currentPath === path.href ? 'color:#b00752' : ''}
				>{path.text}</a>
			{/each}
		</div>
	</div>

	<div class="mobile-menu" class:navHidden class:mobileMenuDark={$theme === 'dark'}>
		<div class="mobile-row">
			<div style="font-size: 1.1rem; display:flex; align-items:center">
			</div>
			<div class="top-mobile-menu">
				<div
					on:click={() => {
						menuOpen = !menuOpen
					}}
					style="height:2rem"
					class:darkIcon={$theme === 'dark'}
				>
					{#if menuOpen}
						<MdClose />
					{:else}
						<MdMenu />
					{/if}
				</div>
			</div>
		</div>

		<div class="links-mobile" class:menuOpen class:mobileMenuDark={$theme === 'dark'}>
			{#each paths as path}
				<a 
					on:click={() => (menuOpen = false)}
					href={path.href} 
					style={currentPath === path.href ? 'color:#b00752' : ''}
				>{path.text}</a>
			{/each}
		</div>
	</div>
</nav>

<style lang="scss">
	@import '../../variables.scss';
	.desktop-menu {
		width: 100%;
		display: flex;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.mobile-row {
		display: flex;
		padding: 0.5rem;
		justify-content: space-between;
		align-items: center;
	}
	.mobile-menu {
		position: absolute;
		top: 0;
		right: 0;
		padding-bottom: 0;
		background-color: #f7faff;
		opacity: 0.98;
		width: 100%;
		display: none;
		flex-direction: column;
		transition: all 0.2s ease-out;

		transform: translateY(0);
	}
	.mobileMenuDark {
		background-color: rgba(29, 32, 33, 0.9);
		color: #bfbfbf;
		> * {
			color: #bfbfbf;
		}
	}
	.navHidden {
		transform: translateY(-5rem);
		transition: all 0.4s ease-out;
	}
	.top-mobile-menu {
		height: 2rem;
		display: flex;
		align-items: center;
	}
	.links {
		display: flex;
		flex-direction: row;
		align-items: center;
		margin-right: 3rem;
		> a {
			margin-left: 1.5rem;
			transition: all 0.2s ease-in-out;
			cursor: pointer;
			text-decoration: none;
		}
	}
	.whiteText {
		color: #bfbfbf;
		> * {
			color: #bfbfbf;
		}
	}
	.links-mobile {
		width: 100%;
		flex-direction: column;
		overflow: hidden;
		height: 0;
		display: flex;
		padding: 0;
		
		transition: all 0.3s ease-out;
		justify-content: space-around;
		> a {
			padding: 0.2rem;
			margin-left: 2rem;
		}
	}
	.menuOpen {
		transition: all 0.4s ease-out;
		opacity: 1;
		border-bottom: solid 2px $accent;
		height: 10rem;
	}
	.links a:hover {
		color: $accent;
	}
	.nav {
		padding: 1.5rem 2rem;
		display: flex;
		z-index: 10;
		background-color: $main;
		justify-content: space-between;
		align-items: center;
	}
	.navDark {
		background-color: $dark;
	}
	.darkIcon {
		color: #bfbfbf;
	}
	@media (max-width: 650px) {
		.mobile-menu {
			display: flex;
		}
		.desktop-menu {
			display: none;
		}
		.nav {
			position: fixed;
			width: 100%;
			margin: 0rem;
			margin-bottom: 2rem;
			padding: 1rem;
		}
		.links {
			display: none;
			flex-direction: column;
		}
	}
</style>
