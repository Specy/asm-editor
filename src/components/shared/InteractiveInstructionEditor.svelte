<script lang="ts">
    import Editor from '$cmp/specific/project/Editor.svelte'
    import { toast } from '$stores/toastStore'
    import ExecutionDock, {
        type DockAction,
        type DockCompilation
    } from '$cmp/specific/project/ExecutionDock.svelte'
    import { clampBigInt } from '$lib/utils'
    import { terminationSummary } from '$lib/languages/termination'
    import { registerColumnWidth } from '$lib/languages/registerFormats'
    import { resolveProjectSettings, undoHistorySize } from '$lib/projectSettings'
    import { rewriteScreenDirective } from '$lib/languages/mars/screenDirective'
    import MemoryControls from '$cmp/specific/project/memory/MemoryControls.svelte'
    import MemoryVisualiser from '$cmp/specific/project/memory/MemoryRenderer.svelte'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE, TESTCASE_INSTRUCTION_LIMIT } from '$lib/Config'
    import StatusCodesVisualiser from '$cmp/specific/project/cpu/StatusCodesRenderer.svelte'
    import RegistersVisualiser from '$cmp/specific/project/cpu/RegistersRenderer.svelte'
    import RegisterFilesPanel from '$cmp/specific/project/cpu/RegisterFilesPanel.svelte'
    import { onMount, type Snippet, untrack } from 'svelte'
    import { getM68kErrorMessage } from '$lib/languages/M68K/M68kUtils'
    import type { AvailableLanguages, Project, Testcase, TestcaseResult } from '$lib/Project.svelte'
    import { PlaygroundSession } from '$lib/content/PlaygroundSession.svelte'
    import {
        editorFileLanguage,
        sourceLanguage,
        OPTIMIZATIONS,
        type Optimization,
        type SourceCompiler
    } from '$lib/sourceCompilation/records'
    import { createProjectLanguageSessionId } from '$lib/languages/service/uri'
    import { Prompt } from '$stores/promptStore.svelte'
    import { type Emulator } from '$lib/languages/Emulator'
    import StdOutRenderer from '$cmp/specific/project/user-tools/StdOutRenderer.svelte'
    import TestcasesEditor from '$cmp/specific/project/testcases/TestcasesEditor.svelte'
    import type monaco from 'monaco-editor'
    import Card from '$cmp/shared/layout/Card.svelte'
    import {
        makeColorizedLabels,
        makeRegister,
        type RegisterPoke,
        type RegisterFormat,
        RegisterSize
    } from '$lib/languages/commonLanguageFeatures.svelte'
    import ScreenRenderer from '$cmp/specific/project/screen/ScreenRenderer.svelte'
    import ScreenDisplayConfiguration from '$cmp/specific/project/screen/ScreenDisplayConfiguration.svelte'
    import {
        DEFAULT_PROJECT_DISPLAY,
        type MarsDisplayOrigin
    } from '$lib/languages/mars/marsDisplay'
    import { languageHasScreen } from '$lib/languages/peripherals/peripheralSet'
    import CollapsibleSection from '$cmp/specific/workbench/CollapsibleSection.svelte'
    import type { ScreenHeader } from '$cmp/specific/project/screen/screenHeader'
    import '$cmp/specific/workbench/workbench.css'
    import FaListOl from '~icons/fa-solid/list-ol'
    import FaExclamationTriangle from '~icons/fa-solid/exclamation-triangle'
    import { watchViewport } from '$lib/workbench/viewport.svelte'

    let running = $state(false)
    let building = $state(false)
    //a phone gets the dock as one tray across the bottom of the code, as the Workbench's
    const viewport = watchViewport()

    type Layout = 'small' | 'fullscreen'

    interface Props {
        code: string
        /** Optional transient Project: named files, a C/C++ or assembly entry, and compilation records. */
        project?: Project
        /** Selected project file, shared with a host such as the AI chat. */
        activePath?: string
        testcases?: Testcase[]
        showMemory?: boolean
        /** Whether the memory view has the region picker and tints its bytes by region. */
        showMemoryRegions?: boolean
        showConsole?: boolean
        showTestcases?: boolean
        showPc?: boolean
        showRegisters?: boolean
        showFlags?: boolean
        showScreen?: boolean
        /** Whether the Screen panel starts unfolded; the small layout folds it away by default. */
        openScreen?: boolean
        embedded?: boolean
        language?: AvailableLanguages
        emulator: Emulator
        children?: Snippet
        forceMemoryRight?: boolean
        layout?: Layout
        /**
         * The Register file the panel opens on, a Playground's `fpu`/`cp0`/`csr`/`sse`/`x87` flag.
         * Undefined, and an id this language has not got, open the CPU file.
         */
        initialRegisterFile?: string
        /** The initial file's reading, so a floating-point example starts with visible numbers. */
        initialRegisterFormat?: RegisterFormat
        fontOptions?: Pick<
            monaco.editor.IStandaloneEditorConstructionOptions,
            'fontFamily' | 'fontSize' | 'lineHeight'
        >
        /**
         * The caller's own controls, such as a documentation page's "Try in the editor", at the far
         * end of the execution dock floating over the bottom of the code.
         */
        dockActions?: DockAction[]
    }

    let {
        code = $bindable(),
        project,
        activePath = $bindable(undefined),
        language = 'M68K',
        showMemory: showMemoryProp,
        showMemoryRegions = false,
        showFlags: showFlagsProp,
        showRegisters: showRegistersProp,
        showConsole: showConsoleProp,
        showTestcases: showTestcasesProp,
        showPc: showPcProp,
        showScreen: showScreenProp,
        openScreen = false,
        testcases = $bindable([]),
        embedded = false,
        emulator = $bindable(),
        children,
        forceMemoryRight = false,
        layout = 'small',
        initialRegisterFile = undefined,
        initialRegisterFormat = undefined,
        fontOptions,
        dockActions = []
    }: Props = $props()
    const session = untrack(() => (project ? new PlaygroundSession(project) : undefined))
    $effect(() => {
        if (session && activePath && session.project.files[activePath])
            session.selected = activePath
    })
    const modelSessionId = createProjectLanguageSessionId()
    const selectedFile = $derived(session?.selected)
    const editorLanguage = $derived(
        selectedFile ? editorFileLanguage(selectedFile, language) : language
    )
    const fileSource = $derived(
        session && selectedFile
            ? {
                  key: selectedFile,
                  value: session.project.files[selectedFile]?.content ?? '',
                  identity: {
                      sessionId: modelSessionId,
                      sourceKind: 'live' as const,
                      path: selectedFile
                  }
              }
            : undefined
    )
    const compiling = $derived(session?.compiling ?? false)
    const diagnostics = $derived([...(session?.diagnostics ?? []), ...emulator.compilerDiagnostics])
    const shownDiagnostics = $derived(
        selectedFile
            ? diagnostics.filter(
                  (diagnostic) => diagnostic.file === selectedFile || !diagnostic.file
              )
            : diagnostics
    )
    const buildDisabled = $derived(
        (session && !!sourceLanguage(session.project.entry)) || emulator.compilerErrors.length > 0
    )
    const selectedIsSource = $derived(!!selectedFile && !!sourceLanguage(selectedFile))
    const selectedLine = $derived.by(() => {
        if (!session || !selectedFile) return emulator.line
        if (emulator.currentFile === selectedFile) return emulator.line
        const mapped = session.project.sourceMaps[emulator.currentFile]?.lines[emulator.line]
        return mapped?.path === selectedFile ? mapped.line : -1
    })
    function confirmReplacement(question: string, signal: AbortSignal) {
        const pending = Prompt.confirm(question)
        const id = Prompt.id
        const cancel = () => {
            if (Prompt.id === id && Prompt.promise) Prompt.cancel()
        }
        signal.addEventListener('abort', cancel, { once: true })
        return pending.finally(() => signal.removeEventListener('abort', cancel))
    }
    async function compileSourceFile() {
        if (!session || running || building) return
        try {
            await session.compile(confirmReplacement)
            activePath = session.selected
        } catch (error) {
            toast.error(getM68kErrorMessage(error))
        }
    }
    const compilation = $derived<DockCompilation | undefined>(
        session?.sourcePath && (selectedIsSource || session.recompilationNeeded)
            ? {
                  label: compiling ? 'Compiling…' : selectedIsSource ? 'Compile' : 'Recompile',
                  disabled: building || running || compiling,
                  busy: compiling,
                  optimization: selectedIsSource
                      ? {
                            value: session.optimization,
                            levels: OPTIMIZATIONS,
                            onChange: (value) => {
                                session.optimization = value as Optimization
                            }
                        }
                      : undefined,
                  compiler: selectedIsSource
                      ? {
                            value: session.compiler,
                            options:
                                language === 'X86'
                                    ? [{ value: 'gcc', label: 'GCC' }]
                                    : [
                                          { value: 'clang', label: 'Clang' },
                                          { value: 'gcc', label: 'GCC' }
                                      ],
                            onChange: (value) => {
                                session.compiler = value as SourceCompiler
                            }
                        }
                      : undefined,
                  onCompile: compileSourceFile,
                  onCancel: () => session.cancel()
              }
            : undefined
    )
    let showMemory = $derived(showMemoryProp ?? true)
    let showFlags = $derived(showFlagsProp ?? true)
    let showRegisters = $derived(showRegistersProp ?? true)
    //a read in a host that hides the console opens it, and it stays open for the rest of the page
    //(the plan's decision 10, docs/design/environment-library-plan.md): there is nowhere else to
    //type the answer
    let consoleRevealed = $state(false)
    let showConsole = $derived((showConsoleProp ?? layout === 'fullscreen') || consoleRevealed)
    let showTestcases = $derived(showTestcasesProp ?? false)
    let showPc = $derived(showPcProp ?? layout === 'fullscreen')
    //A shared editor only shows the Screen when its caller asks for it. Documentation playgrounds
    //derive that explicit request from their `screen` fence flag; x86 has no graphics device.
    let showScreen = $derived((showScreenProp ?? false) && languageHasScreen(language))
    //no Project here, so a Playground runs on the language's default Settings
    const settings = $derived(resolveProjectSettings(language, undefined))
    //no project to save it in here, so the lecture, exam, embed and chat surfaces get the popover
    //with the display living for as long as the page does. Only MIPS and RISC-V have one at all
    let display = $state(DEFAULT_PROJECT_DISPLAY)
    /** Whether the display on screen came from the program's own `@screen` comment, see `syncDisplay`. */
    let displayOrigin: MarsDisplayOrigin = $state('user')
    let displayBaseLabel: string | undefined = $state(undefined)
    const configurableDisplay = $derived(emulator.setDisplay !== undefined)

    /**
     * A Build reads the program's `@screen` directive, so the emulator may have configured itself
     * from the source; the popover follows it. A program without one changes nothing.
     */
    function syncDisplay() {
        const configured = emulator.getDisplay?.()
        if (!configured) return
        displayOrigin = configured.origin
        displayBaseLabel = configured.baseLabel
        if (configured.origin === 'directive') display = configured.display
    }
    //the small layout has no room to spare, so the Screen starts folded away in its section unless
    //the caller asked for it open: a lecture whose program draws wants the drawing visible
    let screenCollapsed = $state(untrack(() => !openScreen))
    //the section's header shows the Screen's size and controls, which the panel hands it
    let screenHeader: ScreenHeader | undefined = $state()
    let groupSize = $state(RegisterSize.Word)

    //the Playground's half of the Poke availability rule
    //([the design record](../../../../docs/design/pokes.md)): a Playground has no read-only flag,
    //so it is the Core being busy that closes the rows. The Emulator owns the other half
    const pokeable = $derived(!running && !building && emulator.canPoke)

    /** One commit of a register chunk, which is one Poke; a value too wide for it throws. */
    function pokeRegisters(fileId: string, writes: RegisterPoke[]) {
        try {
            emulator.pokeRegisters(fileId, writes)
        } catch (e) {
            toast.error(getM68kErrorMessage(e))
        }
    }

    /** One commit of a memory selection, which is one Poke however many bytes it covers. */
    function pokeMemory(address: bigint, bytes: Uint8Array) {
        try {
            emulator.pokeMemory(address, bytes)
        } catch (e) {
            toast.error(getM68kErrorMessage(e))
        }
    }
    //the fullscreen register column is pinned to the width of the CPU file, as the project page's is:
    //it sits in the same `min-content` row as the memory panel, so a column that followed the visible
    //tab would slide that panel sideways every time a tab was picked. The inline column beside the
    //editor is already a fixed 18rem and needs none of this
    let registersColumnWidth = $derived(registerColumnWidth(emulator.registerFiles, groupSize))
    //empty for a language with a single file, which has no tab to pick and goes on sizing its column
    //by what the column holds, exactly as it always did. `min-width` is set with the width because a
    //`fit-content` minimum would otherwise let the widest file win the argument anyway
    //the column is a card now, whose edges are inside its width
    let registersColumnStyle = $derived.by(() => {
        if (!registersColumnWidth) return ''
        const width = `calc(${registersColumnWidth} + 2 * var(--wb-card-inset))`
        return `width: ${width}; min-width: ${width};`
    })
    let testcasesVisible = $state(false)
    let testcasesResult: TestcaseResult[] = $state([])

    /** Test, and the Testcases window's Run all. */
    function runTests() {
        if (building || running || compiling || buildDisabled) return
        running = true
        setTimeout(async () => {
            try {
                testcasesResult = await emulator.test(
                    session ? $state.snapshot(session.sources) : $state.snapshot(code),
                    $state.snapshot(testcases),
                    TESTCASE_INSTRUCTION_LIMIT,
                    undoHistorySize(settings)
                )
            } catch (e) {
                console.error(e)
                toast.error('Error executing tests. ' + getM68kErrorMessage(e))
            } finally {
                running = false
            }
        }, 50)
    }
    let editor: monaco.editor.IStandaloneCodeEditor | undefined = $state()

    $effect(() => {
        //Tracked read outside `untrack`, so editing the playground keeps arming the live check.
        const source = session ? $state.snapshot(session.sources) : code
        if (session && sourceLanguage(session.project.entry)) return
        untrack(() =>
            typeof source === 'string' ? emulator.setCode(source) : emulator.setSources(source)
        )
        if (session)
            untrack(() => {
                if (!building && !running && !emulator.canExecute) void emulator.check()
            })
    })

    onMount(() => {
        const unregisterSourceHelp = session?.registerSourceHelp(modelSessionId)
        return () => {
            unregisterSourceHelp?.()
            session?.cancel()
            emulator.dispose()
        }
    })

    const pc = makeRegister('PC', emulator.pc, emulator.systemSize)

    $effect(() => {
        pc.setValue(emulator.pc)
        pc.setSize(emulator.systemSize)
    })

    let errorStrings = $derived(emulator.errors.join('\n'))
    //the Log's wording, without an error's message, which the console shows above it
    let info = $derived(
        emulator.terminated
            ? terminationSummary(emulator.termination, emulator.executionTime, {
                  errorMessage: false
              })
            : ''
    )
    const readWaiting = $derived(emulator.peripherals.terminal.pendingRead?.source === 'terminal')
    $effect(() => {
        if (!readWaiting) return
        untrack(() => {
            if (!emulator.peripherals.terminal.consoleAttached) consoleRevealed = true
        })
    })
    //an embed is an iframe of a fixed height, which the registers card may not outgrow: it is the
    //card that is held to what the frame leaves it, the embed's padding and the console under it,
    //and the Register files that shrink inside it and scroll, whatever the flags and the PC above
    //them take. A minimum height on the files would win over that and push the frame into scrolling
    let embeddedRegistersStyle = $derived(
        embedded
            ? `max-height: calc(var(--screen-height) - 1rem - ${showConsole ? '4.5rem' : '0px'});`
            : ''
    )

    //the small layout splits the CPU file into two name/value pairs per line, which is what fits
    //beside a 32 bit value in an 18rem column. A 64 bit language (x86, RISC-V-64) draws twice the
    //digits, so a second pair on the line would only squeeze both until their groups wrapped: those
    //languages get one pair per line and scroll instead
    let smallRegistersGridStyle = $derived(
        `grid-template-columns: ${
            Number(emulator.systemSize) > RegisterSize.Long
                ? 'min-content 1fr'
                : 'min-content 1fr min-content 1fr'
        }; gap: 0.1rem; height: 100%; justify-content: space-evenly;`
    )

    let showRegsColumn = $derived(
        showPc || showRegisters || (showFlags && emulator.statusRegisters?.length > 0)
    )

    async function buildCode() {
        if (building || running || compiling || buildDisabled) return
        try {
            running = false
            building = true
            const source = session ? $state.snapshot(session.sources) : code
            if (typeof source === 'string') emulator.setCode(source)
            else emulator.setSources(source)
            await emulator.compile(undoHistorySize(settings), source)
            if (session) {
                session.selected = session.project.entry
                activePath = session.selected
            }
        } catch (e) {
            console.error(e)
            toast.error('Error compiling code. ' + getM68kErrorMessage(e))
        } finally {
            building = false
            //also after a failed build: the directive is read before the program is assembled
            syncDisplay()
        }
    }

    /**
     * The run, awaited so `running` stays true for as long as the program is in flight: that is what
     * turns the Run button into Pause here too, and what keeps Step and Undo out of a run.
     */
    async function startRun() {
        if (building || running || compiling) return
        running = true
        if (layout === 'fullscreen') {
            testcasesResult = []
        }
        try {
            //no limit: a Run is sliced, so Pause and Stop answer even in an infinite loop (ADR 0007)
            await emulator.run(0)
        } catch (e) {
            console.error(e)
            toast.error('Error executing code. ' + getM68kErrorMessage(e))
        } finally {
            running = false
        }
    }

    async function stepCode() {
        try {
            await emulator.step()
        } catch (e) {
            console.error(e)
            toast.error('Error executing code. ' + getM68kErrorMessage(e))
        }
    }

    function undoStep() {
        try {
            emulator.undo()
        } catch (e) {
            console.error(e)
            toast.error('Error executing undo ' + getM68kErrorMessage(e))
        }
    }

    function stopProgram() {
        emulator.clear()
        running = false
        if (layout === 'fullscreen') {
            testcasesResult = []
        }
    }

    //an embedded playground carrying testcases is a lecture's Exercise, and the reader checks it
    //by pressing Test, so there the button stays next to the Testcases panel
    const offersTest = $derived(
        layout === 'fullscreen' || embedded
            ? testcases.length > 0
            : testcases.length > 0 && !showTestcases
    )
    const allDockActions = $derived<DockAction[]>(
        showTestcases
            ? [
                  ...dockActions,
                  {
                      label: 'Testcases',
                      title: 'Show the Testcases',
                      icon: testcasesResult.some((r) => !r.passed)
                          ? FaExclamationTriangle
                          : FaListOl,
                      tone: testcasesResult.some((r) => !r.passed)
                          ? 'red'
                          : testcasesResult.length > 0
                            ? 'green'
                            : undefined,
                      onClick: () => (testcasesVisible = !testcasesVisible)
                  }
              ]
            : dockActions
    )

    function handleRegisterClick(value: bigint) {
        const clampedSize = value - (value % BigInt(emulator.memory.global.pageSize))
        emulator.setGlobalMemoryAddress(clampBigInt(clampedSize, 0n, MEMORY_SIZE[language]))
    }

    function handleEditorChange() {
        if (emulator.canExecute && emulator.terminated && emulator.line >= 0) {
            emulator.resetSelectedLine()
        }
    }
