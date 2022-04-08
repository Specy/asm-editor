<script lang="ts">
	import ButtonLink from '$cmp/buttons/ButtonLink.svelte';
	import Icon from '$cmp/layout/Icon.svelte'
	import FaGithub from 'svelte-icons/fa/FaGithub.svelte'
	let frequency = 0.09

</script>

<title> Welcome </title>

<div class="main">
	<div class="background" />
	<div class="content">
		<div class="welcome-title">The all in one web editor for M68K and MIPS</div>
		<div style="display: flex ;">
			<ButtonLink href="/projects" color="var(--accent-text)">
                        Go to the editor
			</ButtonLink>
			<ButtonLink 
                        style="margin-left: 1rem" 
                        bg="var(--secondary)" 
                        color="var(--secondary-text)"
                        href="https://github.com/Specy/asm-editor"
                  >
					<Icon>
						<FaGithub />
					</Icon>
			</ButtonLink>
		</div>
	</div>
</div>

<filter id="filter">
	<feTurbulence
		id="turbulence"
		type="fractalNoise"
		baseFrequency={frequency}
		numOctaves="2"
		result="turbulence"
	/>
	<feDisplacementMap
		in2="turbulence"
		in="SourceGraphic"
		scale="70"
		xChannelSelector="G"
		yChannelSelector="G"
	/>
</filter>

<style lang="scss">
	.welcome-title {
		font-size: 3rem;
		text-align: center;
		margin-bottom: 2rem;
	}
	.main {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		height: 100%;
		background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
		background-size: 400% 400%;
		animation: gradient 15s ease infinite;
		background-color: white;
		.content {
			max-width: 80vw;
			height: 100%;
			position: relative;
			display: flex;
			align-items: center;
			justify-content: center;
			flex-direction: column;
		}
		.background {
			width: 97%;
			height: 94%;
			top: 3%;
			left: 1.5%;
			filter: url(#filter);
			position: absolute;
			background-color: var(--primary);
		}
		@media screen and (max-width: 800px){
			.background {
				width: 92%;
				height: 94%;
				top: 3%;
				left: 4%;
			}
		}
	}

	@media screen and (max-width: 400px) {
		.main {
			padding: 1rem;
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
