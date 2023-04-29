<script lang="ts">
	import Editor from '$cmp/project/Editor.svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import { M68KEmulator } from '$lib/languages/M68KEmulator'
	import MemoryVisualiser from '$cmp/project/MemoryVisualiser.svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import { createEventDispatcher, onMount } from 'svelte'
	import FaKeyboard from 'svelte-icons/fa/FaKeyboard.svelte'
	import type { Project } from '$lib/Project'
	import FaSave from 'svelte-icons/fa/FaSave.svelte'
	import FaCog from 'svelte-icons/fa/FaCog.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import { toast } from '$stores/toastStore'
	import Controls from './Controls.svelte'
	import StdOut from '$cmp/project/StdOut.svelte'
	import { clamp, createDebouncer, getErrorMessage } from '$lib/utils'
	import { MEMORY_SIZE } from '$lib/Config'
	import Settings from './Settings.svelte'
	import M68KDocumentation from '$cmp/documentation/m68k/FloatingM68KDocumentation.svelte'
	import FaBook from 'svelte-icons/fa/FaBook.svelte'
	import { ShortcutAction, shortcutsStore } from '$stores/shortcutsStore'
	import RegistersVisualiser from './RegistersVisualiser.svelte'
	import StatusCodesVisualiser from './StatusCodesVisualiser.svelte'
	import MemoryControls from './MemoryControls.svelte'
	export let project: Project
	import MemoryTab from './MemoryTab.svelte'
	import ShortcutEditor from '$cmp/project/ShortcutEditor.svelte'
	import SizeSelector from './SizeSelector.svelte'
	import { Size } from 's68k'
	import { settingsStore } from '$stores/settingsStore'
	import type monaco from 'monaco-editor'
	import ToggleableDraggable from '$cmp/ToggleableDraggable.svelte'
	import CallStack from './CallStack.svelte'
	import MutationsViewer from './MutationsViewer.svelte'
	import ButtonLink from '$cmp/buttons/ButtonLink.svelte'
	import FaDonate from 'svelte-icons/fa/FaDonate.svelte'
	let editor: monaco.editor.IStandaloneCodeEditor
	let running = false
	let settingsVisible = false
	let documentationVisible = false
	let shortcutsVisible = false
	let groupSize = Size.Word
	let errorStrings = ""
	const dispatcher = createEventDispatcher<{
		save: {
			silent: boolean
			data: Project
		}
		wantsToLeave: void
	}>()
	const emulator = M68KEmulator(project.code || '')
	const pressedKeys = new Map<String, boolean>()
	const [debounced] = createDebouncer(3000)
	function handleKeyDown(e: KeyboardEvent) {
		pressedKeys.set(e.code, true)
		const code = Array.from(pressedKeys.keys()).join('+')
		const shortcut = shortcutsStore.get(code)
		if (e.repeat && shortcut?.type !== ShortcutAction.Step) return
		if (
			//@ts-ignore ignore all events coming from the editor and inputs
			e.target.tagName === 'INPUT' ||
			//@ts-ignore ignore all events coming from the editor and inputs
			e.composedPath().some((el) => el?.className?.includes('monaco-editor'))
		) {
			//@ts-ignore if escape, then blur the editor
			if (e.code === 'Escape') e.target?.blur()
			return
		}
		switch (shortcut?.type) {
			case ShortcutAction.ToggleDocs: {
				documentationVisible = !documentationVisible
				break
			}
			case ShortcutAction.ToggleSettings: {
				settingsVisible = !settingsVisible
			}
			case ShortcutAction.BuildCode: {
				emulator.setCode(project.code)
				emulator.compile($settingsStore.values.maxHistorySize.value)
				break
			}
			case ShortcutAction.RunCode: {
				if ($emulator.terminated || $emulator.interrupt !== undefined || !$emulator.canExecute)
					break
				emulator.run($settingsStore.values.instructionsLimit.value)
				break
			}
			case ShortcutAction.SaveCode: {
				dispatcher('save', {
					silent: false,
					data: project
				})
				break
			}
			case ShortcutAction.ClearExecution: {
				emulator.clear()
				break
			}
			case ShortcutAction.Step: {
				if ($emulator.terminated || $emulator.interrupt !== undefined || !$emulator.canExecute)
					break
				emulator.step()
				break
			}
			case ShortcutAction.Undo: {
				if (
					$emulator.terminated ||
					$emulator.interrupt !== undefined ||
					!$emulator.canExecute ||
					!$emulator.canUndo
				)
					break
				emulator.undo()
				break
			}
		}
	}

	function handleKeyUp(e: KeyboardEvent) {
		pressedKeys.delete(e.code)
	}
	function clearPressed() {
		pressedKeys.clear()
	}
	onMount(() => {
		window.addEventListener('keydown', handleKeyDown)
		window.addEventListener('keyup', handleKeyUp)
		window.addEventListener('blur', clearPressed)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
			window.removeEventListener('keyup', handleKeyUp)
			window.removeEventListener('blur', clearPressed)
		}
	})
	$: errorStrings = $emulator.errors.join('\n')
