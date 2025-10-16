<script lang="ts">
    import Editor from '$cmp/specific/project/Editor.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import MemoryVisualiser from '$cmp/specific/project/memory/MemoryRenderer.svelte'
    import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
    import { createEventDispatcher, onMount } from 'svelte'
    import FaKeyboard from 'svelte-icons/fa/FaKeyboard.svelte'
    import type { Project, TestcaseResult } from '$lib/Project.svelte'
    import FaSave from 'svelte-icons/fa/FaSave.svelte'
    import FaCog from 'svelte-icons/fa/FaCog.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import { toast } from '$stores/toastStore'
    import Controls from '$cmp/specific/project/Controls.svelte'
    import StdOut from '$cmp/specific/project/user-tools/StdOutRenderer.svelte'
    import { clampBigInt, createDebouncer, formatTime } from '$lib/utils'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE } from '$lib/Config'
    import Settings from '$cmp/specific/project/settings/Settings.svelte'
    import FloatingLanguageDocumentation from '$cmp/specific/project/FloatingLanguageDocumentation.svelte'
    import FaBook from 'svelte-icons/fa/FaBook.svelte'
    import { ShortcutAction, shortcutsStore } from '$stores/shortcutsStore'
    import RegistersVisualiser from '$cmp/specific/project/cpu/RegistersRenderer.svelte'
    import RegistersRenderer from '$cmp/specific/project/cpu/RegistersRenderer.svelte'
    import StatusCodesVisualiser from '$cmp/specific/project/cpu/StatusCodesRenderer.svelte'
    import MemoryControls from '$cmp/specific/project/memory/MemoryControls.svelte'
    import FaShareAlt from 'svelte-icons/fa/FaShareAlt.svelte'
    import MemoryTab from '$cmp/specific/project/memory/MemoryTab.svelte'
    import ShortcutEditor from '$cmp/specific/project/settings/ShortcutEditor.svelte'
    import { settingsStore } from '$stores/settingsStore.svelte'
    import type monaco from 'monaco-editor'
    import ToggleableDraggable from '$cmp/shared/draggable/DraggableContainer.svelte'
    import CallStack from '$cmp/specific/project/user-tools/CallStack.svelte'
    import MutationsViewer from '$cmp/specific/project/user-tools/MutationsRenderer.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import FaDonate from 'svelte-icons/fa/FaHeart.svelte'
    import { getM68kErrorMessage } from '$lib/languages/M68K/M68kUtils'
    import Row from '$cmp/shared/layout/Row.svelte'
    import TestcasesEditor from '$cmp/specific/project/testcases/TestcasesEditor.svelte'
    import {
        makeColorizedLabels,
        makeRegister,
        RegisterSize
    } from '$lib/languages/commonLanguageFeatures.svelte'
    import { type Emulator } from '$lib/languages/Emulator'
    import BelowLineContent from '$cmp/specific/project/user-tools/BelowLineContent.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'

    interface Props {
        project: Project
        emulator: Emulator
        isExam?: boolean
        isExamLocked?: boolean
        examSubmission: Project['exam']['submission']
    }

    let { project = $bindable(), emulator = $bindable(), isExam, examSubmission , isExamLocked}: Props = $props()

    $effect(() => {
        emulator.setCode(project.code)
    })

    let editor: monaco.editor.IStandaloneCodeEditor = $state()
    let testcasesResult: TestcaseResult[] = $state([])
    let running = $state(false)
    let settingsVisible = $state(false)
    let documentationVisible = $state(false)
    let shortcutsVisible = $state(false)
    let testcasesVisible = $state(false)
    let groupSize = $state(RegisterSize.Word)
    let errorStrings = $derived(emulator.errors.join('\n'))
    let elapsedTime = $state(0)
    let info = $derived(
        emulator.terminated && emulator.executionTime >= 0
            ? `Ran in ${formatTime(emulator.executionTime)}`
            : ''
    )
    const dispatcher = createEventDispatcher<{
        save: {
            silent: boolean
            data: Project
        }
        wantsToLeave: void
        share: Project
        finishedExam: Project
    }>()
    const pressedKeys = new Map<String, boolean>()
    const [debounced] = createDebouncer(3000)

    function handleKeyDown(e: KeyboardEvent) {
        pressedKeys.set(e.code, true)
        const code = Array.from(pressedKeys.keys()).join('+')
        const shortcut = shortcutsStore.get(code)
        if (e.repeat && shortcut?.type !== ShortcutAction.Step) return
        if (
            //@ts-ignore ignore all events coming from the editor and input
            e.target.tagName === 'INPUT' ||
            //@ts-ignore ignore all events coming from the editor and input
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
                emulator.compile(settingsStore.values.maxHistorySize.value)
                break
            }
            case ShortcutAction.RunCode: {
                if (emulator.terminated || emulator.interrupt !== undefined || !emulator.canExecute)
                    break
                emulator.run(settingsStore.values.instructionsLimit.value)
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
                if (emulator.terminated || emulator.interrupt !== undefined || !emulator.canExecute)
                    break
                emulator.step()
                break
            }
            case ShortcutAction.Undo: {
                if (
                    emulator.terminated ||
                    emulator.interrupt !== undefined ||
                    !emulator.canExecute ||
                    !emulator.canUndo
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
        const interval = setInterval(() => {
            elapsedTime += 1000
        }, 1000)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('blur', clearPressed)
            emulator.dispose()
            clearInterval(interval)
        }
    })

    function toggleWindow(windowName: 'shortcuts' | 'documentation' | 'settings' | 'testcases') {
        //TODO improve this
        if (windowName === 'shortcuts') {
            shortcutsVisible = !shortcutsVisible
            documentationVisible = false
            settingsVisible = false
            testcasesVisible = false
        } else if (windowName === 'documentation') {
            shortcutsVisible = false
            documentationVisible = !documentationVisible
            settingsVisible = false
            testcasesVisible = false
        } else if (windowName === 'settings') {
            shortcutsVisible = false
            documentationVisible = false
            settingsVisible = !settingsVisible
            testcasesVisible = false
        } else if (windowName === 'testcases') {
            shortcutsVisible = false
            documentationVisible = false
            settingsVisible = false
            testcasesVisible = !testcasesVisible
        }
    }

    const pc = makeRegister('PC', emulator.pc, emulator.systemSize)

    $effect(() => {
        pc.setValue(emulator.pc)
        pc.setSize(emulator.systemSize)
    })

    const remainingMinutes = $derived(
        project.exam?.timeLimit && project.exam?.timeLimit > 0
            ? Math.floor((project.exam.timeLimit - elapsedTime) / 60000)
            : -1
    )

    const formattedSubmissionTime = $derived(
        project.exam?.submission?.submissionTimestamp
            ? new Date(project.exam.submission.submissionTimestamp).toLocaleString()
            : ''
    )
