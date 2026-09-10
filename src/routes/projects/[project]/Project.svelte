<script lang="ts">
    import Editor from '$cmp/specific/project/Editor.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import MemoryVisualiser from '$cmp/specific/project/memory/MemoryRenderer.svelte'
    import FaAngleLeft from '~icons/fa-solid/angle-left'
    import { createEventDispatcher, onMount, tick, type Snippet, untrack } from 'svelte'
    import FaKeyboard from '~icons/fa-solid/keyboard'
    import type {
        AvailableLanguages,
        ProjectFiles,
        Testcase,
        TestcaseResult
    } from '$lib/Project.svelte'
    import FaSave from '~icons/fa-solid/save'
    import FaCog from '~icons/fa-solid/cog'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import { toast } from '$stores/toastStore'
    import Controls from '$cmp/specific/project/Controls.svelte'
    import StdOut from '$cmp/specific/project/user-tools/StdOutRenderer.svelte'
    import { clampBigInt, createDebouncer, formatTime } from '$lib/utils'
    import { DEFAULT_MEMORY_VALUE, MEMORY_SIZE, TESTCASE_INSTRUCTION_LIMIT } from '$lib/Config'
    import Settings from '$cmp/specific/project/settings/Settings.svelte'
    import FloatingLanguageDocumentation from '$cmp/specific/project/FloatingLanguageDocumentation.svelte'
    import FaBook from '~icons/fa-solid/book'
    import { ShortcutAction, shortcutsStore } from '$stores/shortcutsStore'
    import RegistersVisualiser from '$cmp/specific/project/cpu/RegistersRenderer.svelte'
    import RegistersRenderer from '$cmp/specific/project/cpu/RegistersRenderer.svelte'
    import StatusCodesVisualiser from '$cmp/specific/project/cpu/StatusCodesRenderer.svelte'
    import MemoryControls from '$cmp/specific/project/memory/MemoryControls.svelte'
    import FaShareAlt from '~icons/fa-solid/share-alt'
    import MemoryTab from '$cmp/specific/project/memory/MemoryTab.svelte'
    import ShortcutEditor from '$cmp/specific/project/settings/ShortcutEditor.svelte'
    import { preferencesStore } from '$stores/preferencesStore.svelte'
    import { type ProjectSettingsDecisions, resolveProjectSettings } from '$lib/projectSettings'
    import { rewriteScreenDirective } from '$lib/languages/mars/screenDirective'
    import { serializer } from '$lib/json'
    import type monaco from 'monaco-editor'
    import ToggleableDraggable from '$cmp/shared/draggable/DraggableContainer.svelte'
    import CallStack from '$cmp/specific/project/user-tools/CallStack.svelte'
    import MutationsViewer from '$cmp/specific/project/user-tools/MutationsRenderer.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import FaDonate from '~icons/fa-solid/heart'
    import { getM68kErrorMessage } from '$lib/languages/M68K/M68kUtils'
    import Row from '$cmp/shared/layout/Row.svelte'
    import TestcasesEditor from '$cmp/specific/project/testcases/TestcasesEditor.svelte'
    import {
        makeColorizedLabels,
        makeRegister,
        RegisterSize,
        type Diagnostic
    } from '$lib/languages/commonLanguageFeatures.svelte'
    import { type Emulator } from '$lib/languages/Emulator'
    import BelowLineContent from '$cmp/specific/project/user-tools/BelowLineContent.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import FloatingAgentSidebar from '$cmp/shared/agent/FloatingAgentSidebar.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import { resolve } from '$app/paths'
    import ScreenRenderer from '$cmp/specific/project/screen/ScreenRenderer.svelte'
    import ScreenDisplayConfiguration from '$cmp/specific/project/screen/ScreenDisplayConfiguration.svelte'
    import { languageHasScreen } from '$lib/languages/peripherals/peripheralSet'
    import {
        DEFAULT_PROJECT_DISPLAY,
        type MarsDisplayOrigin,
        marsDisplayEquals,
        normalizeMarsDisplay,
        type ProjectDisplay
    } from '$lib/languages/mars/marsDisplay'
    import type { FileSystem } from '$lib/languages/peripherals/FileSystem'
    import type { BuildInput, BuildSources, ProjectFile } from '$lib/projectFiles'
    import FileSidebar from '$cmp/specific/project/FileSidebar.svelte'
    import {
        buildSource,
        canEditProjectBreakpoints,
        isCurrentBuildLocation,
        liveSource,
        selectProjectFile,
        type ProjectSourceSelection
    } from '$lib/monaco/projectSourceSelection'
    import {
        createProjectLanguageSessionId,
        projectSourceModelKey,
        type ProjectModelIdentity
    } from '$lib/languages/service/uri'
    import { ProjectLanguageSession } from '$lib/languages/service/ProjectLanguageSession'
    import type { ProjectAnalysisSnapshot } from '$lib/languages/service/protocol'
    import { languageDiagnosticToDiagnostic } from '$lib/languages/service/legacyDiagnostics'
    import { registerProjectNavigation } from '$lib/languages/service/navigation'
    import { zeroBasedLineToMonaco } from '$lib/languages/service/monacoConversions'

    interface Props {
        name?: string
        language?: AvailableLanguages
        code?: string
        files?: ProjectFiles
        entry?: string
        fileSystem?: FileSystem
        testcases?: Testcase[]
        /** MIPS and RISC-V only: MARS's five bitmap-display parameters, saved with the project. */
        display?: ProjectDisplay
        /**
         * The Project's Settings decisions ([ADR 0014](../../../../docs/adr/0014-settings-split-by-effect.md)).
         * Left out where there is no Project to keep them in, which hides the panel's Project section.
         */
        settings?: ProjectSettingsDecisions
        emulator: Emulator
        embedded?: boolean
        children?: Snippet
        readonly?: boolean
        canEditTestcases?: boolean
    }

    let {
        name = 'Untitled',
        language = 'M68K',
        code = $bindable(''),
        files = $bindable(undefined as ProjectFiles | undefined),
        entry = $bindable(undefined as string | undefined),
        fileSystem,
        testcases = $bindable([] as Testcase[]),
        display = $bindable(undefined as ProjectDisplay | undefined),
        settings = $bindable(undefined as ProjectSettingsDecisions | undefined),
        emulator = $bindable(),
        embedded = false,
        children,
        readonly = false,
        canEditTestcases = true
    }: Props = $props()

    const testcasesEditable = $derived(canEditTestcases && !readonly)
    /** The values a Build and a Test run with: the decisions, the language's defaults elsewhere. */
    const effectiveSettings = $derived(resolveProjectSettings(language, settings))
    const sourceInput = $derived.by<BuildInput>(() =>
        files !== undefined && entry !== undefined ? { files: $state.snapshot(files), entry } : code
    )
    const hasProjectFiles = $derived(
        files !== undefined && entry !== undefined && fileSystem !== undefined
    )
    let fileSystemLocked = $state(false)
    let sourceSelection = $state<ProjectSourceSelection>(
        liveSource(entry ?? Object.keys(files ?? {})[0] ?? '')
    )
    const languageSessionId = createProjectLanguageSessionId()
    let projectLanguageSession = $state.raw<ProjectLanguageSession>()
    let languageAnalysis = $state.raw<ProjectAnalysisSnapshot>()
    const displayedPath = $derived(sourceSelection.path)
    const sourceView = $derived(sourceSelection.sourceKind === 'build' ? 'snapshot' : 'live')
    let fileSidebarOpen = $state(false)
    let buildGeneration = $state(0)
    let previousBuildSources = $state.raw(emulator.buildSources)

    const displayedFile = $derived.by<ProjectFile | undefined>(() => {
        if (!hasProjectFiles) return { encoding: 'plain', content: code }
        return sourceView === 'snapshot'
            ? emulator.buildSources?.files[displayedPath]
            : files?.[displayedPath]
    })
    const displayedCode = $derived(displayedFile?.encoding === 'plain' ? displayedFile.content : '')
    const displayedLanguage = $derived(
        /\.(?:c|h)$/i.test(displayedPath) ? ('c' as const) : language
    )
    const displayedModelIdentity = $derived.by<ProjectModelIdentity | undefined>(() => {
        if (!hasProjectFiles || !displayedPath) return undefined
        return sourceSelection.sourceKind === 'build'
            ? {
                  sessionId: languageSessionId,
                  sourceKind: 'build',
                  buildGeneration: sourceSelection.buildGeneration,
                  path: displayedPath
              }
            : { sessionId: languageSessionId, sourceKind: 'live', path: displayedPath }
    })
    const displayedModelKey = $derived(
        displayedModelIdentity ? projectSourceModelKey(displayedModelIdentity) : 'legacy-entry'
    )
    const retainedModelKeys = $derived.by(() => {
        if (!hasProjectFiles) return undefined
        const liveKeys = Object.keys(files ?? {}).map((path) =>
            projectSourceModelKey({ sessionId: languageSessionId, sourceKind: 'live', path })
        )
        const buildKeys = Object.keys(emulator.buildSources?.files ?? {}).map((path) =>
            projectSourceModelKey({
                sessionId: languageSessionId,
                sourceKind: 'build',
                buildGeneration,
                path
            })
        )
        return [...liveKeys, ...buildKeys]
    })
    const liveLanguageDiagnostics = $derived.by<Diagnostic[]>(() => {
        if (!languageAnalysis || typeof sourceInput === 'string') return []
        return languageAnalysis.diagnostics.map((diagnostic) =>
            languageDiagnosticToDiagnostic(diagnostic, sourceInput)
        )
    })
    const activeDiagnostics = $derived(
        sourceView === 'live' && hasProjectFiles
            ? liveLanguageDiagnostics
            : emulator.compilerDiagnostics
    )
    const liveBuildHasErrors = $derived(
        hasProjectFiles
            ? (languageAnalysis?.diagnostics.some(
                  (diagnostic) => diagnostic.severity === 'error'
              ) ?? false)
            : emulator.compilerErrors.length > 0
    )
    const displayedDiagnostics = $derived(
        activeDiagnostics.filter(
            (diagnostic) => !diagnostic.file || diagnostic.file === displayedPath
        )
    )
    const displayedAnalysisStatus = $derived(
        sourceView === 'live' ? languageAnalysis?.fileStatus[displayedPath] : undefined
    )
    const diagnosticCounts = $derived.by(() => {
        const counts: Record<string, { errors: number; warnings: number }> = Object.create(null)
        for (const diagnostic of activeDiagnostics) {
            if (!diagnostic.file) continue
            const count = (counts[diagnostic.file] ??= { errors: 0, warnings: 0 })
            if (diagnostic.severity === 'error') count.errors += 1
            else if (diagnostic.severity === 'warning') count.warnings += 1
        }
        return counts
    })
    //the Screen panel is hidden for x86, which has no graphics device at all, and behind the same
    //kind of setting as the memory panel everywhere else
    const showScreen = $derived(
        preferencesStore.values.showScreen.value && languageHasScreen(language)
    )
    //only MARS and RARS put the screen's geometry in the user's hands: every other environment's
    //program sizes its own screen, so there is nothing to configure
    const configurableDisplay = $derived(emulator.setDisplay !== undefined)
    const currentDisplay = $derived(normalizeMarsDisplay(display ?? DEFAULT_PROJECT_DISPLAY))
    /** Whether the display on screen came from the program's own `@screen` comment, see `syncDisplay`. */
    let displayOrigin: MarsDisplayOrigin = $state('user')
    let displayBaseLabel: string | undefined = $state(undefined)

    /**
     * The one save rule (docs/design/project-format.md): a change to any part of the Project is
     * saved at once under autosave and otherwise waits for Save, when the prompt on leaving compares
     * the whole Project. Code goes through the same rule from the editor, debounced.
     */
    function changed() {
        if (preferencesStore.values.autoSave.value) dispatcher('save', { silent: true })
    }

    function applyDisplay(next: ProjectDisplay) {
        if (fileSystemLocked) {
            toast.warn('Stop execution before changing the display settings')
            return
        }
        //a program that states its display in a @screen comment gets that comment rewritten to say
        //what was chosen, so the code and the popover agree and the next Build reads it back; a
        //program without one keeps the choice in the Project alone
        const rewritten = rewriteScreenDirective(code, currentDisplay, next)
        const baseChanged = next.baseAddress !== currentDisplay.baseAddress
        if (rewritten !== null) code = rewritten
        display = next
        displayOrigin = rewritten !== null ? 'directive' : 'user'
        if (rewritten === null || baseChanged) displayBaseLabel = undefined
        //applied at once and with a re-sync from memory, as MARS does
        emulator.setDisplay?.(next)
        changed()
    }

    /** A decision or a reset from the panel; it takes effect at the next Build. */
    function applySettings(next: ProjectSettingsDecisions) {
        settings = next
        emulator.setScreenHistoryBudgetMb(
            resolveProjectSettings(language, next).screenHistoryBudgetMb
        )
        changed()
    }

    //Testcases are edited in place behind bind:testcases, so a change is noticed by watching their
    //content; the first run only remembers what was loaded
    let knownTestcases: string | undefined
    $effect(() => {
        const current = serializer.stringify($state.snapshot(testcases))
        if (knownTestcases !== undefined && current !== knownTestcases) untrack(changed)
        knownTestcases = current
    })

    /**
     * A Build reads the program's `@screen` directive, so the emulator may have configured itself
     * from the source; the popover and the saved project follow it. A program without a directive
     * leaves everything as the user set it.
     */
    function syncDisplay() {
        const configured = emulator.getDisplay?.()
        if (!configured) return
        displayOrigin = configured.origin
        displayBaseLabel = configured.baseLabel
        if (configured.origin !== 'directive') return
        if (marsDisplayEquals(currentDisplay, configured.display)) return
        display = configured.display
        changed()
    }

    $effect(() => {
        emulator.setSources(sourceInput)
    })

    $effect(() => {
        const session = projectLanguageSession
        const sources = sourceInput
        if (session && typeof sources !== 'string') session.update(sources)
    })

    $effect(() => {
        projectLanguageSession?.setBuild(buildGeneration, emulator.buildSources)
    })

    $effect(() => {
        synchronizeBuildGeneration(emulator.buildSources)
    })

    $effect(() => {
        if (!fileSystem) {
            fileSystemLocked = false
            return
        }
        fileSystemLocked = fileSystem.locked
        return fileSystem.subscribe((filesChanged) => {
            fileSystemLocked = fileSystem?.locked ?? false
            if (filesChanged) debouncedFileSave(changed)
        })
    })

    let editor: monaco.editor.IStandaloneCodeEditor | undefined = $state()
    let testcasesResult: TestcaseResult[] = $state([])
    let running = $state(false)
    let building = $state(false)
    let settingsVisible = $state(false)
    let documentationVisible = $state(false)
    let shortcutsVisible = $state(false)
    let testcasesVisible = $state(false)
    let agentOpen = $state(false)
    let groupSize = $state(RegisterSize.Word)
    let errorStrings = $derived(emulator.errors.join('\n'))
    let info = $derived(
        emulator.terminated && emulator.executionTime >= 0
            ? `Ran in ${formatTime(emulator.executionTime)}`
            : ''
    )
    const dispatcher = createEventDispatcher<{
        save: {
            silent: boolean
        }
        wantsToLeave: void
        share: void
    }>()
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Imperative window callbacks consume this accumulator; it has no tracked consumer.
    const pressedKeys = new Map<string, boolean>()
    const [debounced] = createDebouncer(3000)
    const [debouncedFileSave] = createDebouncer(250)

    function revealEditorLine(lineNumber: number, column: number) {
        const currentEditor = editor
        if (!currentEditor) return
        currentEditor.revealLineInCenter(lineNumber)
        currentEditor.setPosition({ lineNumber, column })
    }

    function selectDisplayedFile(path: string) {
        sourceSelection = selectProjectFile(
            sourceSelection,
            path,
            buildGeneration,
            emulator.buildSources?.files[path] !== undefined
        )
    }

    function synchronizeBuildGeneration(buildSources: BuildSources | undefined): void {
        if (buildSources && buildSources !== previousBuildSources) buildGeneration += 1
        previousBuildSources = buildSources
    }

    async function revealSourceLocation(file: string, line: number, column = 1) {
        const buildSources = emulator.buildSources
        if (!buildSources?.files[file]) return
        // A compile can reveal its first instruction before Svelte flushes the observer above.
        // Synchronize here as well so the selection and model URI always use the new Build.
        synchronizeBuildGeneration(buildSources)
        sourceSelection = buildSource(file, buildGeneration)
        await tick()
        revealEditorLine(zeroBasedLineToMonaco(line), column)
    }

    async function revealDiagnostic(diagnostic: Diagnostic) {
        const path = diagnostic.file ?? emulator.buildSources?.entry ?? entry ?? displayedPath
        if (emulator.buildSources?.files[path]) {
            await revealSourceLocation(path, diagnostic.lineIndex, diagnostic.column)
            return
        }
        sourceSelection = liveSource(path)
        await tick()
        revealEditorLine(zeroBasedLineToMonaco(diagnostic.lineIndex), diagnostic.column)
    }

    function revealCurrentInstruction() {
        if (emulator.line < 0) return
        void revealSourceLocation(emulator.currentFile, emulator.line)
    }

    function returnToLiveFiles() {
        sourceSelection = liveSource(
            files?.[displayedPath] ? displayedPath : (entry ?? Object.keys(files ?? {})[0] ?? '')
        )
    }

    function moveFileBreakpoints(from: string, to?: string) {
        const moved = emulator.breakpoints.filter((breakpoint) => breakpoint.file === from)
        for (const breakpoint of moved) emulator.toggleBreakpoint(breakpoint.line, from)
        if (!to) return
        for (const breakpoint of moved) {
            if (
                !emulator.breakpoints.some(
                    (candidate) => candidate.file === to && candidate.line === breakpoint.line
                )
            ) {
                emulator.toggleBreakpoint(breakpoint.line, to)
            }
        }
    }

    function handleDisplayedFileChange(nextCode: string) {
        if (hasProjectFiles) {
            if (sourceView !== 'live' || !fileSystem || !displayedFile) return
            try {
                fileSystem.writeText(displayedPath, nextCode)
            } catch (error) {
                console.error(error)
                toast.error(getM68kErrorMessage(error))
            }
        } else {
            code = nextCode
        }
        if (emulator.canExecute && emulator.terminated && emulator.line >= 0) {
            emulator.resetSelectedLine()
        }
        if (!hasProjectFiles && preferencesStore.values.autoSave.value) {
            debounced(() => dispatcher('save', { silent: true }))
        }
    }

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
                break
            }
            case ShortcutAction.BuildCode: {
                void buildCode()
                break
            }
            case ShortcutAction.RunCode: {
                if (emulator.terminated || emulator.interrupt !== undefined || !emulator.canExecute)
                    break
                if (running) emulator.pause()
                else void startRun()
                break
            }
            case ShortcutAction.SaveCode: {
                dispatcher('save', {
                    silent: false
                })
                break
            }
            case ShortcutAction.ClearExecution: {
                emulator.clear()
                emulator.setSources(sourceInput)
                returnToLiveFiles()
                break
            }
            case ShortcutAction.Step: {
                if (running || building) break
                if (emulator.terminated || emulator.interrupt !== undefined || !emulator.canExecute)
                    break
                void stepCode()
                break
            }
            case ShortcutAction.Undo: {
                if (running || building) break
                if (emulator.interrupt !== undefined || !emulator.canExecute || !emulator.canUndo)
                    break
                emulator.undo()
                revealCurrentInstruction()
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
        let unsubscribeLanguageSession: (() => void) | undefined
        const unregisterNavigation = registerProjectNavigation(
            languageSessionId,
            async (identity, selection) => {
                if (identity.sourceKind === 'build') {
                    if (
                        identity.buildGeneration !== buildGeneration ||
                        !emulator.buildSources?.files[identity.path]
                    ) {
                        return false
                    }
                    sourceSelection = buildSource(identity.path, identity.buildGeneration)
                } else {
                    if (!files?.[identity.path]) return false
                    sourceSelection = liveSource(identity.path)
                }
                await tick()
                if (selection) {
                    const lineNumber =
                        'lineNumber' in selection ? selection.lineNumber : selection.startLineNumber
                    const column = 'column' in selection ? selection.column : selection.startColumn
                    revealEditorLine(lineNumber, column)
                }
                return true
            }
        )
        if (typeof sourceInput !== 'string') {
            const session = new ProjectLanguageSession(
                languageSessionId,
                sourceInput as BuildSources,
                language
            )
            projectLanguageSession = session
            unsubscribeLanguageSession = session.subscribe((snapshot) => {
                languageAnalysis = snapshot
            })
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        window.addEventListener('blur', clearPressed)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('blur', clearPressed)
            unsubscribeLanguageSession?.()
            unregisterNavigation()
            projectLanguageSession?.dispose()
            projectLanguageSession = undefined
            emulator.dispose()
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

    async function buildCode() {
        if (readonly || building || running || fileSystemLocked) return
        try {
            running = false
            building = true
            await emulator.compile(effectiveSettings.maxHistorySize, sourceInput)
        } catch (e) {
            console.error(e)
            toast.error('Error compiling code. ' + getM68kErrorMessage(e))
        } finally {
            building = false
            //also after a failed build: the directive is read before the program is assembled
            syncDisplay()
            if (emulator.canExecute) revealCurrentInstruction()
        }
    }

    async function runCode() {
        try {
            //no limit: a Run is sliced, so Pause and Stop answer even in an infinite loop (ADR 0007)
            await emulator.run(0)
        } catch (e) {
            console.error(e)
            toast.error('Error executing code. ' + getM68kErrorMessage(e))
        }
    }

    /**
     * The whole run, from the button and from the shortcut alike: `running` has to be true for as
     * long as the program is in flight, because that is what turns the Run button into Pause and
     * keeps Step and Undo out of a run they would re-enter the Core inside of.
     */
    async function startRun() {
        if (building || running) return
        running = true
        testcasesResult = []
        try {
            await runCode()
        } finally {
            running = false
            revealCurrentInstruction()
        }
    }

    async function stepCode() {
        try {
            await emulator.step()
            revealCurrentInstruction()
        } catch (e) {
            console.error(e)
            toast.error('Error executing code. ' + getM68kErrorMessage(e))
        }
    }
</script>

{#if !embedded}
    <header class="project-header">
        <a
            href={resolve('/projects', {})}
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
        <h1 style="font-size: 1.6rem; margin-left: 0.4rem" class="ellipsis">{name}</h1>
        <Row gap="0.5rem" style="margin-left: auto;">
            <Button
                onClick={() => (agentOpen = !agentOpen)}
                hasIcon
                cssVar="accent"
                style="padding:0; width:2.2rem; height:2.2rem; border-radius: 1.5rem; border-bottom-right-radius: 0.4rem;"
                title="Ask AI"
            >
                <Icon>
                    <SparklesIcon />
                </Icon>
            </Button>
            <Button
                onClick={() => dispatcher('share')}
                hasIcon
                cssVar="accent2"
                style="padding:0; width:2.2rem; height:2.2rem;"
                title="Share"
            >
                <Icon>
                    <FaShareAlt />
                </Icon>
            </Button>
            <ButtonLink
                title="donate"
                href="/donate"
                cssVar="accent2"
                style="padding:0; width:2.2rem; height:2.2rem;"
                hasIcon
            >
                <Icon>
                    <FaDonate />
                </Icon>
            </ButtonLink>
            <div class="only-desktop">
                <Button
                    onClick={() => toggleWindow('shortcuts')}
                    hasIcon
                    cssVar="accent2"
                    style="padding:0; width:2.2rem; height:2.2rem"
                    title="Shortcuts"
                >
                    <Icon>
                        <FaKeyboard />
                    </Icon>
                </Button>
            </div>
            <Button
                onClick={() => toggleWindow('documentation')}
                hasIcon
                cssVar="accent2"
                style="padding:0; width:2.2rem; height:2.2rem"
                title="Documentation"
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
                title="Settings"
            >
                <Icon>
                    <FaCog />
                </Icon>
            </Button>
            <Button
                onClick={() => {
                    dispatcher('save', {
                        silent: false
                    })
                }}
                cssVar="accent2"
                hasIcon
                style="padding:0; width:2.2rem; height:2.2rem"
                title="Save"
            >
                <Icon>
                    <FaSave />
                </Icon>
            </Button>
        </Row>
        <ShortcutEditor bind:visible={shortcutsVisible} />
        <Settings
            bind:visible={settingsVisible}
            {language}
            projectSettings={settings}
            onProjectSettingsChange={applySettings}
        />
        <FloatingLanguageDocumentation bind:visible={documentationVisible} {language} />
    </header>
    <FloatingAgentSidebar
        bind:open={agentOpen}
        openSize="28rem"
        verticalOffset="3.2rem"
        editorLanguage={language}
        bind:editorCode={code}
        emulatorInstance={emulator}
        canUpdateLanguage={false}
        additionalInstructions={`
            The user is working on a saved project in the ${language} assembly language. The editor language is locked to ${language} for this project.
            The project editor has a code editor, registers view, memory view, execution controls, and breakpoints.

            This context is primarily the *Modify or extend existing code* and *Debug broken code* workflows:
            - Always call get_code before editing. The user's existing code, labels, comments, and breakpoints are their work — preserve them.
            - NEVER completely override the code unless the user explicitly asks for a rewrite. Make minimal, targeted changes via set_code.
            - When the user reports something isn't working, follow the *Debug broken code* workflow: run the code, set breakpoints on the suspected region, step through, and report findings based on observed register/memory values rather than speculation.
            - When the user asks a conceptual question ("how does X work"), follow the *Explain a concept (project-safe)* workflow. Do NOT call set_code to drop an example into the editor unsolicited — it would destroy the user's work.
        `}
        workflows={[
            {
                name: 'Explain a concept',
                intentTriggers: [
                    'how does this work',
                    'what does this mean',
                    'explain',
                    'concept',
                    'show me an example',
                    'what is',
                    'instruction behavior',
                    'register question',
                    'memory question',
                    'do not change my code'
                ],
                requiredTools: ['get_code'],
                verification:
                    'Keep examples in chat unless the user explicitly confirms replacing or applying changes to the project code.',
                description: `
When the user asks a conceptual question ("how does X work", "show me Y") while working on their project. The editor already holds the user's code, so you must NOT overwrite it with an unrelated example.
1. Answer the conceptual question in chat.
2. If code would help illustrate it, put the example in a markdown code block in chat — do NOT call set_code.
3. At the end of your message, ask the user whether they'd like you to load the example into the editor (which will replace their current code) or apply it to their existing code instead.
4. Only call set_code after the user confirms, and after you've used get_code to understand what you're about to change.
`
            }
        ]}
    />
{/if}
<TestcasesEditor
    editable={testcasesEditable}
    systemSize={emulator.systemSize}
    registerNames={emulator.registers.map((r) => r.name)}
    startingRegisterNames={emulator.startingRegisterNames}
    hiddenRegistersNames={emulator.hiddenRegisters}
    bind:visible={testcasesVisible}
    {testcasesResult}
    bind:testcases
/>
<ToggleableDraggable title="Call stack" left={300}>
    <CallStack
        stack={emulator.callStack}
        onGoToInstruction={(address) => {
            const location = emulator.getSourceLocationFromAddress(address)
            if (!location) return
            void revealSourceLocation(location.file, location.line)
        }}
        onGoToLabel={(label) => {
            if (!label.file) return
            void revealSourceLocation(label.file, label.line)
        }}
    />
</ToggleableDraggable>

<ToggleableDraggable title="History" left={500}>
    <MutationsViewer
        statusRegisterNames={emulator.statusRegisters.map((r) => r.name)}
        on:undo={(e) => {
            const amount = e.detail
            emulator.undo(amount)
            revealCurrentInstruction()
        }}
        on:highlight={(e) => {
            const step = e.detail
            if (!step.file) return
            void revealSourceLocation(step.file, step.line, 0)
        }}
        steps={emulator.latestSteps}
    />
</ToggleableDraggable>
{#each emulator.memory.tabs as tab, i (tab.id)}
    <MemoryTab
        endianess={tab.endianess}
        {tab}
        defaultMemoryValue={DEFAULT_MEMORY_VALUE[language]}
        memorySize={MEMORY_SIZE[language]}
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
            class:redBorder={emulator.errors.length > 0 ||
                activeDiagnostics.some((diagnostic) => diagnostic.severity === 'error')}
        >
            {#key language}
                {#if hasProjectFiles && files && entry && fileSystem}
                    <FileSidebar
                        {name}
                        {files}
                        {entry}
                        {fileSystem}
                        selectedPath={displayedPath}
                        locked={fileSystemLocked}
                        {diagnosticCounts}
                        analysisStatus={sourceView === 'live'
                            ? languageAnalysis?.fileStatus
                            : undefined}
                        bind:open={fileSidebarOpen}
                        onSelect={selectDisplayedFile}
                        onEntryChange={(path) => {
                            entry = path
                            changed()
                        }}
                        onRenamed={(from, to) => {
                            moveFileBreakpoints(from, to)
                        }}
                        onDeleted={(path) => {
                            moveFileBreakpoints(path)
                        }}
                    />
                {/if}
                <div class="source-identity" title={displayedPath}>
                    <span>{sourceView === 'snapshot' ? 'Build snapshot' : 'Live file'}</span>
                    <strong>{displayedPath || '(no file)'}</strong>
                    {#if displayedAnalysisStatus === 'not-reachable'}
                        <em title="This File is not analyzed from the current Entry"
                            >Not analyzed from Entry</em
                        >
                    {:else if sourceView === 'live' && !languageAnalysis}
                        <em>Analyzing…</em>
                    {/if}
                </div>
                <Editor
                    modelKey={displayedModelKey}
                    modelIdentity={displayedModelIdentity}
                    {retainedModelKeys}
                    viewZones={sourceView === 'snapshot' &&
                    preferencesStore.values.showPseudoInstructions.value
                        ? emulator.decorations
                              .filter(
                                  (decoration) =>
                                      (decoration.file ?? emulator.buildSources?.entry) ===
                                      displayedPath
                              )
                              .map((decoration) => {
                                  return {
                                      afterLineNumber: decoration.belowLine,
                                      content: BelowLineContent,
                                      props: {
                                          md: decoration.md,
                                          note: decoration.note ?? '',
                                          instructions: decoration.instructions,
                                          currentAddress: emulator.pc
                                      }
                                  }
                              })
                        : []}
                    on:change={(event) => handleDisplayedFileChange(event.detail)}
                    on:breakpointPress={(event) => {
                        emulator.toggleBreakpoint(event.detail - 1, displayedPath)
                    }}
                    bind:editor
                    code={displayedCode}
                    codeOverride={hasProjectFiles ? undefined : emulator.compiledCode}
                    breakpoints={(sourceView === 'snapshot' || !fileSystemLocked
                        ? emulator.breakpoints
                        : []
                    )
                        .filter((breakpoint) => breakpoint.file === displayedPath)
                        .map((breakpoint) => breakpoint.line)}
                    breakpointsEditable={canEditProjectBreakpoints(sourceSelection, {
                        readonly,
                        building,
                        fileSystemLocked
                    })}
                    diagnostics={displayedDiagnostics}
                    language={displayedLanguage}
                    highlightedLine={isCurrentBuildLocation(
                        sourceSelection,
                        buildGeneration,
                        emulator.currentFile
                    )
                        ? emulator.line
                        : -1}
                    disabled={readonly ||
                        running ||
                        building ||
                        sourceView === 'snapshot' ||
                        displayedFile?.encoding !== 'plain' ||
                        fileSystemLocked ||
                        (emulator.canExecute && !emulator.terminated) ||
                        !!emulator.compiledCode}
                    hasError={emulator.errors.length > 0}
                />
                {#if displayedFile?.encoding === 'base64'}
                    <div class="binary-file">
                        <div class="binary-source-identity">
                            {sourceView === 'snapshot' ? 'Build snapshot' : 'Live file'} ·
                            {displayedPath}
                        </div>
                        <h2>Binary file</h2>
                        <p>
                            {displayedPath} is preserved as exact bytes and is not editable as text.
                        </p>
                    </div>
                {:else if !displayedFile}
                    <div class="binary-file">
                        <div class="binary-source-identity">
                            {sourceView === 'snapshot' ? 'Build snapshot' : 'Live file'} ·
                            {displayedPath || '(no file)'}
                        </div>
                        <h2>File not found</h2>
                        <p>
                            {displayedPath || 'The configured Entry path'} does not currently name a File.
                        </p>
                    </div>
                {/if}
            {/key}
        </div>

        <Controls
            {running}
            {building}
            hasTests={testcases.length > 0}
            hasErrorsInTests={testcasesResult.some((r) => !r.passed)}
            hasNoErrorsInTests={testcasesResult.every((r) => r.passed) &&
                testcasesResult.length > 0}
            canEditTests={testcasesEditable}
            executionDisabled={readonly || emulator.terminated || emulator.interrupt !== undefined}
            undoDisabled={readonly || emulator.interrupt !== undefined}
            buildDisabled={readonly || liveBuildHasErrors}
            hasCompiled={emulator.canExecute || !!emulator.compiledCode}
            canUndo={emulator.canUndo}
            on:edit-tests={() => {
                toggleWindow('testcases')
            }}
            on:test={async () => {
                if (building || running) return
                running = true
                setTimeout(async () => {
                    try {
                        testcasesResult = await emulator.test(
                            sourceInput,
                            $state.snapshot(testcases),
                            TESTCASE_INSTRUCTION_LIMIT,
                            effectiveSettings.maxHistorySize
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
                await startRun()
            }}
            on:pause={() => {
                emulator.pause()
            }}
            on:build={async () => {
                await buildCode()
            }}
            on:step={async () => {
                await stepCode()
            }}
            on:undo={() => {
                try {
                    emulator.undo()
                    revealCurrentInstruction()
                } catch (e) {
                    console.error(e)
                    toast.error('Error executing undo ' + getM68kErrorMessage(e))
                }
            }}
            on:stop={() => {
                emulator.clear()
                emulator.setSources(sourceInput)
                running = false
                testcasesResult = []
                returnToLiveFiles()
            }}
        />
    </div>
    <div class="right-side">
        <div class="memory-wrapper">
            <div class="column registers-column" style="gap: 0.4rem">
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
                    style="flex: 1; min-height: 0;"
                    hiddenRegistersNames={emulator.hiddenRegisters}
                    registers={emulator.registers}
                    on:registerClick={async (e) => {
                        const value = e.detail.value
                        const clampedSize =
                            value - (value % BigInt(emulator.memory.global.pageSize))
                        emulator.setGlobalMemoryAddress(
                            clampBigInt(clampedSize, 0n, MEMORY_SIZE[language])
                        )
                    }}
                />
            </div>

            <div class="column" style="gap: 0.4rem; height: 100%">
                {#if preferencesStore.values.showMemory.value && (!children || !(!running && !(emulator.canExecute || !!emulator.compiledCode)))}
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
                {:else if !running && children}
                    <Card
                        background="secondary"
                        style="padding: 1rem; overflow-y: auto; width: 31.3rem; height: 33.25rem;"
                    >
                        {@render children()}
                    </Card>
                {:else}
                    <button
                        style="background: transparent; height: 100%; cursor: pointer"
                        onclick={() => preferencesStore.setValue('showMemory', true)}
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
            diagnostics={activeDiagnostics}
            onDiagnosticSelect={(diagnostic) => void revealDiagnostic(diagnostic)}
        />
        {#if showScreen}
            <ScreenRenderer
                name={language}
                screen={emulator.peripherals.screen}
                keyboard={emulator.peripherals.keyboard}
                mouse={emulator.peripherals.mouse}
                actualSizeZoom={configurableDisplay ? currentDisplay.unitWidth : 1}
                style="height: 26rem; flex: none;"
            >
                {#snippet configuration()}
                    {#if configurableDisplay}
                        <ScreenDisplayConfiguration
                            display={currentDisplay}
                            origin={displayOrigin}
                            baseLabel={displayBaseLabel}
                            onChange={applyDisplay}
                        />
                    {/if}
                {/snippet}
            </ScreenRenderer>
        {/if}
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
                min-height: calc(var(--screen-height) * 0.7);
            }

            .editor-border {
                position: relative;
                display: flex;
                flex: 1;
                padding: 0.2rem;
                margin-left: -0.2rem;
                border-radius: 0.5rem;
            }

            .source-identity {
                position: absolute;
                z-index: 3;
                right: 0.9rem;
                bottom: 0.7rem;
                display: flex;
                max-width: calc(100% - 4.5rem);
                gap: 0.45rem;
                padding: 0.25rem 0.45rem;
                border-radius: 0.3rem;
                color: var(--secondary-text);
                background: color-mix(in srgb, var(--secondary) 92%, transparent);
                box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
                font-size: 0.72rem;

                span {
                    flex: none;
                    opacity: 0.65;
                }

                strong {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                em {
                    flex: none;
                    color: var(--warning, #d49a30);
                    font-style: normal;
                }
            }

            .binary-file {
                position: absolute;
                z-index: 3;
                inset: 0.2rem;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                padding: 2rem;
                border-radius: 0.4rem;
                color: var(--secondary-text);
                background: var(--secondary);
                text-align: center;

                p {
                    max-width: 30rem;
                    opacity: 0.72;
                }

                .binary-source-identity {
                    margin-bottom: 1rem;
                    font-size: 0.75rem;
                    opacity: 0.65;
                }
            }
        }

        .memory-wrapper {
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

    .right-side {
        margin-left: 0.5rem;
        width: min-content;
        gap: 0.4rem;
        max-height: calc(var(--screen-height) - 4.2rem);
        padding-top: 0.2rem;
        display: flex;
        overflow-y: auto;
        flex-direction: column;
    }

    .registers-column {
        min-height: 0;
        height: 33.25rem;
        overflow: hidden;
    }

    @media screen and (max-width: 1000px) {
        .only-desktop {
            display: none;
        }
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
        .registers-column {
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
    }

    .redBorder {
        &::before {
            background: linear-gradient(60deg, hsl(359, 85%, 66%), hsl(0, 85%, 66%));
        }
    }
</style>
