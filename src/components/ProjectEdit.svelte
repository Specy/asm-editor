<script lang="ts">
	import Editor from '$cmp/Editor.svelte'
	import { ProjectStore } from '$stores/projectsStore'
	import Button from '$cmp/buttons/Button.svelte'
	import { toast } from '$cmp/toast'
	import { M68KEmulator } from '$lib/M68KEmulator'
	import RegisterVisualiser from '$cmp/RegisterVisualiser.svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import { createEventDispatcher } from 'svelte'
	import type { Project } from '$lib/Project'
	import Icon from './layout/Icon.svelte'
	export let id
	export let project
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
		<Editor bind:project highlightedLine={$emulator.line} />
	</div>
	<div class="registers-wrapper">
		<RegisterVisualiser registers={$emulator.registers} />
	</div>
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

<style lang="scss">
	.project-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 1rem;

		.row {
			display: flex;
			align-items: center;
		}
	}
	.editor-registers-wrapper {
		display: grid;
		grid-template-columns: 6fr 2fr;
		width: 100%;
		flex: 1;
		.editor-wrapper,
		.registers-wrapper {
			display: flex;
			overflow: hidden;
			border-radius: 0.5rem;
		}
		.registers-wrapper {
			margin-left: 1rem;
			flex-direction: column;
			align-items: center;
		}
	}
	.project-controls {
		margin-top: 1rem;
		display: flex;
		gap: 0.5rem;
	}
</style>
