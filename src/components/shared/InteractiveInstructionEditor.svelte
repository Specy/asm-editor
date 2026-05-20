<script lang="ts">
    import Editor from '$cmp/specific/project/Editor.svelte'
    import { toast } from '$stores/toastStore'
    import Controls from '$cmp/specific/project/Controls.svelte'
    import { clampBigInt, formatTime } from '$lib/utils'
    import { settingsStore } from '$stores/settingsStore.svelte'
    import MemoryControls from '$cmp/specific/project/memory/MemoryControls.svelte'
    import MemoryVisualiser from '$cmp/specific/project/memory/MemoryRenderer.svelte'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE } from '$lib/Config'
    import StatusCodesVisualiser from '$cmp/specific/project/cpu/StatusCodesRenderer.svelte'
    import RegistersVisualiser from '$cmp/specific/project/cpu/RegistersRenderer.svelte'
    import { onMount, type Snippet } from 'svelte'
    import { getM68kErrorMessage } from '$lib/languages/M68K/M68kUtils'
    import type { AvailableLanguages, Testcase, TestcaseResult } from '$lib/Project.svelte'
    import { type Emulator } from '$lib/languages/Emulator'
    import StdOutRenderer from '$cmp/specific/project/user-tools/StdOutRenderer.svelte'
    import TestcasesEditor from '$cmp/specific/project/testcases/TestcasesEditor.svelte'
    import type monaco from 'monaco-editor'
    import Card from '$cmp/shared/layout/Card.svelte'
    import {
        makeColorizedLabels,
        makeRegister,
        RegisterSize
    } from '$lib/languages/commonLanguageFeatures.svelte'

    let running = $state(false)
    let building = $state(false)

    type Layout = 'small' | 'fullscreen'

    interface Props {
        code: string
        testcases?: Testcase[]
        showMemory?: boolean
        showConsole?: boolean
        showTestcases?: boolean
        showPc?: boolean
        showRegisters?: boolean
        showFlags?: boolean
        embedded?: boolean
        language?: AvailableLanguages
        emulator: Emulator
        controls?: Snippet
        children?: Snippet
        forceMemoryRight?: boolean
        layout?: Layout
    }

    let {
        code = $bindable(),
        language = 'M68K',
        showMemory: showMemoryProp,
        showFlags: showFlagsProp,
        showRegisters: showRegistersProp,
        showConsole: showConsoleProp,
        showTestcases: showTestcasesProp,
        showPc: showPcProp,
        testcases = $bindable([]),
        embedded = false,
        emulator = $bindable(),
        controls,
        children,
        forceMemoryRight = false,
        layout = 'small'
    }: Props = $props()
    let showMemory = $derived(showMemoryProp ?? true)
    let showFlags = $derived(showFlagsProp ?? true)
    let showRegisters = $derived(showRegistersProp ?? true)
    let showConsole = $derived(showConsoleProp ?? (layout === 'fullscreen'))
    let showTestcases = $derived(showTestcasesProp ?? false)
    let showPc = $derived(showPcProp ?? (layout === 'fullscreen'))
    let groupSize = $state(RegisterSize.Word)
    let testcasesVisible = $state(false)
    let testcasesResult: TestcaseResult[] = $state([])
    let editor: monaco.editor.IStandaloneCodeEditor | undefined = $state()

    $effect(() => {
        emulator.setCode(code)
    })

    onMount(() => {
        return () => {
            emulator.dispose()
        }
    })

    const pc = makeRegister('PC', emulator.pc, emulator.systemSize)

    $effect(() => {
        pc.setValue(emulator.pc)
        pc.setSize(emulator.systemSize)
    })

    let errorStrings = $derived(emulator.errors.join('\n'))
    let info = $derived(
        emulator.terminated && emulator.executionTime >= 0
            ? `Ran in ${formatTime(emulator.executionTime)}`
            : ''
    )
    let sizes = $derived(
        `calc(${[
            showFlags && emulator.statusRegisters?.length > 0 ? '3.5rem' : '0px',
            showConsole ? '4.5rem' : '0px',
            showPc ? '2.25rem' : '0px',
            '1rem'
        ].join(' + ')})`
    )

    let showRegsColumn = $derived(
        showPc || showRegisters || (showFlags && emulator.statusRegisters?.length > 0)
    )

    async function buildCode() {
        if (building || running) return
        try {
            running = false
            building = true
            emulator.setCode(code)
            await emulator.compile(settingsStore.values.maxHistorySize.value, code)
        } catch (e) {
            console.error(e)
            toast.error('Error compiling code. ' + getM68kErrorMessage(e))
        } finally {
            building = false
        }
    }

    function handleRegisterClick(value: bigint) {
        const clampedSize = value - (value % BigInt(emulator.memory.global.pageSize))
        emulator.setGlobalMemoryAddress(clampBigInt(clampedSize, 0n, MEMORY_SIZE[language]))
    }

    function handleEditorChange() {
        if (emulator.canExecute && emulator.terminated && emulator.line >= 0) {
            emulator.resetSelectedLine()
        }
    }

    function goToEditorLine(line: number, column = 1) {
        editor?.revealLineInCenter(line)
        editor?.setPosition({ lineNumber: line, column })
    }