</script>

{#snippet editorSurface()}
    <div class="editor-border" class:failed={emulator.errors.length > 0}>
        {#if session}
            <div class="playground-files" role="tablist" aria-label="Program files">
                {#each Object.keys(session.project.files) as path (path)}
                    <button
                        type="button"
                        role="tab"
                        aria-selected={selectedFile === path}
                        onclick={() => {
                            session.selected = path
                            activePath = path
                        }}>{path}</button
                    >
                {/each}
            </div>
        {/if}
        <div class="playground-code">
            <Editor
                on:change={handleEditorChange}
                on:breakpointPress={(d) => {
                    emulator.toggleBreakpoint(d.detail - 1, selectedFile)
                }}
                on:fileChange={(event) => session?.edit(event.detail.path, event.detail.value)}
                bind:editor
                bind:code
                source={fileSource}
                retainedModelKeys={session ? Object.keys(session.project.files) : undefined}
                codeOverride={session ? undefined : emulator.compiledCode}
                breakpointsEditable={!selectedIsSource}
                breakpoints={emulator.breakpoints
                    .filter(
                        (breakpoint) =>
                            breakpoint.file ===
                            (selectedFile ?? emulator.buildSources?.entry ?? emulator.entry)
                    )
                    .map((breakpoint) => breakpoint.line)}
                diagnostics={shownDiagnostics}
                language={editorLanguage}
                {fontOptions}
                highlightedLine={selectedLine}
                disabled={building ||
                    compiling ||
                    (emulator.canExecute && !emulator.terminated) ||
                    !!emulator.compiledCode}
                hasError={emulator.errors.length > 0}
            />
        </div>
        <div class="floating-dock">
            <ExecutionDock
                attached
                fill={viewport.deviceClass === 'phone'}
                debugging={emulator.canExecute || !!emulator.compiledCode}
                building={building || compiling}
                {running}
                {buildDisabled}
                {compilation}
                compileOnly={selectedIsSource}
                buildLabel={selectedFile && selectedFile !== session?.project.entry
                    ? 'Build entry'
                    : 'Build'}
                executionDisabled={emulator.terminated || emulator.interrupt !== undefined}
                canUndo={emulator.canUndo}
                hasTests={offersTest}
                actions={allDockActions}
                onBuild={buildCode}
                onStop={stopProgram}
                onRun={startRun}
                onPause={() => emulator.pause()}
                onUndo={undoStep}
                onStep={stepCode}
                onTest={runTests}
            />
        </div>
    </div>
{/snippet}

{#snippet smallRegsColumn()}
    <!-- the Workbench's registers card: the flags inset on top and ruled off from edge to edge, then
         the PC, then the Register files reaching the card's edges -->
    <!-- outside an embed the files ask for 15.85rem and no more, from a zero basis, so the row is as
         tall as the tallest of what sits beside them and they fill it, scrolling inside -->
    <div class="column card registers-card data-registers-wrapper" style={embeddedRegistersStyle}>
        {#if emulator.statusRegisters?.length > 0 && showFlags}
            <div class="inset">
                <StatusCodesVisualiser statusCodes={emulator.statusRegisters} />
            </div>
            <!-- the Register files' own header sets them apart, so only the PC is ruled off -->
            {#if showPc}
                <div class="rule"></div>
            {/if}
        {/if}
        {#if showPc}
            <RegistersVisualiser
                systemSize={emulator.systemSize}
                {language}
                size={emulator.systemSize}
                style="flex: unset; overflow: unset; padding: 0;"
                gridStyle="padding: 0.2rem 0.7rem"
                registers={[pc]}
                withoutHeader
                position="bottom"
            />
        {/if}
        {#if showRegisters}
            <RegisterFilesPanel
                systemSize={emulator.systemSize}
                {language}
                size={groupSize}
                initialFileId={initialRegisterFile}
                initialFormat={initialRegisterFormat}
                gridStyle={smallRegistersGridStyle}
                style={embedded
                    ? 'flex: 1; min-height: 0;'
                    : 'flex: 1 1 0px; min-height: 15.85rem;'}
                files={emulator.registerFiles}
                {pokeable}
                canPokeRegister={(fileId, name) => emulator.canPokeRegister(fileId, name)}
                onPoke={pokeRegisters}
                onRegisterClick={(register) => {
                    handleRegisterClick(register.value)
                }}
            />
        {/if}
    </div>
{/snippet}

{#snippet smallMemoryPanel()}
    <div class="column card memory-card code-data-memory-controls">
        <div class="memory-controls">
            <MemoryControls
                {emulator}
                buttonVar="secondary"
                showRegions={showMemoryRegions}
                systemSize={emulator.systemSize}
                bytesPerPage={emulator.memory.global.pageSize}
                memorySize={MEMORY_SIZE[language]}
                currentAddress={emulator.memory.global.address}
                style="flex: unset"
                inputStyle="width: 6rem; padding: 0 0 0 0.6rem;"
                onAddressChange={async (address) => {
                    emulator.setGlobalMemoryAddress(address)
                }}
                hideLabel
            />
        </div>
        <div class="memory-page">
            <MemoryVisualiser
                memoryRegions={showMemoryRegions ? emulator?.memoryRegions : undefined}
                dataLabels={showMemoryRegions ? emulator?.dataLabels : undefined}
                readOnlyMemory={emulator?.readOnlyMemory}
                style="flex: 1; border-bottom-left-radius: min(var(--panel-radius, 0.5rem), 0.2rem); border-bottom-right-radius: min(var(--panel-radius, 0.5rem), 0.2rem);"
                systemSize={emulator.systemSize}
                endianess={emulator.memory.global.endianess}
                defaultMemoryValue={DEFAULT_MEMORY_VALUE[language]}
                bytesPerRow={emulator.memory.global.rowSize}
                pageSize={emulator.memory.global.pageSize}
                memory={emulator.memory.global.data}
                currentAddress={emulator.memory.global.address}
                sp={emulator.sp}
                callStackAddresses={makeColorizedLabels(emulator.callStack)}
                {pokeable}
                onPoke={pokeMemory}
            />
        </div>
    </div>
{/snippet}

{#snippet fullscreenRegsColumn()}
    <div
        class="column card registers-card fullscreen-registers-column"
        style={registersColumnStyle}
    >
        {#if emulator.statusRegisters && emulator.statusRegisters.length > 0 && showFlags}
            <div class="inset">
                <StatusCodesVisualiser statusCodes={emulator.statusRegisters} />
            </div>
            <!-- the Register files' own header sets them apart, so only the PC is ruled off -->
            {#if showPc}
                <div class="rule"></div>
            {/if}
        {/if}
        {#if showPc}
            <RegistersVisualiser
                systemSize={emulator.systemSize}
                {language}
                style="flex: unset; overflow: unset; padding: 0;"
                gridStyle="padding: 0.2rem 0.7rem"
                size={emulator.systemSize}
                registers={[pc]}
                withoutHeader
                position="bottom"
            />
        {/if}
        {#if showRegisters}
            <RegisterFilesPanel
                systemSize={emulator.systemSize}
                {language}
                size={groupSize}
                initialFileId={initialRegisterFile}
                initialFormat={initialRegisterFormat}
                style="flex: 1; min-height: 0;"
                files={emulator.registerFiles}
                {pokeable}
                canPokeRegister={(fileId, name) => emulator.canPokeRegister(fileId, name)}
                onPoke={pokeRegisters}
                onRegisterClick={(register) => {
                    handleRegisterClick(register.value)
                }}
            />
        {/if}
    </div>
{/snippet}

{#snippet fullscreenMemoryPanel()}
    <div class="column card memory-card">
        <div class="memory-controls">
            <MemoryControls
                {emulator}
                buttonVar="secondary"
                showRegions={showMemoryRegions}
                systemSize={emulator.systemSize}
                bytesPerPage={emulator.memory.global.pageSize}
                memorySize={MEMORY_SIZE[language]}
                inputStyle="height: 100%; padding: 0 0 0 0.6rem;"
                currentAddress={emulator.memory.global.address}
                onAddressChange={(e) => {
                    emulator.setGlobalMemoryAddress(e)
                }}
            />
        </div>
        <div class="memory-page">
            <MemoryVisualiser
                memoryRegions={showMemoryRegions ? emulator?.memoryRegions : undefined}
                dataLabels={showMemoryRegions ? emulator?.dataLabels : undefined}
                readOnlyMemory={emulator?.readOnlyMemory}
                style="border-bottom-left-radius: min(var(--panel-radius, 0.5rem), 0.2rem); border-bottom-right-radius: min(var(--panel-radius, 0.5rem), 0.2rem);"
                systemSize={emulator.systemSize}
                endianess={emulator.memory.global.endianess}
                defaultMemoryValue={DEFAULT_MEMORY_VALUE[language]}
                bytesPerRow={emulator.memory.global.rowSize}
                pageSize={emulator.memory.global.pageSize}
                memory={emulator.memory.global.data}
                currentAddress={emulator.memory.global.address}
                sp={emulator.sp}
                callStackAddresses={makeColorizedLabels(emulator.callStack)}
                {pokeable}
                onPoke={pokeMemory}
            />
        </div>
    </div>
{/snippet}

{#snippet screenPanel(height: string, headerless = false)}
    <ScreenRenderer
        name={language}
        screen={emulator.peripherals.screen}
        keyboard={emulator.peripherals.keyboard}
        mouse={emulator.peripherals.mouse}
        actualSizeZoom={configurableDisplay ? display.unitWidth : 1}
        style={`height: ${height}; flex: none;${headerless ? ' border-radius: 0;' : ''}`}
        {headerless}
        onHeader={headerless ? (header) => (screenHeader = header) : undefined}
    >
        {#snippet configuration()}
            {#if configurableDisplay}
                <ScreenDisplayConfiguration
                    {display}
                    origin={displayOrigin}
                    baseLabel={displayBaseLabel}
                    onChange={(next) => {
                        //the program's own @screen comment, when it has one, is rewritten to say
                        //what was chosen, as on the project page; a program without one keeps the
                        //choice for as long as the page lives
                        const source = session
                            ? (session.project.files[session.project.entry]?.content ?? '')
                            : code
                        const rewritten = rewriteScreenDirective(source, display, next)
                        const baseChanged = next.baseAddress !== display.baseAddress
                        if (rewritten !== null) {
                            if (session) session.edit(session.project.entry, rewritten)
                            else code = rewritten
                        }
                        display = next
                        displayOrigin = rewritten !== null ? 'directive' : 'user'
                        if (rewritten === null || baseChanged) displayBaseLabel = undefined
                        emulator.setDisplay?.(next)
                    }}
                />
            {/if}
        {/snippet}
    </ScreenRenderer>
{/snippet}

{#snippet consolePanel()}
    <StdOutRenderer
        {info}
        terminal={emulator.peripherals.terminal}
        errors={errorStrings}
        {diagnostics}
        interactive={emulator.canExecute && !emulator.terminated}
        escapes={language === 'X86'}
    />
{/snippet}

{#snippet testcasesEditor()}
    {#if showTestcases}
        <TestcasesEditor
            systemSize={emulator.systemSize}
            {language}
            editable={!embedded}
            registerNames={emulator.registers.map((r) => r.name)}
            registerSizes={Object.fromEntries(
                emulator.registers.map((r) => [r.name, Number(r.size)])
            )}
            startingRegisterNames={emulator.startingRegisterNames}
            hiddenRegistersNames={emulator.hiddenRegisters}
            bind:visible={testcasesVisible}
            {testcasesResult}
            bind:testcases
            onRun={runTests}
            onClear={() => (testcasesResult = [])}
            runDisabled={building || compiling || running || buildDisabled}
        />
    {/if}
{/snippet}

{#if layout === 'fullscreen'}
    {@render testcasesEditor()}

    <div class="playground fullscreen-editor-memory-wrapper">
        <div class="fullscreen-editor-wrapper">
            {@render editorSurface()}
        </div>
        {#if showRegsColumn || showMemory || showConsole || showScreen || children}
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
                {#if showScreen}
                    {@render screenPanel('26rem')}
                {/if}
                {#if showConsole}
                    {@render consolePanel()}
                {/if}
            </div>
        {/if}
    </div>
{:else}
    <div class="playground editor-wrapper">
        <div class="top-row">
            <div class="column editor">
                {@render editorSurface()}
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

        <!-- the Screen comes before the terminal, under the code that draws on it -->
        {#if showScreen}
            <CollapsibleSection
                title="Screen"
                bind:collapsed={screenCollapsed}
                info={screenCollapsed ? undefined : screenHeader?.info}
                actions={screenCollapsed ? undefined : screenHeader?.actions}
            >
                {@render screenPanel('20rem', true)}
            </CollapsibleSection>
        {/if}

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
    /* the panels sit apart by the Workbench's gap; the small layout has no room for a Screen
       that most programs never draw on, so it folds away in a section like the debug column's,
       and the fullscreen layout shows the panel itself */
    .editor-wrapper {
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: var(--wb-gap);
    }

    .top-row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--wb-gap);
        flex: 1;
    }

    .bottom-row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--wb-gap);
    }

    .editor {
        min-height: 15rem;
        min-width: min(100%, 25rem);
        flex: 1;
    }

    /* the Workbench's cards: the panel's surface inside a 1px edge, which clips what they hold */
    .card {
        background-color: var(--wb-surface);
        border-radius: var(--wb-radius);
        border: var(--wb-card-edge);
        overflow: hidden;
    }

    /* the Register files meet the card's edges, where a rounded corner would only show a gap */
    .registers-card {
        gap: 0.3rem;
        --panel-radius: 0px;

        .inset {
            flex: none;
            min-width: 0;
            padding: 0.3rem 0.3rem 0;
        }

        /* a border rather than a 1px fill: at a fractional screen scale a fill can round to two
           pixels, a border always to one, like the card's edges */
        .rule {
            flex: none;
            height: 0;
            border-top: 1px solid var(--wb-line);
        }
    }

    /* the address controls are ruled off from the page under them, from edge to edge of the card,
       as in the Workbench's memory card */
    .memory-card {
        min-width: 13rem;

        .memory-controls {
            display: flex;
            flex: none;
            gap: 0.4rem;
            padding: 0.3rem;
            border-bottom: 1px solid var(--wb-line);
        }

        /* the page fills the card, as tall as what sits beside it, its rows sharing the room */
        .memory-page {
            display: flex;
            flex-direction: column;
            flex: 1;
            padding: 0.3rem;
        }
    }

    /* 18rem inside the card's edges */
    .data-registers-wrapper {
        --width: calc(18rem + 2 * var(--wb-card-inset));
        max-width: var(--width);
        min-width: var(--width);
        width: var(--width);
        flex: 1;
    }

    /* and around its padding too */
    .code-data-memory-controls {
        max-width: calc(18rem + 0.6rem + 2 * var(--wb-card-inset));
    }

    @media (max-width: 720px) {
        .data-registers-wrapper {
            flex: 1;
            max-width: unset;
            width: unset;
        }
        .bottom-row {
            flex-direction: column-reverse;
        }
        .code-data-memory-controls {
            max-width: unset;
        }
    }

    /* the Workbench editor's card: the Build turning into Stop is what says the program is built,
       so there is no frame around the code while it runs, and only a program stopped on an error
       gets a red one, drawn over the card's edge */
    .editor-border {
        position: relative;
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 0;
        background-color: var(--secondary);
        border-radius: var(--wb-radius, 0.4rem);
        border: var(--wb-card-edge, 1px solid color-mix(in srgb, var(--tertiary) 60%, transparent));
        overflow: hidden;
    }

    .playground-files {
        display: flex;
        flex: none;
        overflow-x: auto;
        border-bottom: 1px solid var(--border-color);
    }

    .playground-code {
        position: relative;
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 0;
    }

    .editor-border:has(.playground-files) {
        flex-direction: column;
    }
    .playground-files button {
        flex: none;
        padding: 0.35rem 0.65rem;
        color: var(--hint);
        background: transparent;
        border: 0;
        border-bottom: 2px solid transparent;
        cursor: pointer;
    }
    .playground-files button[aria-selected='true'] {
        color: var(--primary-text);
        border-bottom-color: var(--accent);
    }
    .playground-files button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
    }

    /* the shadow Monaco draws under the top edge once the code is scrolled */
    .editor-border :global(.monaco-editor .scroll-decoration) {
        display: none;
    }

    /* the card's corners are the rounded ones; the editor's own would only nick them */
    .editor-border :global(.monaco-editor),
    .editor-border :global(.monaco-editor .overflow-guard) {
        border-radius: 0;
    }

    .failed::after {
        position: absolute;
        z-index: 6;
        content: '';
        inset: 0;
        border: 0.2rem solid var(--red);
        pointer-events: none;
        animation: appear 0.3s ease-in;
    }

    @keyframes appear {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    /* edge to edge in the bottom corners of the code, which the card's rounding clips */
    .floating-dock {
        position: absolute;
        z-index: 5;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
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

            @media screen and (max-width: 1000px) {
                min-height: calc(var(--screen-height) * 0.7);
            }
        }

        .fullscreen-memory-wrapper {
            gap: var(--wb-gap);
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
        margin-left: var(--wb-gap);
        width: min-content;
        gap: var(--wb-gap);
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
            flex-direction: column;
        }

        .fullscreen-registers-column {
            height: unset !important;
            max-height: unset !important;
            overflow: visible !important;
        }
    }
</style>
