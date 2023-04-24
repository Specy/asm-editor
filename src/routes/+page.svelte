<script lang="ts">
	import ButtonLink from '$cmp/buttons/ButtonLink.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import MainPageLinkPreview from '$cmp/main/HeroLink.svelte'
	import FaGithub from 'svelte-icons/fa/FaGithub.svelte'
	import FaBook from 'svelte-icons/fa/FaBook.svelte'
	import FaSearch from 'svelte-icons/fa/FaSearch.svelte'
	import FaTools from 'svelte-icons/fa/FaTools.svelte'
	import MainPageSection from '$cmp/main/HeroSection.svelte'
	import AnimatedRgbLine from '$cmp/misc/AnimatedRgbLine.svelte'
	import GoLinkExternal from 'svelte-icons/go/GoLinkExternal.svelte'
	import { ThemeStore } from '$stores/themeStore'
	import { onMount } from 'svelte'
	import FaDownload from 'svelte-icons/fa/FaDownload.svelte'
	import FaDonate from 'svelte-icons/fa/FaDonate.svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import Page from '$cmp/layout/Page.svelte'
	const textShadowPrimary = ThemeStore.getColor('primary').isDark()
	const textShadowSecondary = ThemeStore.getColor('secondary').isDark()
	let installEvent: any = null
	onMount(() => {
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault()
			console.log('beforeinstallprompt', e)
			installEvent = e
		})
	})
</script>

<svelte:head>
	<title>Welcome to Asm-Editor</title>
	<meta
		name="description"
		content="Write, learn and run M68K assembly code on your browser. View registers and memory, step and undo the program."
	/>
</svelte:head>

<Page>
	<div class="main">
		<div class="content row">
			<div class="preview-image" />
			<div class="presentation">
				<div class="welcome-title" class:textShadow={textShadowPrimary}>
					The all in one web editor for M68K
				</div>
				<div style="display: flex ; gap: 0.6rem">
					<ButtonLink
						href="/projects"
						style={textShadowPrimary && 'box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);'}
						title="Open the editor"
					>
						Go to the editor
					</ButtonLink>
					<ButtonLink
						style={textShadowPrimary && 'box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);'}
						cssVar="tertiary"
						href="https://github.com/Specy/asm-editor"
						title="Open the project on github"
					>
						<Icon>
							<FaGithub />
						</Icon>
					</ButtonLink>
					<ButtonLink
						style={textShadowPrimary && 'box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);'}
						cssVar="tertiary"
						href="/donate"
						title="Donate to the project"
					>
						<Icon>
							<FaDonate />
						</Icon>
					</ButtonLink>
				</div>
				{#if installEvent}
					<Button
						style="margin-top: 1rem; gap: 0.5rem;"
						cssVar="secondary"
						on:click={async () => {
							try {
								await installEvent.prompt()
							} catch (e) {
								console.error(e)
							}
							installEvent = null
						}}
					>
						<Icon>
							<FaDownload />
						</Icon>
						Install WebApp
					</Button>
				{/if}
			</div>
		</div>
		<AnimatedRgbLine height="0.5rem" style="border-radius: 0;" />
		<div class="links-row-wrapper">
			<div class="links-row">
				<MainPageLinkPreview href="/documentation" title="Documentation page">
					<div slot="icon">
						<FaBook />
					</div>
					<div slot="description">Documentation</div>
				</MainPageLinkPreview>
				<MainPageLinkPreview href="#codeCompletion" title="Code completion section">
					<div slot="icon">
						<FaSearch />
					</div>
					<div slot="description">Code completion</div>
				</MainPageLinkPreview>
				<MainPageLinkPreview href="#tools" title="Tools section">
					<div slot="icon">
						<FaTools />
					</div>
					<div slot="description">Tools</div>
				</MainPageLinkPreview>
			</div>
		</div>
	</div>
	<div class="column sections-wrapper">
		<MainPageSection id="documentation" imageUrl="/images/ASM-Documentation.webp">
			<div slot="title">Documentation</div>
			<div class="description" class:textShadow={textShadowPrimary}>
				The editor comes with a built-in documentation for the M68K instruction set including the
				valid addressing modes, description, examples for each instruction and directive.
				<br />
				<a href="/documentation" title="View documentation" class="docs-visit">
					Or visit the documentation
					<div style="width: 1rem; height: 1rem; margin-top: 0.2rem; margin-left: 0.3rem">
						<GoLinkExternal />
					</div>
				</a>
			</div>
		</MainPageSection>
		<MainPageSection id="codeCompletion" imageUrl="/images/ASM-CodeCompletion.webp" reverse>
			<div slot="title">Code completion</div>
			<div class="description" class:textShadow={textShadowSecondary}>
				Write and learn faster with the code completion tools, suggesting you with the valid
				addressing modes and shortcuts for labels and other keywords. Real time semantic errors that
				warn you before you compile the code
			</div>
		</MainPageSection>
		<MainPageSection id="tools" imageUrl="/images/ASM-Tools.webp">
			<div slot="title">Tools & Customisation</div>
			<div class="description" class:textShadow={textShadowPrimary}>
				Feature rich tools to help you debug your code. Includes breakpoints, stepping, undo, stack
				tracer, register/memory diffing, decimal/hexadecimal conversions, stdout/stdin/errors,
				customisable shortcuts and settings, formatter and more. You can also customise the theme of
				the editor to your liking.
			</div>
		</MainPageSection>
	</div>
</Page>

<div class="pre-footer" />

<style lang="scss">
	.welcome-title {
		font-size: 3rem;
		max-width: 30rem;
		text-align: center;
		margin-bottom: 2rem;
		color: var(--primary-text);
	}
	.textShadow {
		text-shadow: 2px 2px 12px rgb(36 36 36);
	}
	.sections-wrapper {
		padding: 4rem 0;
		font-family: FiraCode;
	}
	.presentation {
		display: flex;
		flex: 1;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		background-color: rgba(var(--RGB-primary), 0.9);
		backdrop-filter: blur(5px);
		z-index: 2;
	}
	:global(body) {
		scroll-behavior: smooth;
	}
	.docs-visit {
		color: var(--accent);
		display: flex;
		&:hover {
			text-decoration: underline;
		}
	}

	.links-row-wrapper {
		background-color: var(--secondary);
		color: var(--secondary-text);
		display: flex;
		justify-content: center;
	}
	.links-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		@media screen and (max-width: 650px) {
			display: flex;
			flex-wrap: wrap;
		}
	}
	.main {
		display: flex;
		flex-direction: column;
		/* 
		background-size: 400% 400%;
		animation: gradient 15s ease infinite;
		background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
		*/
		min-height: 100vh;
		border-radius: 0.6rem;
		.content {
			display: flex;
			flex: 1;
			border-radius: 0.4rem;
			overflow: hidden;
			position: relative;
			border-radius: 0.45rem;
		}
	}
	.preview-image {
		display: flex;
		width: 100%;
		height: 100%;
		top: 0;
		left: 0;
		position: absolute;
		background-image: url('/images/ASM-editor.webp');
		background-repeat: no-repeat;
		background-position: center;
		background-size: cover;
	}

	@media screen and (max-width: 650px) {
		.main {
			.content {
				width: 100%;
			}
		}
		.welcome-title {
			font-size: 2.5rem;
		}
	}

	@keyframes gradient {
		0% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
		100% {
			background-position: 0% 50%;
		}
	}
</style>
