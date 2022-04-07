<script lang="ts">
	import Editor from '$cmp/Editor.svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import { M68KEmulator } from '$lib/M68KEmulator'
	import MemoryVisualiser from '$cmp/MemoryVisualiser.svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import { createEventDispatcher } from 'svelte'
	import type { Project } from '$lib/Project'
	import FaSave from 'svelte-icons/fa/FaSave.svelte'
	import Icon from './layout/Icon.svelte'
	import { goto } from '$app/navigation'
	import { Prompt } from './prompt'
	import { toast } from './toast'
	import ErrorVisualiser from '$cmp/ErrorVisualiser.svelte'
	export let project: Project
	const saveDispatch = createEventDispatcher<{ save: Project }>()
	const emulator = M68KEmulator(project.code || '')

	async function checkIfSaved(e: Event) {
		if ($emulator.code !== project.code) {
			e.preventDefault()
			const result = await Prompt.askText(
				'You have unsaved changes, do you want to leave?',
				'confirm'
			)
			if (result) goto('/projects')
		}
	}
</script>

<header class="project-header">
	<div class="row">
		<a href="/projects" on:click={checkIfSaved}>
			<Icon size={2}>
				<FaAngleLeft />
			</Icon>
		</a>
		<h1>{project.name}</h1>
	</div>
	<div class="row">
		<Button
			on:click={() => {
				emulator.setCode(project.code)
				saveDispatch('save', project)
			}}
			hasIcon
			style="padding:0; width:2.2rem; height:2.2rem"
		>
			<Icon>
				<FaSave />
			</Icon>
		</Button>
	</div>
</header>

<div class="editor-registers-wrapper">
	<div class="editor-wrapper">
		<div class="editor-corners">
			<Editor 
				bind:project highlightedLine={$emulator.line} 
				disabled={$emulator.line >= 0} 
				hasError={$emulator.errors.length > 0}
			/>
		</div>
		<div class="project-controls">
			{#if $emulator.line < 0}
				<Button
					style="width: 4rem;"
					on:click={() => {
						try {
							emulator.setCode(project.code)
							emulator.run()
						} catch (e) {
							toast.error('Error executing code')
						}
					}}
				>
					Run
				</Button>
				<Button
					style="width: 4rem;"
					on:click={() => {
						try{
							emulator.setCode(project.code)
							emulator.step()
						}catch(e){
							toast.error("Error executing code")
						}

					}}
				>
					Build
				</Button>
			{:else}
				<Button
					style="width: 4rem;"
					bg="var(--accent2)"
					color="var(--accent2-text)"
					on:click={() => {
						emulator.setCode(project.code)
					}}
				>
					Stop
				</Button>
				<Button
					style="width: 4rem;"
					disabled={$emulator.numOfLines <= $emulator.line}
					on:click={() => {
						try{
							emulator.step()
						}catch(e){
							toast.error("Error executing code")
						}
					}}
				>
					Step
				</Button>
				<Button
					style="width: 4rem;"
					disabled={$emulator.line <= 1}
					on:click={() => {
						try{
							emulator.undo()
						}catch(e){
							toast.error("Error executing code")
						}
					}}
				>
					Undo
				</Button>
			{/if}
		</div>
	</div>
	<div class="right-side">
		<ErrorVisualiser errors={$emulator.errors} />

		<div class="registers-wrapper">
			<MemoryVisualiser registers={$emulator.registers} />
		</div>
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
			h1 {
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

		.editor-wrapper {
			flex-direction: column;
			.editor-corners {
				display: flex;
				overflow: hidden;
				flex: 1;
				border-radius: 0.5rem;
				box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
			}
		}
		.registers-wrapper {
			border-radius: 0.5rem;
			flex-direction: column;
			align-items: center;
			margin-top: 1rem;
		}
	}
	.right-side {
		margin-left: 1rem;
	}
	@media screen and (max-width: 700px) {
		.editor-wrapper {
			height: 60vh;
		}
		.editor-registers-wrapper {
			grid-template-columns: 1fr;
		}
		.registers-wrapper {
			margin-top: 1rem;
		}
		.right-side {
			margin: 0;
			margin-top: 1rem;
			margin-bottom: 1rem;
		}
	}
	.project-controls {
		margin-top: 1rem;
		display: flex;
		gap: 0.5rem;
	}
</style>