</script>

<header class="project-header">
    {#if !isExam}
        <a
            href="/projects"
            title="Go back to your projects"
            onclick={(e) => {
                e.preventDefault()
                dispatcher('wantsToLeave')
            }}
        >
            <Icon size={2}>
                <FaAngleLeft />
            </Icon>
        </a>
        <h1 style="font-size: 1.6rem; margin-left: 0.4rem" class="ellipsis">{project.name}</h1>
        <Row gap="0.5rem" style="margin-left: auto;">
            <Button
                onClick={() => dispatcher('share', project)}
                hasIcon
                cssVar="accent2"
                style="padding:0; width:2.2rem; height:2.2rem;"
            >
                <Icon>
                    <FaShareAlt />
                </Icon>
            </Button>
            <ButtonLink
                href="/donate"
                cssVar="accent2"
                style="padding:0; width:2.2rem; height:2.2rem;"
                hasIcon
            >
                <Icon>
                    <FaDonate />
                </Icon>
            </ButtonLink>
            <Button
                onClick={() => toggleWindow('shortcuts')}
                hasIcon
                cssVar="accent2"
                style="padding:0; width:2.2rem; height:2.2rem"
            >
                <Icon>
                    <FaKeyboard />
                </Icon>
            </Button>
            <Button
                onClick={() => toggleWindow('documentation')}
                hasIcon
                cssVar="accent2"
                style="padding:0; width:2.2rem; height:2.2rem"
            >
                <Icon>
                    <FaBook />
                </Icon>
            </Button>
            <Button
                onClick={() => toggleWindow('settings')}
                hasIcon
                cssVar="accent2"
                style="padding:0; width:2.2rem; height:2.2rem"
            >
                <Icon>
                    <FaCog />
                </Icon>
            </Button>
            <Button
                onClick={() => {
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
        </Row>
        <ShortcutEditor bind:visible={shortcutsVisible} />
        <Settings bind:visible={settingsVisible} language={project.language} />
        <FloatingLanguageDocumentation
            bind:visible={documentationVisible}
            language={project.language}
        />
    {:else}
        {#if examSubmission.name}
            <Header type="h2">
                {examSubmission.name || 'Unknown'} ({examSubmission.hash}){formattedSubmissionTime
                    ? ` - ${formattedSubmissionTime}`
                    : remainingMinutes >= 0
                      ? ` - ${remainingMinutes} minutes left`
                      : ''}
            </Header>
        {/if}

        {#if !examSubmission.submissionTimestamp}
            <Button style="margin-left: auto;" onClick={() => dispatcher('finishedExam', project)}>
                Finish exam
            </Button>
        {/if}
    {/if}
</header>
<TestcasesEditor
    editable={!isExam}
    systemSize={emulator.systemSize}
    registerNames={emulator.registers.map((r) => r.name)}
    hiddenRegistersNames={emulator.hiddenRegisters}
    bind:visible={testcasesVisible}
    {testcasesResult}
    bind:testcases={project.testcases}
/>
<ToggleableDraggable title="Call stack" left={300}>
    <CallStack
        stack={emulator.callStack}
        onGoToInstruction={(address) => {
            const line = emulator.getLineFromAddress(address)
            if (line < 0) return
            editor.revealLineInCenter(line + 1)
            editor.setPosition({ lineNumber: line + 1, column: 1 })
        }}
        onGoToLabel={(label) => {
            editor.revealLineInCenter(label.line + 1)
            editor.setPosition({ lineNumber: label.line + 1, column: 1 })
        }}
    />
</ToggleableDraggable>

<ToggleableDraggable title="History" left={500}>
    <MutationsViewer
        statusRegisterNames={emulator.statusRegisters.map((r) => r.name)}
        on:undo={(e) => {
            const amount = e.detail
            emulator.undo(amount)
        }}
        on:highlight={(e) => {
            const line = e.detail
            editor.revealLineInCenter(line + 1)
            editor.setPosition({ lineNumber: line + 1, column: 0 })
        }}
        steps={emulator.latestSteps}
    />
</ToggleableDraggable>
{#each emulator.memory.tabs as tab, i}
    <MemoryTab
        endianess={tab.endianess}
        {tab}
        defaultMemoryValue={DEFAULT_MEMORY_VALUE[project.language]}
        memorySize={MEMORY_SIZE[project.language]}
        left={700 + i * 300}
        systemSize={emulator.systemSize}
        sp={emulator.sp}
        onAddressChange={(address, tab) => {
            emulator.setTabMemoryAddress(address, tab.id)
        }}
        callStackAddresses={makeColorizedLabels(emulator.callStack)}
    />
{/each}
<div class="editor-memory-wrapper">
    <div class="editor-wrapper">
        <div
            class="editor-border"
            class:gradientBorder={emulator.canExecute && !emulator.terminated}
            class:redBorder={emulator.errors.length > 0}
        >
            {#key project.language}
                <Editor
                    viewZones={settingsStore.values.showPseudoInstructions.value
                        ? emulator.decorations.map((v) => {
                              return {
                                  afterLineNumber: v.belowLine,
                                  content: BelowLineContent,
                                  props: { md: v.md, note: v.note }
                              }
                          })
                        : []}
                    on:change={(d) => {
                        if (emulator.canExecute && emulator.terminated && emulator.line >= 0) {
                            emulator.resetSelectedLine()
                        }
                        if (settingsStore.values.autoSave.value) {
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
                    codeOverride={emulator.compiledCode}
                    breakpoints={emulator.breakpoints.map(Number)}
                    errors={emulator.compilerErrors}
                    language={project.language}
                    highlightedLine={emulator.line}
                    disabled={(emulator.canExecute && !emulator.terminated) ||
                        !!emulator.compiledCode}
                    hasError={emulator.errors.length > 0}
                    vimMode={settingsStore.values.vimMode.value}
                />
            {/key}
        </div>

        <Controls
            {running}
            hasTests={project.testcases.length > 0}
            hasErrorsInTests={testcasesResult.some((r) => !r.passed)}
            hasNoErrorsInTests={testcasesResult.every((r) => r.passed) &&
                testcasesResult.length > 0}
            canEditTests={true}
            executionDisabled={emulator.terminated || emulator.interrupt !== undefined}
            buildDisabled={emulator.compilerErrors.length > 0}
            hasCompiled={emulator.canExecute || !!emulator.compiledCode}
            canUndo={emulator.canUndo}
            on:edit-tests={() => {
                toggleWindow('testcases')
            }}
            on:test={async () => {
                running = true
                setTimeout(async () => {
                    try {
                        testcasesResult = await emulator.test(
                            project.code,
                            project.testcases,
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
                testcasesResult = []
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
                    //give the latest code to the emulator
                    await emulator.compile(settingsStore.values.maxHistorySize.value, project.code)
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
                testcasesResult = []
            }}
        />
    </div>
    <div class="right-side">
        <div class="memory-wrapper">
            <div class="column" style="gap: 0.4rem;">
                {#if emulator.statusRegisters && emulator.statusRegisters.length > 0}
                    <StatusCodesVisualiser statusCodes={emulator.statusRegisters} />
                {/if}
                <RegistersRenderer
                    systemSize={emulator.systemSize}
                    style="flex: unset; overflow: unset; padding: 0;"
                    gridStyle="padding: 0.2rem 0.7rem"
                    size={emulator.systemSize}
                    registers={[pc]}
                    withoutHeader
                    position="bottom"
                />
                <RegistersVisualiser
                    systemSize={emulator.systemSize}
                    size={groupSize}
                    hiddenRegistersNames={emulator.hiddenRegisters}
                    registers={emulator.registers}
                    on:registerClick={async (e) => {
                        const value = e.detail.value
                        const clampedSize =
                            value - (value % BigInt(emulator.memory.global.pageSize))
                        emulator.setGlobalMemoryAddress(
                            clampBigInt(clampedSize, 0n, MEMORY_SIZE[project.language])
                        )
                    }}
                />
            </div>

            <div class="column" style="gap: 0.4rem">
                {#if settingsStore.values.showMemory.value && (!isExam || !(!running && !(emulator.canExecute || !!emulator.compiledCode)))}
                    <div class="row" style="gap: 0.4rem">
                        <MemoryControls
                            systemSize={emulator.systemSize}
                            bytesPerPage={emulator.memory.global.pageSize}
                            memorySize={MEMORY_SIZE[project.language]}
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
                        defaultMemoryValue={DEFAULT_MEMORY_VALUE[project.language]}
                        bytesPerRow={emulator.memory.global.rowSize}
                        pageSize={emulator.memory.global.pageSize}
                        memory={emulator.memory.global.data}
                        currentAddress={emulator.memory.global.address}
                        sp={emulator.sp}
                        callStackAddresses={makeColorizedLabels(emulator.callStack)}
                    />
                {:else if !running && isExam}
                    <Card
                        background="secondary"
                        style="padding: 1rem; overflow-y: auto; width: 32.9rem; height: 34.9rem;"
                    >
                        <MarkdownRenderer
                            source={isExamLocked ? '' : project.exam?.track || ''}
                            style="padding: 0.5rem; font-size: 1.2rem"
                        ></MarkdownRenderer>
                    </Card>
                {:else}
                    <button
                        style="background: transparent; height: 100%; cursor: pointer"
                        onclick={() => settingsStore.setValue('showMemory', true)}
                    >
                        <Card
                            background="secondary"
                            style="height: 100%; padding: 0.5rem"
                            justify="center"
                            align="center"
                        >
                            <Header type="h3" style="font-weight: normal">Show Memory</Header>
                        </Card>
                    </button>
                {/if}
            </div>
        </div>
        <StdOut
            {info}
            stdOut={errorStrings ? `${errorStrings}\n${emulator.stdOut}` : emulator.stdOut}
            compilerErrors={emulator.compilerErrors}
        />
    </div>
</div>

<style lang="scss">
    .project-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }

    .editor-memory-wrapper {
        display: flex;
        flex: 1;
        padding: 0.5rem;

        .editor-wrapper,
        .memory-wrapper {
            display: flex;
        }

        .editor-wrapper {
            flex-direction: column;
            flex: 1;
            gap: 0.4rem;
            @media screen and (max-width: 1000px) {
                min-height: 70vh;
            }

            .editor-border {
                position: relative;
                display: flex;
                flex: 1;
                padding: 0.2rem;
                margin-left: -0.2rem;
                border-radius: 0.5rem;
            }
        }

        .memory-wrapper {
            gap: 0.4rem;
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