</script>

<header class="project-header">
	<a
		href="/projects"
		title="Go back to your projects"
		on:click={(e) => {
			e.preventDefault()
			dispatcher('wantsToLeave')
		}}
	>
		<Icon size={2}>
			<FaAngleLeft />
		</Icon>
	</a>
	<h1 style="font-size: 1.6rem; margin-left: 0.4rem" class="ellipsis">{project.name}</h1>
	<div class="row" style="gap: 0.5rem; margin-left: auto;">
		<ButtonLink
			href="/donate"
			cssVar="accent2"
			style="padding:0; width:2.2rem; height:2.2rem"
			hasIcon
		>
			<Icon>
				<FaDonate />
			</Icon>
		</ButtonLink>
		<Button
			on:click={() => {
				shortcutsVisible = !shortcutsVisible
				documentationVisible = false
				settingsVisible = false
			}}
			hasIcon
			cssVar="accent2"
			style="padding:0; width:2.2rem; height:2.2rem"
		>
			<Icon>
				<FaKeyboard />
			</Icon>
		</Button>
		<Button
			on:click={() => {
				documentationVisible = !documentationVisible
				settingsVisible = false
				shortcutsVisible = false
			}}
			hasIcon
			cssVar="accent2"
			style="padding:0; width:2.2rem; height:2.2rem"
		>
			<Icon>
				<FaBook />
			</Icon>
		</Button>
		<Button
			on:click={() => {
				settingsVisible = !settingsVisible
				documentationVisible = false
				shortcutsVisible = false
			}}
			hasIcon
			cssVar="accent2"
			style="padding:0; width:2.2rem; height:2.2rem"
		>
			<Icon>
				<FaCog />
			</Icon>
		</Button>
		<Button
			on:click={() => {
				emulator.setCode(project.code)
				dispatcher('save', {
					silent: false,
					data: project
				})
			}}
			cssVar="accent2"
			hasIcon
			style="padding:0; width:2.2rem; height:2.2rem"
		>
			<Icon>
				<FaSave />
			</Icon>
		</Button>
	</div>
	<ShortcutEditor bind:visible={shortcutsVisible} />
	<Settings bind:visible={settingsVisible} />
	<M68KDocumentation bind:visible={documentationVisible} />
</header>

<ToggleableDraggable title="Call stack" left={300}>
	<CallStack
		stack={$emulator.callStack}
		on:gotoLabel={(e) => {
			const label = e.detail
			editor.revealLineInCenter(label.line + 1)
			editor.setPosition({ lineNumber: label.line + 1, column: 1 })
		}}
	/>
</ToggleableDraggable>

