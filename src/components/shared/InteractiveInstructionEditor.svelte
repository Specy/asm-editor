<script lang="ts">
    import Editor from '$cmp/specific/project/Editor.svelte'
    import { M68KEmulator } from '$lib/languages/M68KEmulator'
    import { toast } from '$stores/toastStore'
    import Controls from '$cmp/specific/project/Controls.svelte'
    import { clamp } from '$lib/utils'
    import { settingsStore } from '$stores/settingsStore'
    import type monaco from 'monaco-editor'
    import MemoryControls from '$cmp/specific/project/memory/MemoryControls.svelte'
    import MemoryVisualiser from '$cmp/specific/project/memory/MemoryRenderer.svelte'
    import { MEMORY_SIZE } from '$lib/Config'
    import StatusCodesVisualiser from '$cmp/specific/project/cpu/StatusCodesRenderer.svelte'
    import RegistersVisualiser from '$cmp/specific/project/cpu/RegistersRenderer.svelte'
    import SizeSelector from '$cmp/specific/project/cpu/SizeSelector.svelte'
    import { onMount } from 'svelte'
    import { getM68kErrorMessage } from '$lib/languages/M68kUtils'

    let editor: monaco.editor.IStandaloneCodeEditor
    let running = false
    export let code: string
    export let instructionKey: string
    export let showMemory = true
    let memoryAddress = 0x1000
    let groupSize = 2
    const emulator = M68KEmulator(code, {
        globalPageElementsPerRow: 4,
        globalPageSize: 4 * 8
    })

    onMount(() => {
        return () => {
            emulator.dispose()
        }
    })
    $: if (instructionKey) {
        emulator.clear()
        running = false
    }
    $: emulator.setCode(code)
</script>

<div class="editor-wrapper" style="gap: 0.5rem">
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
				language={"M68K"}
				highlightedLine={$emulator.line}
				disabled={$emulator.canExecute && !$emulator.terminated}
				hasError={$emulator.errors.length > 0}
			/>
		</div>

		<Controls
			{running}
			hasTests={false}
			canEditTests={false}
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
						toast.error('Error executing code. ' + getM68kErrorMessage(e))
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
					toast.error('Error compiling code. ' + getM68kErrorMessage(e))
				}
			}}
			on:step={() => {
				try {
					emulator.step()
				} catch (e) {
					console.error(e)
					toast.error('Error executing code. ' + getM68kErrorMessage(e))
				}
			}}
			on:undo={() => {
				try {
					emulator.undo()
				} catch (e) {
					console.error(e)
					toast.error('Error executing undo ' + getM68kErrorMessage(e))
				}
			}}
			on:stop={() => {
				emulator.clear()
				running = false
			}}
		/>
	</div>
	<div class="column data-registers-wrapper">
		<div class="data-cpu-status-wrapper">
			<StatusCodesVisualiser statusCodes={$emulator.statusRegister} style="flex:1" />
			<SizeSelector bind:selected={groupSize} style="flex:1" />
		</div>
		<RegistersVisualiser
			size={groupSize}
			gridStyle="grid-auto-flow: column; grid-template-rows: repeat(8, 1fr); gap: 0.1rem; height: 100%; justify-content: space-evenly;"
			registers={$emulator.registers}
			on:registerClick={async (e) => {
						const value = e.detail.value
						const clampedSize = value - (value % $emulator.memory.global.pageSize)
						emulator.setGlobalMemoryAddress(clamp(clampedSize, 0, MEMORY_SIZE))
					}}
		/>
	</div>
	{#if showMemory}
		<div class="column code-data-memory-controls">
			<MemoryControls
				bytesPerPage={4 * 8}
				memorySize={MEMORY_SIZE}
				currentAddress={memoryAddress}
				style="flex: unset"
				inputStyle="width: 6rem; height: 3rem"
				on:addressChange={async (e) => {
						memoryAddress = e.detail
						emulator.setGlobalMemoryAddress(e.detail)
					}}
				hideLabel
			/>
			<MemoryVisualiser
				style="height: 100%; flex: 1;"
				bytesPerRow={4}
				pageSize={4 * 8}
				memory={$emulator.memory.global.data}
				currentAddress={$emulator.memory.global.address}
				sp={$emulator.sp}
			/>
		</div>
	{/if}
</div>

<style lang="scss">
  .editor-wrapper {
    justify-content: center;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .editor {
    min-height: 15rem;
    min-width: min(100%, 25rem);
    flex: 1;
    gap: 0.5rem;
  }

  .show-only-mobile {
    display: none;
  }

  .show-only-desktop {
    display: flex;
  }

  .data-registers-wrapper {
    max-width: 17rem;
    min-width: 17rem;
    width: 17rem;
    gap: 0.5rem;
    flex: 1;
  }

  .data-cpu-status-wrapper {
    width: 17rem;
    display: flex;
    gap: 0.5rem;
  }

  .code-data-memory-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  @media (max-width: 940px) {
    .code-data-memory-controls {
      flex: 1;
    }
  }

  @media (max-width: 720px) {
    .data-registers-wrapper {
      flex: 1;
      max-width: unset;
      width: unset;
    }
    .data-cpu-status-wrapper {
      width: unset;
    }
  }

  .editor-border {
    position: relative;
    display: flex;
    flex: 1;
    padding: 0.2rem;
    border-radius: 0.5rem;
    margin: -0.2rem;
  }

  .gradientBorder, .redBorder {
    position: relative;

    &::before {
      position: absolute;
      content: '';
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-size: 300% 300%;
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
      ) 0 50%;
      border-radius: 0.5rem;
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
