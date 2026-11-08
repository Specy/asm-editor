<script lang="ts">
    import { onMount, untrack } from 'svelte'
    import InteractiveInstructionEditor, {
        hasBuiltProgram
    } from '#cmp/shared/InteractiveInstructionEditor.svelte'
    import type { Emulator } from '#lib/languages/Emulator.ts'
    import { EMBED_BUILT_MESSAGE, type EmbedBuiltMessage } from '#lib/content/embedMessages.ts'
    import {
        type AvailableLanguages,
        cleanTestcases,
        makeProject,
        type Project,
        type Testcase
    } from '#lib/Project.svelte.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import { page } from '$app/state'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Column from '#cmp/shared/layout/Column.svelte'
    import InstructionSetPicker from '#cmp/shared/input/InstructionSetPicker.svelte'
    import TabStrip from '#cmp/shared/input/TabStrip.svelte'
    import Switch from '#cmp/shared/input/Switch.svelte'
    import Title from '#cmp/shared/layout/Header.svelte'
    import TestcasesEditor from '#cmp/specific/project/testcases/TestcasesEditor.svelte'
    import { testcaseRegisters, type TestcaseRegisters } from '#lib/testcases.ts'
    import type { RegisterSize } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { viewStore } from '#stores/view.ts'
    import { BASE_CODE, LANGUAGE_THEMES } from '#lib/Config.ts'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import EmulatorLoader from '#cmp/shared/providers/EmulatorLoader.svelte'
    import { copyText, createShareLink } from '#lib/utils.ts'
    import { toast } from '#stores/toastStore.ts'
    import FaExternal from '~icons/fa-solid/external-link-alt'
    import FaCopy from '~icons/fa-solid/copy'
    import FaPen from '~icons/fa-solid/pen'
    import FaPlus from '~icons/fa-solid/plus'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import CopyButton from '#cmp/shared/button/CopyButton.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import { languageHasScreen } from '#lib/languages/peripherals/peripheralSet.ts'
    import ThemeScope from '#cmp/shared/providers/ThemeScope.svelte'
    import {
        decodePlaygroundProgram,
        playgroundBuildSources
    } from '#lib/content/playgroundProgram.ts'
    import {
        embedQuery,
        readEmbedCode,
        readEmbedSettings,
        readEmbedTestcases,
        type EmbedSettings
    } from '#lib/content/embedUrl.ts'

    import { sourceLanguage } from '#lib/sourceCompilation/records.ts'

    /** A switch of the builder, each a setting of the URL it writes. */
    type EmbedSwitch = {
        key: Exclude<keyof EmbedSettings, 'language' | 'registerFile'>
        label: string
        description?: string
    }
    /** What the embedded editor shows. */
    const panelSwitches: EmbedSwitch[] = [
        { key: 'showRegisters', label: 'Registers' },
        { key: 'showMemory', label: 'Memory' },
        { key: 'showConsole', label: 'Console' },
        { key: 'showScreen', label: 'Screen' },
        { key: 'showFlags', label: 'Flags' },
        { key: 'showPc', label: 'PC', description: 'The program counter, beside the registers' },
        {
            key: 'showCycles',
            label: 'Cycles',
            description: 'The clock cycles the program has taken so far, on M68K'
        }
    ]
    /** How it starts and what it offers. */
    const behaviourSwitches: EmbedSwitch[] = [
        {
            key: 'openScreen',
            label: 'Screen starts open',
            description: 'Show the screen unfolded when the page opens'
        },
        {
            key: 'hideUntilBuilt',
            label: 'Hide panels until built',
            description: 'Show the memory, registers and screen only once the code is built'
        },
        {
            key: 'openButton',
            label: 'Open in editor button',
            description: 'A button that opens the program in the editor, in a new tab'
        }
    ]
    /** Whether readers get the Testcases button, beside the Testcases themselves. */
    const testcasesSwitch: EmbedSwitch = {
        key: 'showTests',
        label: 'Testcases button',
        description: 'A button that shows readers the Testcases, which they cannot change'
    }

    /** The Share Card's tabs: the link, or the HTML that frames it; Copy copies the one shown. */
    type ShareFormat = 'link' | 'html'
    let shareFormat: ShareFormat = $state('link')
    const shareTabs: { id: ShareFormat; label: string; hint: string }[] = [
        {
            id: 'link',
            label: 'Link',
            hint: 'A page with only this editor on it, to send to someone or to open in a frame of your own.'
        },
        {
            id: 'html',
            label: 'HTML',
            hint: 'Paste this HTML into your web page to show the editor there.'
        }
    ]
    const sharePanelId = 'share-panel'

    /**
     * The builder's settings: what its URL asks for, with the panels hidden until built and the
     * Open in editor button on unless the URL says otherwise, as most embeds want them. A link with
     * a program in it (the builder's own always names the language) keeps what it says, since it
     * leaves out the switches that are off, but for the Testcases button of a link without
     * Testcases, which it writes as off whatever the switch says (`testcasesShown`): the button
     * comes back on with the first Testcase. A framed embed reads its URL as it is, a missing
     * parameter being off, so the links already handed out keep their look.
     */
    function builderSettings(params: Pick<URLSearchParams, 'get' | 'has'>): EmbedSettings {
        const read = readEmbedSettings(params)
        const written = ['language', 'code', 'program'].some((name) => params.has(name))
        return {
            ...read,
            hideUntilBuilt: written || params.has('hideUntilBuilt') ? read.hideUntilBuilt : true,
            openButton: written || params.has('openButton') ? read.openButton : true,
            showTests: params.has('testcases') ? read.showTests : true
        }
    }

    /** Whether the embed has a Testcases button: asked for, and with Testcases to show in it. */
    function testcasesShown(settings: EmbedSettings, testcases: Testcase[]) {
        return settings.showTests && testcases.length > 0
    }

    //the page is drawn in the browser only (`+layout.ts`), so it knows from its first frame whether
    //it is framed, and draws the builder or the bare editor from the start
    const framed = typeof window === 'undefined' || window.self !== window.top
    //what a URL without parameters asks for, until the page reads its own once mounted
    const blank = readEmbedSettings(new URLSearchParams())
    let settings: EmbedSettings = $state(framed ? blank : builderSettings(new URLSearchParams()))
    let inIframe = $state(framed)
    //framed by one of our own pages (a lecture, the documentation), whose sections already sit
    //apart by the Workbench's gap: the frame's own padding is that gap, so its cards line up with
    //the page's. A frame on someone else's site keeps the roomier padding
    let framedByUs = $state(false)
    let code = $state(BASE_CODE[blank.language])
    let project = $state<Project>()
    let loadedEmulator = $state<Emulator | null>(null)
    let ready = $state(false)
    let testcases = $state([] as Testcase[])
    let generatedCode = $state('')
    let generatedIframeCode = $derived(
        `<iframe src="${generatedCode}" style="border: none; border-radius: 0.8rem; width: 100%; min-height: 20.8rem;"></iframe>`
    )
    const shareText = $derived(shareFormat === 'link' ? generatedCode : generatedIframeCode)
    const shareName = $derived(shareFormat === 'link' ? 'Embed link' : 'Embed HTML')
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    onMount(() => {
        inIframe = window.self !== window.top
        framedByUs = inIframe && framedBySameOrigin()
        const params = page.url.searchParams
        settings = inIframe ? readEmbedSettings(params) : builderSettings(params)
        code = readEmbedCode(params) ?? BASE_CODE[settings.language]
        testcases = cleanTestcases(readEmbedTestcases(params))
        const encoded = params.get('program')
        if (encoded) {
            try {
                project = makeProject({
                    ...decodePlaygroundProgram(encoded),
                    language: settings.language
                })
            } catch (error) {
                toast.error(`Cannot load playground files: ${String(error)}`)
            }
        }
        ready = true
        return () => clearTimeout(timeoutId)
    })

    /**
     * The Project the editor opens: the files, or the code, with the embed's Testcases, which are
     * its one Program's (programs.md, decision 12); a Project's own `programs` would win over
     * Testcases given beside them.
     */
    function editorProject() {
        if (!project) return makeProject({ code, language: settings.language, testcases })
        const data = project.toObject()
        const entry = data.selectedProgram
        if (entry === undefined) return makeProject(data)
        return makeProject({
            ...data,
            programs: { ...data.programs, [entry]: { ...data.programs[entry], testcases } }
        })
    }

    function openInEditor() {
        const opened = editorProject()
        try {
            window.open(createShareLink(opened), '_blank')
        } catch (error) {
            console.error(error)
            toast.error('This program is too large to open in the editor through a link')
        }
    }

    /** Another instruction set starts the embed over on that set's own code; the one picked
     *  already keeps the code written. */
    function pickLanguage(picked: AvailableLanguages) {
        if (picked === settings.language) return
        settings.language = picked
        changeLanguage(picked)
    }

    /**
     * The Settings' Testcases window, the one place they are written: the preview shows them as
     * readers get them, which they cannot change. The registers a Testcase can name and the
     * Target's width are the preview's emulator's, read when the window opens, so it waits for
     * the emulator of the set picked: after another set is picked, the bound emulator is the old
     * set's until the new one has loaded.
     */
    let testcasesOpen = $state(false)
    let testcaseTarget = $state<{ registers: TestcaseRegisters; systemSize: RegisterSize }>()
    let emulatorLanguage = $state<AvailableLanguages>()
    $effect(() => {
        if (loadedEmulator) emulatorLanguage = untrack(() => settings.language)
    })
    const testcasesHintId = 'testcases-hint'
    const testcasesEditable = $derived(!!loadedEmulator && emulatorLanguage === settings.language)
    const testcasesCount = $derived(
        testcases.length === 0
            ? 'No Testcases yet'
            : testcases.length === 1
              ? '1 Testcase'
              : `${testcases.length} Testcases`
    )

    function editTestcases() {
        if (!loadedEmulator || !testcasesEditable) return
        testcaseTarget = {
            registers: testcaseRegisters(loadedEmulator),
            systemSize: loadedEmulator.systemSize
        }
        testcasesOpen = true
    }

    function changeLanguage(language: AvailableLanguages) {
        code = BASE_CODE[language]
        if (project) {
            const previous = project
            const entry = previous.selectedProgram
            const source = previous.compilations.find(
                (record) => record.outputPath === entry
            )?.sourcePath
            project = makeProject({
                files: previous.files,
                entry: source ?? entry,
                language
            })
        }
    }

    function framedBySameOrigin() {
        try {
            return window.parent.location.origin === window.location.origin
        } catch {
            //another origin's location is not ours to read
            return false
        }
    }

    function createCodeUrl(code: string, settings: EmbedSettings, testcases: Testcase[]) {
        const entry = project?.selectedProgram
        const program =
            project && entry !== undefined
                ? {
                      files: $state.snapshot(project.files),
                      entry,
                      compilations: project.compilations
                  }
                : undefined
        const query = embedQuery(
            { ...settings, showTests: testcasesShown(settings, testcases) },
            {
                code,
                program,
                testcases: $state.snapshot(testcases)
            }
        )
        return `${window.location.origin}/embed?${query}`
    }

    function generateCodeUrl(code: string, settings: EmbedSettings, testcases: Testcase[]) {
        clearTimeout(timeoutId)
        viewStore(settings)
        timeoutId = setTimeout(() => {
            generatedCode = createCodeUrl(code, settings, testcases)
        }, 1000)
    }

    $effect(() => {
        if (!ready) return
        //Include file edits and generated assembly in standalone embed/share URLs too.
        if (project) {
            void project.files
            void project.selectedProgram
            void project.compilations
        }
        //and every edit inside a Testcase, which the Testcases window makes in place
        viewStore(testcases)
        generateCodeUrl(code, settings, testcases)
    })

    //a frame whose panels wait for a Build tells the page around it when they come and go, so a
    //lecture can keep the frame as short as the code until then (`embedMessages.ts`)
    $effect(() => {
        if (!inIframe || !settings.hideUntilBuilt) return
        const built = !!loadedEmulator && hasBuiltProgram(loadedEmulator)
        window.parent.postMessage(
            { type: EMBED_BUILT_MESSAGE, built } satisfies EmbedBuiltMessage,
            '*'
        )
    })
