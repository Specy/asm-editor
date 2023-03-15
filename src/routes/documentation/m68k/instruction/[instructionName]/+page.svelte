<script lang="ts">
	import type { PageData } from './$types'
	import Page from '$cmp/layout/Page.svelte'
	import Editor from '$cmp/project/Editor.svelte'
	import Navbar from '$cmp/Navbar.svelte'
	import {
		fromSizesToString,
		fromSizeToString,
		getAddressingModeNames,
		type InstructionDocumentation
	} from '$lib/languages/M68K-documentation'
	import DocsOperand from '$cmp/project/DocsOperand.svelte'
	export let data: PageData
	let ins: InstructionDocumentation = data.props.instruction
	import { M68KEmulator } from '$lib/languages/M68KEmulator'
	import { toast } from '$stores/toastStore'
	import Controls from '$cmp/project/Controls.svelte'
	import { clamp, getErrorMessage } from '$lib/utils'
	import { settingsStore } from '$stores/settingsStore'
	import type monaco from 'monaco-editor'
	import MemoryControls from '$cmp/project/MemoryControls.svelte'
	import MemoryVisualiser from '$cmp/project/MemoryVisualiser.svelte'
	import { MEMORY_SIZE } from '$lib/Config'
	import StatusCodesVisualiser from '$cmp/project/StatusCodesVisualiser.svelte'
	import RegistersVisualiser from '$cmp/project/RegistersVisualiser.svelte'
	import SizeSelector from '$cmp/project/SizeSelector.svelte'
	import { browser } from '$app/environment'
	let editor: monaco.editor.IStandaloneCodeEditor
	let running = false
	let code = (ins.interactiveExample?.code ?? '; no interactive instruction available')
	let memoryAddress = 0x1000
	let groupSize = 2
	const emulator = M68KEmulator(code, {
		globalPageElementsPerRow: 4,
		globalPageSize: 4 * 8
	})
</script>

<Navbar>
	<div class="row" style="gap: 2rem; align-items:center;">
		<a class="icon" href="/" title="Go to the home">
			<img src="/favicon.png" alt="logo" />
			Home
		</a>
		<a href="/documentation/m68k"> M68k Documentation </a>
	</div>
</Navbar>
<Page cropped>
	<div class="instruction-info" style="flex: 1;">
		<div class="column">
			<div class="instruction-name">
				{ins.name}
			</div>
			<div class="column" style="margin-left: 0.8rem;">
				{#if ins.sizes.length}
					<h3>Sizes</h3>
					<div style="margin: 0.8rem">
						{fromSizesToString(ins.sizes, true)}
					</div>
				{/if}
				{#if ins.defaultSize}
					<h3>Default Size</h3>
					<div style="margin: 0.8rem">
						{fromSizeToString(ins.defaultSize, true)}
					</div>
				{/if}
			</div>
		</div>

		<div class="column" style="gap: 1rem;">
			<div class="column">
				<h3>Operands</h3>
				<div class="column" style="gap: 0.5rem; margin: 0.8rem;">
					{#if ins.args.length}
						{#each ins.args as arg, i}
							<DocsOperand
								name={`Op ${i + 1}`}
								content={getAddressingModeNames(arg)}
								style="width: fit-content;"
							/>
						{/each}
					{/if}
				</div>
			</div>
			<div class="description">
				{ins.description}
			</div>
		</div>
	</div>
	<div class="editor-wrapper" style="gap: 1rem">
		<div class="column editor">
			<div
				class="editor-border"
				class:gradientBorder={$emulator.canExecute}
				class:redBorder={$emulator.errors.length > 0}
			>
				<Editor
					on:change={(d) => {
						emulator.setCode(d.detail)
					}}
					on:breakpointPress={(d) => {
						emulator.toggleBreakpoint(d.detail - 1)
					}}
					bind:editor
					bind:code
					breakpoints={$emulator.breakpoints}
					errors={$emulator.compilerErrors}
					language={'M68K'}
					highlightedLine={$emulator.line}
					disabled={$emulator.canExecute}
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
						emulator.setCode(code)
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
		<div class="column" style="width: 17rem;">
			{#if browser}
				<div class="row">
					<SizeSelector bind:selected={groupSize} style="flex:1" />
					<StatusCodesVisualiser statusCodes={$emulator.statusRegister} style="flex:1" />
				</div>
				<RegistersVisualiser
					size={groupSize}
					style="display: grid; grid-template-columns: repeat(4, min-content); gap: 0.4rem; justify-content: space-between"
					registers={$emulator.registers}
					on:registerClick={async (e) => {
						const value = e.detail.value
						const clampedSize = value - (value % $emulator.memory.global.pageSize)
						emulator.setGlobalMemoryAddress(clamp(clampedSize, 0, MEMORY_SIZE))
					}}
				/>
			{/if}
		</div>
		<div class="row">
			<div class="column">
				<MemoryControls
					bytesPerPage={8 * 8}
					memorySize={MEMORY_SIZE}
					currentAddress={memoryAddress}
					inputStyle="width: 6rem"
					on:addressChange={async (e) => {
						memoryAddress = e.detail
						emulator.setGlobalMemoryAddress(e.detail)
					}}
					hideLabel
				/>
				<MemoryVisualiser
					bytesPerRow={4}
					pageSize={4 * 4}
					memory={$emulator.memory.global.data}
					currentAddress={$emulator.memory.global.address}
					sp={$emulator.sp}
				/>
			</div>
		</div>
	</div>
</Page>

<style lang="scss">
	.editor-wrapper {
		display: flex;
		gap: 1rem;
	}
	.instruction-info {
		display: flex;
		gap: 1rem;
	}
	.instruction-name {
		font-size: 4rem;
		margin-right: 3rem;
		font-weight: 600;
		color: var(--accent);
		margin-bottom: 1rem;
	}
	.description {
		font-size: 1.1rem;
		line-height: 1.4rem;
		background-color: var(--secondary);
		color: var(--secondary-text);
		padding: 1rem;
		width: 100%;
		border-radius: 0.6rem;
	}
	.editor {
		height: 100%;
		flex: 1;
	}
	@media (max-width: 800px) {
		.editor-wrapper {
			flex-direction: column;
		}
		.editor {
			height: 15rem;
			flex: unset;
		}
		.instruction-info {
			flex-direction: column;
		}
	}
	.icon {
		height: 2.2rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		img {
			height: 100%;
		}
	}
	.editor-border {
		position: relative;
		display: flex;
		overflow: hidden;
		flex: 1;
		padding: 0.2rem;
		border-radius: 0.5rem;
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
