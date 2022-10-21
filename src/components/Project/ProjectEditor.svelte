<script lang="ts">
	import Editor from '$cmp/Editor.svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import { M68KEmulator } from '$lib/M68KEmulator'
	import { MIPSEmulator } from '$lib/MIPSEmulator'
	import MemoryVisualiser from '$cmp/MemoryVisualiser.svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import { createEventDispatcher } from 'svelte'
	import type { Project } from '$lib/Project'
	import FaSave from 'svelte-icons/fa/FaSave.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import { goto } from '$app/navigation'
	import { Prompt } from '$cmp/prompt'
	import { toast } from '$cmp/toast'
	import Controls from './Controls.svelte'
	import StdOut from '$cmp/StdOut.svelte'
	import { clamp } from '$lib/utils'
	import { MEMORY_SIZE, PAGE_SIZE } from '$lib/Config'

	export let project: Project
	const saveDispatch = createEventDispatcher<{ save: Project }>()
	const emulator =
		project.language === 'M68K'
			? M68KEmulator(project.code || '')
			: MIPSEmulator(project.code || '')

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

<div class="editor-memory-wrapper">
	<div class="editor-wrapper">
		<div
			class="editor-border"
			class:gradientBorder={$emulator.line >= 0}
			class:redBorder={$emulator.errors.length > 0}
		>
			<Editor
				on:change={(d) => {
					emulator.setCode(d.detail)
				}}
				errors={$emulator.compilerErrors}
				bind:code={project.code}
				language={project.language}
				highlightedLine={$emulator.line}
				disabled={$emulator.line >= 0}
				hasError={$emulator.errors.length > 0}
			/>
		</div>
		<Controls
			terminated={$emulator.terminated}
			disabled={$emulator.compilerErrors.length > 0}
			line={$emulator.line}
			on:run={async () => {
				try {
					emulator.setCode(project.code)
					await emulator.compile()
					emulator.run()
				} catch (e) {
					console.error(e)
					toast.error('Error executing code. ' + e.message)
				}
			}}
			on:build={async () => {
				try {
					emulator.setCode(project.code)
					await emulator.compile()
					emulator.step()
				} catch (e) {
					console.error(e)
					toast.error('Error executing code. ' + e.message)
				}
			}}
			on:step={() => {
				try {
					emulator.step()
				} catch (e) {
					console.error(e)
					toast.error('Error executing code. ' + e.message)
				}
			}}
			on:stop={() => emulator.clear()}
			on:undo={() => {
				try {
					//emulator.undo()
				} catch (e) {
					console.error(e)
					toast.error('Error executing code. ' + e.message)
				}
			}}
		/>
	</div>
	<div class="right-side">
		<div class="memory-wrapper">
			<MemoryVisualiser
				registers={$emulator.registers}
				statusCodes={$emulator.statusRegister}
				memory={$emulator.currentMemoryPage}
				currentAddress={$emulator.currentMemoryAddress}
				sp={$emulator.sp}
				on:registerClick={(e) => {
					const value = e.detail.value
					const clampedSize = value - (value % PAGE_SIZE)
					emulator.setCurrentMemoryAddress(clamp(clampedSize, 0, MEMORY_SIZE))
				}}
				on:addressChange={(e) => {
					emulator.setCurrentMemoryAddress(e.detail)
				}}
			/>
		</div>
		<StdOut
			stdOut={`${$emulator.errors.join('\n')}\n ${$emulator.stdOut}`}
			compilerErrors={$emulator.compilerErrors}
		/>
	</div>
</div>

<style lang="scss">
	.project-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.4rem;

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

	.editor-memory-wrapper {
		display: flex;
		flex: 1;
		.editor-wrapper,
		.memory-wrapper {
			display: flex;
			overflow: hidden;
		}

		.editor-wrapper {
			flex-direction: column;
			flex: 1;
			@media screen and (max-width: 1000px) {
				min-height: 70vh;
			}
			.editor-border {
				position: relative;
				display: flex;
				overflow: hidden;
				flex: 1;
				padding: 0.2rem;
				border-radius: 0.5rem;
			}
		}
		.memory-wrapper {
			@media screen and (max-width: 1000px) {
				margin-top: 1rem;
				overflow-x: auto;
				width: 100%;
			}
		}
		@media screen and (max-width: 1000px) {
			flex-direction: column;
		}
	}
	.right-side {
		margin-left: 0.5rem;
		width: min-content;
		padding-top: 0.2rem;
		display: flex;
		overflow-y: auto;
		flex-direction: column;
	}
	@media screen and (max-width: 1000px) {
		.editor-memory-wrapper {
			grid-template-columns: 1fr;
		}
		.right-side {
			margin: 0;
			padding: 0.2rem;
			margin-top: 1rem;
			width: unset;
			max-height: unset;
			align-items: center;
			flex-direction: column-reverse;
		}
	}

	.gradientBorder {
		--border-width: 3px;
		position: relative;
		&::before {
			position: absolute;
			content: '';
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
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
			border-radius: calc(2 * var(--border-width));
			animation: moveGradient 5s alternate infinite, appear 0.3s ease-in;
		}

		@keyframes appear {
			from {
				opacity: 0;
			}
			to {
				opacity: 1;
			}
		}
		@keyframes moveGradient {
			50% {
				background-position: 100% 50%;
			}
		}
	}
	.redBorder {
		&::before {
			background: linear-gradient(60deg, hsl(359, 85%, 66%), hsl(0, 85%, 66%));
		}
	}
</style>