</script>

<svelte:head>
    <title>Embed - ASM Editor</title>
    <meta name="description" content="Embed an assembly emulator in your website" />
    <meta property="og:title" content="Embed - ASM Editor" />
    <meta property="og:description" content="Embed an assembly emulator in your website" />
</svelte:head>

<!-- The colours of the language the embed is showing, the way `/documentation/<language>` and a
     Language course do: an embed is nearly always framed inside one of those pages, and one that
     kept the app's own colours would be the one purple-less rectangle on a MIPS page. Standalone,
     it doubles as the preview of what the generated iframe will look like. -->
<ThemeScope theme={LANGUAGE_THEMES[settings.language]}>
    {#if inIframe}
        <!-- framed: the editor alone, filling the frame -->
        <Page fillsScreen>
            <div class="playground" style="display: contents">
                <div style="display: contents">
                    <Column
                        style={`--embed-padding: ${framedByUs ? 'var(--wb-gap)' : '0.5rem'}; padding: var(--embed-padding) var(--embed-padding) var(--embed-padding); flex:1; min-width: 0`}
                    >
                        {@render editor()}
                    </Column>
                </div>
            </div>
        </Page>
    {:else}
        <DefaultNavbar />
        <!-- a tool page: its title at the left of the 70rem column, as the other index and tool
             pages' are (design-system.md, D8), the preview over the settings and the output -->
        <Page hasNavbar cropped="70rem" contentStyle="padding: 1rem">
            <div class="embed-page">
                <header class="page-head">
                    <Title>Embed a program</Title>
                    <p class="lead">Put a working editor with your program on any web page.</p>
                </header>

                <Card element="section" aria-labelledby="preview-title">
                    <div class="card-head">
                        <h2 id="preview-title">Preview</h2>
                        <p class="hint">
                            The embed as readers will see it, starting with the code you leave here.
                        </p>
                    </div>
                    <div class="card-body preview-body">
                        <!-- the generated iframe's box with the frame's own page in it, its
                             background and its 0.5rem of padding, so the editor sits here as it
                             will there -->
                        <div class="stage">
                            <div class="stage-page">
                                {@render editor()}
                            </div>
                        </div>
                    </div>
                </Card>

                <div class="embed-row">
                    <!-- the create page's look (its mockup of 2026-11-08): each group under a
                         header band, the instruction sets as its tiles, the switches on its
                         fields' fill -->
                    <Card element="section" aria-labelledby="settings-title">
                        <div class="card-head">
                            <h2 id="settings-title">Settings</h2>
                        </div>
                        <section aria-labelledby="language-title">
                            <h3 class="band first" id="language-title">Instruction set</h3>
                            <div class="section">
                                <!-- the tiles alone, without the create page's line on the
                                     set picked (owner, 2026-11-08) -->
                                <InstructionSetPicker
                                    selected={settings.language}
                                    onSelect={pickLanguage}
                                    description={false}
                                />
                            </div>
                        </section>
                        <section aria-labelledby="panels-title">
                            <h3 class="band" id="panels-title">Panels</h3>
                            <div class="section">
                                <div class="settings-grid panels">
                                    {#each panelSwitches as entry (entry.key)}
                                        {@render switchRow(entry)}
                                    {/each}
                                </div>
                            </div>
                        </section>
                        <section aria-labelledby="behaviour-title">
                            <h3 class="band" id="behaviour-title">Behaviour</h3>
                            <div class="section">
                                <div class="settings-grid pairs">
                                    {#each behaviourSwitches as entry (entry.key)}
                                        {@render switchRow(entry)}
                                    {/each}
                                </div>
                            </div>
                        </section>
                        <section aria-labelledby="testcases-title">
                            <h3 class="band" id="testcases-title">Testcases</h3>
                            <div class="section">
                                <div class="settings-grid pairs">
                                    <div class="setting-row">
                                        <span class="ellipsis">{testcasesCount}</span>
                                        <Button
                                            kind="secondary"
                                            size="sm"
                                            aria-label={testcases.length > 0
                                                ? 'Edit Testcases'
                                                : 'Add Testcases'}
                                            disabled={!testcasesEditable}
                                            onClick={editTestcases}
                                        >
                                            {#if testcases.length > 0}
                                                <Icon size="caption"><FaPen /></Icon>
                                                Edit
                                            {:else}
                                                <Icon size="caption"><FaPlus /></Icon>
                                                Add
                                            {/if}
                                        </Button>
                                    </div>
                                    <!-- off, and not to be turned on, until there is a Testcase
                                         to show: the line under the rows says why -->
                                    <div class="setting-row">
                                        <span class="ellipsis">{testcasesSwitch.label}</span>
                                        {#if testcases.length > 0}
                                            <Switch
                                                bind:checked={settings.showTests}
                                                aria-label={testcasesSwitch.label}
                                                {@attach tooltip(testcasesSwitch.description)}
                                            />
                                        {:else}
                                            <Switch
                                                checked={false}
                                                disabled
                                                aria-label={testcasesSwitch.label}
                                                aria-describedby={testcasesHintId}
                                            />
                                        {/if}
                                    </div>
                                </div>
                                <p class="section-hint" id={testcasesHintId}>
                                    {#if testcases.length > 0}
                                        Readers press Test to check their program against them.
                                    {:else}
                                        Add a Testcase to show them. Readers press Test to check
                                        their program against them.
                                    {/if}
                                </p>
                            </div>
                        </section>
                    </Card>

                    <Card element="section" aria-labelledby="share-title">
                        <div class="card-head">
                            <h2 id="share-title">Share</h2>
                        </div>
                        <!-- Link · HTML over the tab's hint and code, framed together inside the
                             Card's body as a field is; Copy under them, as wide -->
                        <div class="card-body share-body">
                            <div class="share-frame">
                                <TabStrip
                                    ariaLabel="What to share"
                                    tabs={shareTabs}
                                    selected={shareFormat}
                                    panelId={() => sharePanelId}
                                    onselect={(id) => (shareFormat = id as ShareFormat)}
                                />
                                <div
                                    class="share-panel"
                                    id={sharePanelId}
                                    role="tabpanel"
                                    aria-label={shareFormat === 'link' ? 'Link' : 'HTML'}
                                >
                                    <!-- both tabs' hints laid out in the one cell, the other
                                         one unseen, so the cell is as tall as the taller at any
                                         width and the code under it stays put when the tab
                                         changes (owner, 2026-11-08) -->
                                    <div class="hint-cell">
                                        {#each shareTabs as tab (tab.id)}
                                            <p
                                                class="hint"
                                                class:sizer={tab.id !== shareFormat}
                                                id={tab.id === shareFormat
                                                    ? 'share-hint'
                                                    : undefined}
                                                aria-hidden={tab.id === shareFormat
                                                    ? undefined
                                                    : 'true'}
                                            >
                                                {tab.hint}
                                            </p>
                                        {/each}
                                    </div>
                                    <textarea
                                        class="share-code"
                                        aria-label={shareName}
                                        aria-describedby="share-hint"
                                        readonly
                                        spellcheck="false"
                                        value={shareText}></textarea>
                                </div>
                            </div>
                            <CopyButton
                                style="width: 100%; gap: 0.5rem"
                                disabled={!generatedCode}
                                copy={() => copyText(shareText, shareName)}
                            >
                                <Icon size="small"><FaCopy /></Icon>
                                Copy
                            </CopyButton>
                        </div>
                    </Card>
                </div>
            </div>
        </Page>
        <!-- the Testcases the embed starts with, written here and shown to readers by the
             preview's own Testcases button, which only lists them -->
        {#if testcaseTarget}
            <TestcasesEditor
                bind:visible={testcasesOpen}
                bind:testcases
                testcasesResult={[]}
                registers={testcaseTarget.registers}
                systemSize={testcaseTarget.systemSize}
                language={settings.language}
                editable
            />
        {/if}
    {/if}
</ThemeScope>

<!-- the live editor: the one in the frame, and the builder's preview of it, which is the same
     embedded editor, so that what the author sees is what readers get -->
{#snippet editor()}
    {#if ready}
        {#key settings.language}
            <EmulatorLoader
                bind:code
                bind:emulator={loadedEmulator}
                source={project ? playgroundBuildSources(project) : undefined}
                language={settings.language}
                settings={{
                    automaticChecking: !project || !sourceLanguage(project.selectedProgram ?? ''),
                    globalPageElementsPerRow: 4,
                    globalPageSize: 4 * 8
                }}
            >
                {#snippet children(emulator)}
                    <InteractiveInstructionEditor
                        {emulator}
                        {project}
                        bind:code
                        bind:testcases
                        embedded
                        showConsole={settings.showConsole}
                        showMemory={settings.showMemory}
                        showTestcases={testcasesShown(settings, testcases)}
                        showPc={settings.showPc}
                        showRegisters={settings.showRegisters}
                        showFlags={settings.showFlags}
                        showCycles={settings.showCycles}
                        showScreen={settings.showScreen && languageHasScreen(settings.language)}
                        openScreen={settings.openScreen}
                        hideUntilBuilt={settings.hideUntilBuilt}
                        initialRegisterFile={settings.registerFile}
                        language={settings.language}
                        forceMemoryRight={true}
                        dockActions={settings.openButton
                            ? [
                                  {
                                      label: 'Open in editor',
                                      title: 'Open this program in the editor, in a new tab',
                                      icon: FaExternal,
                                      onClick: openInEditor
                                  }
                              ]
                            : []}
                    />
                {/snippet}
                {#snippet loading()}
                    <Spinner size="lg" label="Loading emulator…" />
                {/snippet}
            </EmulatorLoader>
        {/key}
    {/if}
{/snippet}

<!-- a setting's name and its switch, in one row; a switch with a Tooltip is named by aria-label
     in place of the title that repeats its label (ADR 0064) -->
{#snippet switchRow({ key, label, description }: EmbedSwitch)}
    <div class="setting-row">
        <span class="ellipsis">{label}</span>
        <Switch
            bind:checked={settings[key]}
            aria-label={description ? label : undefined}
            title={description ? undefined : label}
            {@attach tooltip(description)}
        />
    </div>
{/snippet}

<style lang="scss">
    @use '../../styles/field.scss';

    /* the title at the other index pages' height (S4-06), and room under the cards; on the
       narrowest phones the column's gutter is halved, so that the preview's registers, 18rem at
       the least, still fit inside its Card */
    .embed-page {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
        padding-top: 0.5rem;
        padding-bottom: 4rem;

        @media screen and (max-width: 650px) {
            padding: 0.5rem 0 3rem;
        }

        @media screen and (max-width: 359px) {
            width: auto;
            margin-inline: -0.5rem;
        }
    }

    /* the title a step of the scale down (`--fs-h2`, where the other pages' is `--fs-h1`), with
       less room above and under it, as the exam builder's (O-92), so the Preview starts higher
       (the owner's exception for this page) */
    .page-head :global(h1) {
        margin: 0 0 0.35rem;
        font-size: var(--fs-h2);
    }

    .lead {
        margin: 0;
        line-height: 1.6;
        color: var(--text-muted);
    }

    h2 {
        margin: 0;
        font: 600 var(--fs-prose) / 1.3 var(--font-ui);
    }

    .hint {
        margin: 0;
        font-size: var(--fs-small);
        line-height: 1.45;
        color: var(--text-muted);
    }

    /* each Card's title over a rule across it, as the create page's footer is ruled off, the
       three at the same snug height */
    .card-head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.25rem 1rem;
        padding: 0.6rem 1.25rem;
        border-bottom: 1px solid var(--line);

        @media (max-width: 600px) {
            padding: 0.6rem 1rem;
        }
    }

    /* the generated iframe's box (its HTML's `width: 100%; min-height: 20.8rem`, which a frame
       takes as its height, and its 0.8rem corners), standing for the frame's screen to what it
       holds: its height is the screen's (`--screen-height`, which the editor holds its registers
       card to and the Testcases window takes its height from), and what floats over the screen
       floats over this box, the containing block of what is fixed in it (layout containment),
       and a container, which `100cqw` is the width of */
    .stage {
        --screen-height: 20.8rem;
        --embed-padding: 0.5rem;
        display: flex;
        flex-direction: column;
        height: var(--screen-height);
        overflow: hidden;
        contain: layout;
        container-type: inline-size;
        border-radius: 0.8rem;
        background-color: var(--background);
        color: var(--background-text);

        /* the readers' Testcases window as wide as this box, as a frame's is as wide as the
           frame, where it says the width of the screen (FloatingContainer) */
        :global(.floating-place) {
            width: 100cqw;
        }

        :global(.floating-container) {
            max-width: calc(100cqw - 2rem);
        }
    }

    /* the frame's own page: its colour and 0.5rem of padding, the editor filling it, and
       scrolling inside the box when the editor is taller, as a frame's document does */
    .stage-page {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
        padding: var(--embed-padding);
        overflow-y: auto;
    }

    /* on a phone, closer to the Card's edges, so that the box is as wide as a frame on a phone's
       page would be and the registers, 18rem at the least, fit in it as they would there */
    .card-body.preview-body {
        @media (max-width: 400px) {
            padding: 0.5rem;
        }
    }

    /* the settings and the output side by side, the settings a little wider for the instruction
       sets' tiles; stacked on a phone. Each Card as tall as what it holds, from the row's top: the
       Share Card does not stretch to the settings' height (owner, 2026-11-08) */
    .embed-row {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
        gap: 1rem;
        align-items: start;

        @media (max-width: 800px) {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    /* under the rule, at the head's side padding */
    .card-body {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 1rem;
        padding: 1.25rem;

        @media (max-width: 600px) {
            padding: 1rem;
        }
    }

    /* a group's header, as the create page's: a band a shade lighter than the Card over a rule,
       as the Workbench's folding sections draw theirs (CollapsibleSection), ruled off above too
       but for the first, which the Card's head already rules off */
    .band {
        margin: 0;
        padding: 0.6rem 1.25rem;
        background-color: var(--wb-section-header);
        border-block: 1px solid var(--line);
        font: 700 var(--fs-small) / 1.4 var(--font-ui);
        color: var(--secondary-text);

        &.first {
            border-top: none;
        }
    }

    /* what the band heads, as the create page's sections space theirs; the box the settings'
       columns are counted against */
    .section {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0.85rem 1.25rem 1rem;
        container-type: inline-size;
    }

    @media (max-width: 600px) {
        .band {
            padding: 0.55rem 1rem;
        }
        .section {
            padding: 0.8rem 1rem 1rem;
        }
    }

    /* the panels' short names three to a row, under the instruction sets' tiles and as far apart,
       or two where the tiles go two to a row; the longer behaviours and the Testcases two to a row
       while they fit, else one */
    .settings-grid {
        display: grid;
        gap: 0.4rem;
    }

    .settings-grid.panels {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .settings-grid.pairs {
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 14.5rem), 1fr));
    }

    @container (max-width: 23.5rem) {
        .settings-grid.panels {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    /* a setting's name and its control in one row, on a field's fill inside its edge
       (styles/field.scss) as the instruction sets' tiles above them are, and as tall as a tile */
    .setting-row {
        @include field.surface;
        display: flex;
        gap: 0.6rem;
        align-items: center;
        justify-content: space-between;
        min-width: 0;
        min-height: calc(1.5rem + var(--fs-small) * 1.3 + 2px);
        padding: 0.3rem 0.5rem 0.3rem 0.8rem;
        font-size: var(--fs-small);
        line-height: 1.3;

        span {
            min-width: 0;
        }
    }

    /* under the rows, as the create page's line on a template is under its field */
    .section-hint {
        margin: 0;
        font-size: var(--fs-small);
        line-height: 1.45;
        color: var(--text-muted);
    }

    /* the frame and Copy closer together than the settings' groups */
    .share-body {
        gap: 0.75rem;
    }

    /* the tabs and the tab's content framed together as a field is, its edge and corner, inset
       from the Card's edges: the strip a shade darker than the Card across its top, the content
       on the field's fill, and the picked tab in that fill too, open onto it (the strip's picked
       tab is drawn in --secondary, pointed here at the fill). The corners clip the strip's */
    .share-frame {
        --share-fill: #{field.$fill};
        @include field.surface;
        display: flex;
        flex-direction: column;
        overflow: hidden;

        > :global(.tab-strip) {
            --secondary: var(--share-fill);
        }
    }

    /* the hint ruled off from the code under it by the hairline under a header, across the
       frame's full width */
    .share-panel {
        display: flex;
        flex-direction: column;
        padding-top: 0.6rem;
    }

    /* the tab's hint over the other's, unseen: the one grid cell they share takes the taller
       one's height */
    .hint-cell {
        display: grid;
        padding: 0 0.75rem 0.6rem;
        border-bottom: 1px solid var(--line);

        .hint {
            grid-area: 1 / 1;
        }

        .sizer {
            visibility: hidden;
        }
    }

    /* the output, read-only code in Fira Code on the frame's fill, in a box of its own height
       whatever the link's length or the tab, so the Card keeps its height (owner, 2026-11-08):
       a longer text scrolls inside it; the keyboard's ring is the global one, inside its edge */
    .share-code {
        flex: none;
        width: 100%;
        height: 10rem;
        resize: none;
        padding: 0.6rem 0.75rem;
        background-color: transparent;
        color: var(--secondary-text);
        border: none;
        border-radius: 0;
        font: var(--fs-small) / 1.5 var(--font-mono);
        overflow-wrap: anywhere;
        cursor: text;
    }
</style>
