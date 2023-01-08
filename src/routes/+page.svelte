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
</script>

<svelte:head>
	<title>Welcome to Asm-Editor</title>
	<meta name="description" content="Write, learn and run M68K assembly code on your browser. View registers and memory, step and undo the program." />
</svelte:head>

<div class="main">
	<div class="content row">
		<div class="preview-image" />
		<div class="presentation">
			<div class="welcome-title">The all in one web editor for M68K</div>
			<div style="display: flex ;">
				<ButtonLink
					href="/projects"
					color="var(--accent-text)"
					style="box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);"
					title="Open the editor"
				>
					Go to the editor
				</ButtonLink>
				<ButtonLink
					style="margin-left: 1rem; box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);"
					bg="var(--secondary)"
					color="var(--secondary-text)"
					href="https://github.com/Specy/asm-editor"
					title="Open the project on github"
				>
					<Icon>
						<FaGithub />
					</Icon>
				</ButtonLink>
			</div>
		</div>
	</div>
	<AnimatedRgbLine height="0.5rem" style="border-radius: 0;" />
	<div class="links-row-wrapper">
		<div class="links-row">
			<MainPageLinkPreview href="#documentation" title="Documentation section">
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
		<div class="description">
			The editor comes with a built-in documentation for the M68K instruction set including the
			valid addressing modes, description, examples for each instruction and directive.
		<br/>
			<a href="/documentation" title="View documentation" class="docs-visit">
				Or visit the documentation
			</a>
		</div>
	</MainPageSection>
	<MainPageSection id="codeCompletion" imageUrl="/images/ASM-CodeCompletion.webp" reverse>
		<div slot="title">Code completion</div>
		<div class="description">
			Write and learn faster with the code completion tools, suggesting you with the valid
			addressing modes and shortcuts for labels and other keywords. Real time semantic errors that
			warn you before you compile the code
		</div>
	</MainPageSection>
	<MainPageSection id="tools" imageUrl="/images/ASM-Tools.webp">
		<div slot="title">Tools & Customisation</div>
		<div class="description">
			Feature rich tools to help you debug your code. Includes breakpoints, stepping, undo,
			register/memory diffing, decimal/hexadecimal conversions, stdout/stdin/errors, customisable shortcuts and settings, formatter and more.
			You can even customise the theme of the editor to your liking.
		</div>
	</MainPageSection>
</div>
<div class="pre-footer" />

<style lang="scss">
	.welcome-title {
		font-size: 3rem;
		max-width: 30rem;
		text-align: center;
		margin-bottom: 2rem;
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
		background-color: rgba(var(--RGB-primary), 0.94);
		z-index: 2;
	}
	:global(body) {
		scroll-behavior: smooth;
	}
	.docs-visit{
		color: var(--accent);
	}
	.links-row-wrapper{
		background-color: var(--secondary);
		color: var(--secondary-text);
		display: flex;
		justify-content: center;
	}
	.links-row {
		display: grid;
		grid-template-columns: repeat(3,1fr);
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
		height: 100vh;
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
		border: solid 0.1rem var(--accent);
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