{#each $emulator.memory.tabs as tab}
	<MemoryTab
		{tab}
		left={500}
		sp={$emulator.sp}
		on:addressChange={(e) => {
			const { tab, address } = e.detail
			emulator.setTabMemoryAddress(address, tab.id)
		}}
	/>
{/each}
<ToggleableDraggable title="History" left={700}>
	<MutationsViewer
		on:undo={(e) => {
			const amount = e.detail
			emulator.undo(amount)
		}}
		on:highlight={(e) => {
			const line = e.detail
			editor.revealLineInCenter(line + 1)
			editor.setPosition({ lineNumber: line + 1, column: 0 })
		}}
		steps={$emulator.latestSteps}
	/>
</ToggleableDraggable>
<div class="editor-memory-wrapper">
	<div class="editor-wrapper">
		<div
			class="editor-border"
			class:gradientBorder={$emulator.canExecute}
			class:redBorder={$emulator.errors.length > 0}
		>
			<Editor
				on:change={(d) => {
					emulator.setCode(d.detail)
					if ($settingsStore.values.autoSave.value) {
						debounced(() => {
							dispatcher('save', {
								silent: true,
								data: project
							})
						})
					}
				}}
				on:breakpointPress={(d) => {
					emulator.toggleBreakpoint(d.detail - 1)
				}}
				bind:editor
				bind:code={project.code}
				breakpoints={$emulator.breakpoints}
				errors={$emulator.compilerErrors}
				language={project.language}
				highlightedLine={$emulator.line}
				disabled={$emulator.canExecute }
				hasError={$emulator.errors.length > 0}
			/>
		</div>

		<Controls
			{running}
			executionDisabled={$emulator.terminated || $emulator.interrupt !== undefined}
			buildDisabled={$emulator.compilerErrors.length > 0}
			hasCompiled={$emulator.canExecute}
			canUndo={$emulator.canUndo}
			on:run={async () => {
				running = true
				setTimeout(() => {
					try {
						emulator.run($settingsStore.values.instructionsLimit.value)
						running = false
					} catch (e) {
						console.error(e)
						running = false
						toast.error('Error executing code. ' + getErrorMessage(e))
					}
				}, 50)
			}}
			on:build={async () => {
				try {
					running = false
					emulator.setCode(project.code)
					await emulator.compile($settingsStore.values.maxHistorySize.value)
				} catch (e) {
					console.error(e)
					toast.error('Error compiling code. ' + getErrorMessage(e))
				}
			}}
			on:step={() => {
				try {
					emulator.step()
				} catch (e) {
					console.error(e)
					toast.error('Error executing code. ' + getErrorMessage(e))
				}
			}}
			on:undo={() => {
				try {
					emulator.undo()
				} catch (e) {
					console.error(e)
					toast.error('Error executing undo ' + getErrorMessage(e))
				}
			}}
			on:stop={() => {
				emulator.clear()
				running = false
			}}
		/>
	</div>
	<div class="right-side">
		<div class="memory-wrapper">
			<div class="column" style="margin-right: 0.5rem;">
				<StatusCodesVisualiser statusCodes={$emulator.statusRegister} />
				<RegistersVisualiser
					size={groupSize}
					registers={$emulator.registers}
					on:registerClick={async (e) => {
						const value = e.detail.value
						const clampedSize = value - (value % $emulator.memory.global.pageSize)
						emulator.setGlobalMemoryAddress(clamp(clampedSize, 0, MEMORY_SIZE))
					}}
				/>
			</div>

			<div class="column">
				<div class="row">
					<SizeSelector bind:selected={groupSize} />
					<MemoryControls
						bytesPerPage={$emulator.memory.global.pageSize}
						memorySize={MEMORY_SIZE}
						inputStyle="height: 100%"
						currentAddress={$emulator.memory.global.address}
						on:addressChange={async (e) => {
							emulator.setGlobalMemoryAddress(e.detail)
						}}
					/>
				</div>

				<MemoryVisualiser
					bytesPerRow={$emulator.memory.global.rowSize}
					pageSize={$emulator.memory.global.pageSize}
					memory={$emulator.memory.global.data}
					currentAddress={$emulator.memory.global.address}
					sp={$emulator.sp}
				/>
			</div>
		</div>
		<StdOut
			stdOut={errorStrings ? `${errorStrings}\n${$emulator.stdOut}`: $emulator.stdOut}
			compilerErrors={$emulator.compilerErrors}
		/>
	</div>
</div>

<style lang="scss">
	.project-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.4rem;
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
		max-height: calc(100vh - 4.2rem);
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
