<script lang="ts">
    import Editor from '$cmp/specific/project/Editor.svelte'
    import { toast } from '$stores/toastStore'
    import Controls from '$cmp/specific/project/Controls.svelte'
    import { clamp, formatTime } from '$lib/utils'
    import { settingsStore } from '$stores/settingsStore.svelte'
    import MemoryControls from '$cmp/specific/project/memory/MemoryControls.svelte'
    import MemoryVisualiser from '$cmp/specific/project/memory/MemoryRenderer.svelte'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE } from '$lib/Config'
    import StatusCodesVisualiser from '$cmp/specific/project/cpu/StatusCodesRenderer.svelte'
    import RegistersVisualiser from '$cmp/specific/project/cpu/RegistersRenderer.svelte'
    import SizeSelector from '$cmp/specific/project/cpu/SizeSelector.svelte'
    import { onMount } from 'svelte'
    import { getM68kErrorMessage } from '$lib/languages/M68K/M68kUtils'
    import type { AvailableLanguages, Testcase, TestcaseResult } from '$lib/Project.svelte'
    import { type Emulator } from '$lib/languages/Emulator'
    import Column from './layout/Column.svelte'
    import StdOutRenderer from '$cmp/specific/project/user-tools/StdOutRenderer.svelte'
    import TestcasesEditor from '$cmp/specific/project/testcases/TestcasesEditor.svelte'
    import Row from './layout/Row.svelte'
    import { makeColorizedLabels } from '$lib/languages/commonLanguageFeatures.svelte'

    /*TODO make this agnostic */

    let running = $state(false)

    interface Props {
        code: string
        testcases?: Testcase[]
        showMemory?: boolean
        showConsole?: boolean
        showTestcases?: boolean
        embedded?: boolean
        language?: AvailableLanguages
        emulator: Emulator
    }

    let {
        code = $bindable(),
        showMemory = true,
        language,
        showConsole,
        showTestcases,
        testcases = $bindable([]),
        embedded,
        emulator = $bindable()
    }: Props = $props()
    let memoryAddress = $state(0x1000)
    let groupSize = $state(2)
    let testcasesVisible = $state(false)
    let testcasesResult: TestcaseResult[] = $state([])

    $effect(() => {
        emulator.setCode(code)
    })

    onMount(() => {
        return () => {
            emulator.dispose()
        }
    })

    let errorStrings = $derived(emulator.errors.join('\n'))
    let info = $derived(
        emulator.terminated && emulator.executionTime >= 0
            ? `Ran in ${formatTime(emulator.executionTime)}`
            : ''
    )
</script>

<div class="editor-wrapper" style="gap: 0.5rem">
	<div class="column editor">
		<div
			class="editor-border"
			class:gradientBorder={emulator.canExecute}
			class:redBorder={emulator.errors.length > 0}
		>
			<Editor
				on:breakpointPress={(d) => {
                    emulator.toggleBreakpoint(d.detail - 1)
                }}
				bind:code
				codeOverride={emulator.compiledCode}
				breakpoints={emulator.breakpoints}
				errors={emulator.compilerErrors}
				{language}
				highlightedLine={emulator.line}
				disabled={emulator.canExecute && !emulator.terminated || !!emulator.compiledCode}
				hasError={emulator.errors.length > 0}
			/>
		</div>

		<Controls
			{running}
			hasTests={testcases.length > 0}
			canEditTests={showTestcases}
			hasErrorsInTests={testcasesResult.some((r) => !r.passed)}
			hasNoErrorsInTests={testcasesResult.every((r) => r.passed) &&
                testcasesResult.length > 0}
			executionDisabled={emulator.terminated || emulator.interrupt !== undefined}
			buildDisabled={emulator.compilerErrors.length > 0}
			hasCompiled={emulator.canExecute || !!emulator.compiledCode}
			canUndo={emulator.canUndo}
			on:edit-tests={() => {
                testcasesVisible = !testcasesVisible
            }}
			on:test={async () => {
                running = true
                setTimeout(async () => {
                    try {
                        testcasesResult = await emulator.test(
                            code,
                            testcases,
                            settingsStore.values.instructionsLimit.value,
                            settingsStore.values.maxHistorySize.value
                        )
                        running = false
                    } catch (e) {
                        console.error(e)
                        running = false
                        toast.error('Error executing tests. ' + getM68kErrorMessage(e))
                    }
                }, 50)
            }}
			on:run={async () => {
                running = true
                setTimeout(() => {
                    try {
                        emulator.run(settingsStore.values.instructionsLimit.value)
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
                    await emulator.compile(settingsStore.values.maxHistorySize.value)
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
	<Column>
		<Row wrap gap="0.5rem" flex1>
			<div class="column data-registers-wrapper">
				<div class="data-cpu-status-wrapper">
					{#if emulator.statusRegisters?.length > 0}
						<StatusCodesVisualiser
							statusCodes={emulator.statusRegisters}
							style="flex:1"
						/>
					{/if}
					<SizeSelector bind:selected={groupSize} style="flex:1" />
				</div>
				<RegistersVisualiser
					size={groupSize}
					hiddenRegistersNames={emulator.hiddenRegisters}
					gridStyle="
                grid-template-columns: min-content 1fr min-content 1fr; 
                gap: 0.1rem; 
                height: 100%; 
                justify-content: space-evenly;
                "
					style={`max-height: ${embedded ? 'calc(100vh - 7.2rem)' : '16.3rem'}; min-height: 11.5rem;`}
					registers={emulator.registers}
					on:registerClick={async (e) => {
                        const value = e.detail.value
                        const clampedSize = value - (value % emulator.memory.global.pageSize)
                        emulator.setGlobalMemoryAddress(clamp(clampedSize, 0, MEMORY_SIZE['M68K']))
                    }}
				/>
			</div>
			{#if showMemory}
				<div class="column code-data-memory-controls">
					<MemoryControls
						bytesPerPage={4 * 8}
						memorySize={MEMORY_SIZE[language]}
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
						endianess={emulator.memory.global.endianess}
						defaultMemoryValue={DEFAULT_MEMORY_VALUE[language]}
						style="height: 100%; flex: 1;"
						bytesPerRow={4}
						pageSize={4 * 8}
						memory={emulator.memory.global.data}
						currentAddress={emulator.memory.global.address}
						sp={emulator.sp}
						callStackAddresses={makeColorizedLabels(emulator.callStack)}
					/>
				</div>
			{/if}
		</Row>

		{#if showConsole}
			<StdOutRenderer
				{info}
				stdOut={errorStrings ? `${errorStrings}\n${emulator.stdOut}` : emulator.stdOut}
				compilerErrors={emulator.compilerErrors}
			/>
		{/if}
		{#if showTestcases}
			<TestcasesEditor
				editable={!embedded}
				registerNames={emulator.registers.map((r) => r.name)}
				hiddenRegistersNames={emulator.hiddenRegisters}
				bind:visible={testcasesVisible}
				{testcasesResult}
				bind:testcases
			/>
		{/if}
	</Column>
</div>

<style lang="scss">
  .editor-wrapper {
    justify-content: center;
    display: flex;
    flex-wrap: wrap;
    flex: 1;
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
    --width: 18rem;
    max-width: var(--width);
    min-width: var(--width);
    width: var(--width);
    gap: 0.5rem;
    flex: 1;
  }

  .data-cpu-status-wrapper {
    width: var(--width);
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

  .gradientBorder,
  .redBorder {
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
      animation: moveGradient 5s alternate infinite,
      appear 0.3s ease-in;
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