</script>

{#snippet editorSurface()}
    <div
        class="editor-border"
        class:gradientBorder={layout === 'fullscreen'
            ? emulator.canExecute && !emulator.terminated
            : emulator.canExecute}
        class:redBorder={emulator.errors.length > 0}
    >
        <Editor
            on:change={handleEditorChange}
            on:breakpointPress={(d) => {
                emulator.toggleBreakpoint(d.detail - 1)
            }}
            bind:editor
            bind:code
            codeOverride={emulator.compiledCode}
            breakpoints={emulator.breakpoints}
            errors={emulator.compilerErrors}
            {language}
            highlightedLine={emulator.line}
            disabled={(emulator.canExecute && !emulator.terminated) || !!emulator.compiledCode}
            hasError={emulator.errors.length > 0}
        />
    </div>
{/snippet}

{#snippet controlsPanel()}
    <Controls
        children={controls}
        {running}
        {building}
        hasTests={layout === 'fullscreen'
            ? testcases.length > 0
            : testcases.length > 0 && !showTestcases}
        canEditTests={showTestcases}
        hasErrorsInTests={testcasesResult.some((r) => !r.passed)}
        hasNoErrorsInTests={testcasesResult.every((r) => r.passed) && testcasesResult.length > 0}
        executionDisabled={emulator.terminated || emulator.interrupt !== undefined}
        buildDisabled={emulator.compilerErrors.length > 0}
        hasCompiled={emulator.canExecute || !!emulator.compiledCode}
        canUndo={emulator.canUndo}
        on:edit-tests={() => {
            testcasesVisible = !testcasesVisible
        }}
        on:test={async () => {
            if (building || running) return
            running = true
            setTimeout(async () => {
                try {
                    testcasesResult = await emulator.test(
                        $state.snapshot(code),
                        $state.snapshot(testcases),
                        settingsStore.values.instructionsLimit.value,
                        settingsStore.values.maxHistorySize.value
                    )
                } catch (e) {
                    console.error(e)
                    toast.error('Error executing tests. ' + getM68kErrorMessage(e))
                } finally {
                    running = false
                }
            }, 50)
        }}
        on:run={async () => {
            if (building || running) return
            running = true
            if (layout === 'fullscreen') {
                testcasesResult = []
            }
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
            await buildCode()
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
            if (layout === 'fullscreen') {
                testcasesResult = []
            }
        }}
    />
{/snippet}

{#snippet smallRegsColumn()}
    <div class="column data-registers-wrapper">
        {#if showPc}
            <RegistersVisualiser
                systemSize={emulator.systemSize}
                size={emulator.systemSize}
                style="flex: unset; overflow: unset; padding: 0;"
                gridStyle="padding: 0.2rem 0.7rem"
                registers={[pc]}
                withoutHeader
                position="bottom"
            />
        {/if}
        {#if emulator.statusRegisters?.length > 0 && showFlags}
            <div class="data-cpu-status-wrapper">
                <StatusCodesVisualiser
                    statusCodes={emulator.statusRegisters}
                    style="flex:1"
                />
            </div>
        {/if}
        {#if showRegisters}
            <RegistersVisualiser
                systemSize={emulator.systemSize}
                size={groupSize}
                hiddenRegistersNames={emulator.hiddenRegisters}
                gridStyle="
                    grid-template-columns: min-content 1fr min-content 1fr;
                    gap: 0.1rem;
                    height: 100%;
                    justify-content: space-evenly;
                "
                style={`flex: unset; max-height: ${embedded ? `calc(var(--screen-height) - ${sizes})` : '15.85rem'}; min-height: 15.85rem;`}
                registers={emulator.registers}
                on:registerClick={async (e) => {
                    handleRegisterClick(e.detail.value)
                }}
            />
        {/if}
    </div>
{/snippet}

{#snippet smallMemoryPanel()}
    <div class="column code-data-memory-controls">
        <MemoryControls
            systemSize={emulator.systemSize}
            bytesPerPage={emulator.memory.global.pageSize}
            memorySize={MEMORY_SIZE[language]}
            currentAddress={emulator.memory.global.address}
            style="flex: unset"
            inputStyle="width: 6rem; height: 3rem"
            onAddressChange={async (address) => {
                emulator.setGlobalMemoryAddress(address)
            }}
            hideLabel
        />
        <MemoryVisualiser
            systemSize={emulator.systemSize}
            endianess={emulator.memory.global.endianess}
            defaultMemoryValue={DEFAULT_MEMORY_VALUE[language]}
            bytesPerRow={emulator.memory.global.rowSize}
            pageSize={emulator.memory.global.pageSize}
            memory={emulator.memory.global.data}
            currentAddress={emulator.memory.global.address}
            sp={emulator.sp}
            callStackAddresses={makeColorizedLabels(emulator.callStack)}
        />
    </div>
{/snippet}

{#snippet fullscreenRegsColumn()}
    <div class="column fullscreen-registers-column" style="gap: 0.4rem">
        {#if emulator.statusRegisters && emulator.statusRegisters.length > 0 && showFlags}
            <StatusCodesVisualiser statusCodes={emulator.statusRegisters} />
        {/if}
        {#if showPc}
            <RegistersVisualiser
                systemSize={emulator.systemSize}
                style="flex: unset; overflow: unset; padding: 0;"
                gridStyle="padding: 0.2rem 0.7rem"
                size={emulator.systemSize}
                registers={[pc]}
                withoutHeader
                position="bottom"
            />
        {/if}
        {#if showRegisters}
            <RegistersVisualiser
                systemSize={emulator.systemSize}
                size={groupSize}
                style="flex: 1; min-height: 0;"
                hiddenRegistersNames={emulator.hiddenRegisters}
                registers={emulator.registers}
                on:registerClick={async (e) => {
                    handleRegisterClick(e.detail.value)
                }}
            />
        {/if}
    </div>
{/snippet}

{#snippet fullscreenMemoryPanel()}
    <div class="column" style="gap: 0.4rem">
        <div class="row" style="gap: 0.4rem">
            <MemoryControls
                systemSize={emulator.systemSize}
                bytesPerPage={emulator.memory.global.pageSize}
                memorySize={MEMORY_SIZE[language]}
                inputStyle="height: 100%"
                currentAddress={emulator.memory.global.address}
                onAddressChange={(e) => {
                    emulator.setGlobalMemoryAddress(e)
                }}
            />
        </div>
        <MemoryVisualiser
            systemSize={emulator.systemSize}
            endianess={emulator.memory.global.endianess}
            defaultMemoryValue={DEFAULT_MEMORY_VALUE[language]}
            bytesPerRow={emulator.memory.global.rowSize}
            pageSize={emulator.memory.global.pageSize}
            memory={emulator.memory.global.data}
            currentAddress={emulator.memory.global.address}
            sp={emulator.sp}
            callStackAddresses={makeColorizedLabels(emulator.callStack)}
        />
    </div>
{/snippet}

{#snippet consolePanel()}
    <StdOutRenderer
        {info}
        stdOut={errorStrings ? `${errorStrings}\n${emulator.stdOut}` : emulator.stdOut}
        compilerErrors={emulator.compilerErrors}
    />
{/snippet}

{#snippet testcasesEditor()}
    {#if showTestcases}
        <TestcasesEditor
            systemSize={emulator.systemSize}
            editable={!embedded}
            registerNames={emulator.registers.map((r) => r.name)}
            hiddenRegistersNames={emulator.hiddenRegisters}
            bind:visible={testcasesVisible}
            {testcasesResult}
            bind:testcases
        />
    {/if}
{/snippet}

{#if layout === 'fullscreen'}
    {@render testcasesEditor()}

    <div class="fullscreen-editor-memory-wrapper">
        <div class="fullscreen-editor-wrapper">
            {@render editorSurface()}
            {@render controlsPanel()}
        </div>
        {#if showRegsColumn || showMemory || showConsole || children}
            <div class="fullscreen-right-side">
                {#if showRegsColumn || showMemory || children}
                    <div class="fullscreen-memory-wrapper">
                        {#if showRegsColumn}
                            {@render fullscreenRegsColumn()}
                        {/if}
                        {#if showMemory && (!children || !(!running && !(emulator.canExecute || !!emulator.compiledCode)))}
                            {@render fullscreenMemoryPanel()}
                        {:else if !running && children}
                            <Card
                                background="secondary"
                                style="padding: 1rem; overflow-y: auto; width: 31.3rem; height: 33.25rem;"
                            >
                                {@render children()}
                            </Card>
                        {/if}
                    </div>
                {/if}
                {#if showConsole}
                    {@render consolePanel()}
                {/if}
            </div>
        {/if}
    </div>
{:else}
    <div class="editor-wrapper">
        <div class="top-row">
            <div class="column editor">
                {@render editorSurface()}
                {@render controlsPanel()}
            </div>

            {#if showRegsColumn}
                {@render smallRegsColumn()}
                {#if forceMemoryRight && showMemory}
                    {@render smallMemoryPanel()}
                {/if}
            {:else if showMemory}
                {@render smallMemoryPanel()}
            {/if}
        </div>

        {#if showRegsColumn && showMemory && !forceMemoryRight}
            <div class="bottom-row">
                {#if showConsole}
                    {@render consolePanel()}
                {/if}
                {@render smallMemoryPanel()}
            </div>
        {:else if showConsole}
            {@render consolePanel()}
        {/if}
        {@render testcasesEditor()}
    </div>
{/if}

<style lang="scss">
    .editor-wrapper {
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: 0.5rem;
    }

    .top-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        flex: 1;
    }

    .bottom-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .editor {
        min-height: 15rem;
        min-width: min(100%, 25rem);
        flex: 1;
        gap: 0.5rem;
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
        max-width: 18rem;
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
        .bottom-row {
            flex-direction: column-reverse;
        }
        .code-data-memory-controls {
            max-width: unset;
        }
    }

    .editor-border {
        position: relative;
        display: flex;
        flex: 1;
        padding: 0.2rem;
        border-radius: 0.5rem;
    }

    .editor-wrapper .editor-border {
        margin: -0.2rem;
    }

    .fullscreen-editor-memory-wrapper {
        display: flex;
        flex: 1;
        max-width: 100%;

        .fullscreen-editor-wrapper,
        .fullscreen-memory-wrapper {
            display: flex;
        }

        .fullscreen-editor-wrapper {
            flex-direction: column;
            flex: 1;
            gap: 0.4rem;

            @media screen and (max-width: 1000px) {
                min-height: calc(var(--screen-height) * 0.7);
            }

            .editor-border {
                margin-left: -0.2rem;
            }
        }

        .fullscreen-memory-wrapper {
            gap: 0.4rem;
            align-items: flex-start;

            @media screen and (max-width: 1000px) {
                margin-top: 1rem;
                padding-bottom: 1rem;
                overflow-x: auto;
                width: 100%;
            }
        }

        @media screen and (max-width: 1000px) {
            flex-direction: column;
        }
    }

    .fullscreen-right-side {
        margin-left: 0.5rem;
        width: min-content;
        gap: 0.4rem;
        max-height: calc(var(--screen-height) - 4.2rem);
        padding-top: 0.2rem;
        display: flex;
        overflow-y: auto;
        flex-direction: column;
    }

    .fullscreen-registers-column {
        min-height: 0;
        height: 33.25rem;
        min-width: fit-content;
        overflow: hidden;
    }

    @media screen and (max-width: 1000px) {
        .fullscreen-right-side {
            margin: 0;
            padding: 0.2rem;
            margin-top: 1rem;
            width: unset;
            max-height: unset;
            align-items: center;
            flex-direction: column-reverse;
        }

        .fullscreen-registers-column {
            height: unset !important;
            max-height: unset !important;
            overflow: visible !important;
        }
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
                )
                0 50%;
            border-radius: 0.5rem;
            animation:
                moveGradient 5s alternate infinite,
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
    }

    .redBorder {
        &::before {
            background: linear-gradient(60deg, hsl(359, 85%, 66%), hsl(0, 85%, 66%));
        }
    }
</style>
