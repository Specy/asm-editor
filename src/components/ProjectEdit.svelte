<script lang="ts">
	import Editor from '$cmp/Editor.svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import { M68KEmulator } from '$lib/M68KEmulator'
	import RegisterVisualiser from '$cmp/RegisterVisualiser.svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import { createEventDispatcher } from 'svelte'
	import type { Project } from '$lib/Project'
	import Icon from './layout/Icon.svelte'
	export let project:Project
	const saveDispatch = createEventDispatcher<{ save: Project }>()
	const emulator = M68KEmulator(project.code || '')

</script>
<header class="project-header">
	<div class="row">
		<a href="/projects">
			<Icon size={2}>
				<FaAngleLeft />
			</Icon>
		</a>
		<h1>{project.name}</h1>
	</div>
	<div class="row">
		<Button
			on:click={() => {
				saveDispatch('save', project)
			}}
		>
			Save
		</Button>
	</div>
</header>

<div class="editor-registers-wrapper">
	<div class="editor-wrapper">
		<div class="editor-corners">
			<Editor bind:project highlightedLine={$emulator.line} />
		</div>
		<div class="project-controls">
			{#if $emulator.line < 0}
				<Button
					on:click={() => {
						emulator.setCode(project.code)
						emulator.run()
					}}
				>
					Run
				</Button>
				<Button
					on:click={() => {
						emulator.setCode(project.code)
						emulator.step()
					}}
				>
					Build
				</Button>
			{:else}
				<Button
					on:click={() => {
						emulator.setCode(project.code)
					}}
				>
					Stop
				</Button>
				<Button
					on:click={() => {
						emulator.step()
					}}
				>
					Step
				</Button>
			{/if}
		</div>
	</div>
	<div class="registers-wrapper">
		<RegisterVisualiser registers={$emulator.registers} />
	</div>
</div>


<style lang="scss">
	.project-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 1rem;

		.row {
			display: flex;
			align-items: center;
			h1{
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}
		}
	}
	.editor-registers-wrapper {
		display: grid;
		grid-template-columns: 6fr 3fr;
		width: 100%;
		flex: 1;
		.editor-wrapper,
		.registers-wrapper {
			display: flex;
			overflow: hidden;
		}
		.editor-wrapper{
			flex-direction: column;
			.editor-corners{
				display: flex;
				overflow: hidden;
				flex: 1;
				border-radius: 0.5rem;
			}
		}
		.registers-wrapper {
			margin-left: 1rem;
			border-radius: 0.5rem;
			flex-direction: column;
			align-items: center;
		}
	}
	@media screen and (max-width: 700px){
		.editor-wrapper{
			height: 60vh;
		}
		.editor-registers-wrapper{
			grid-template-columns: 1fr;
		}
		.registers-wrapper {
			margin-left: 0;
			margin-top: 1rem;
		}
	}
	.project-controls {
		margin-top: 1rem;
		display: flex;
		gap: 0.5rem;
	}
</style>
