<script lang="ts">
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import { onMount } from 'svelte'
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
    import SegmentedControl from '#cmp/shared/input/SegmentedControl.svelte'
    import TabStrip from '#cmp/shared/input/TabStrip.svelte'
    import Switch from '#cmp/shared/input/Switch.svelte'
    import Title from '#cmp/shared/layout/Header.svelte'
    import { languageAccent } from '#lib/languages/languageColors.ts'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { viewStore } from '#stores/view.ts'
    import { BASE_CODE, LANGUAGE_THEMES } from '#lib/Config.ts'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import EmulatorLoader from '#cmp/shared/providers/EmulatorLoader.svelte'
    import { copyText, createShareLink } from '#lib/utils.ts'
    import { toast } from '#stores/toastStore.ts'
    import FaExternal from '~icons/fa-solid/external-link-alt'
    import FaCopy from '~icons/fa-solid/copy'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
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

    /** The instruction sets in the bar, named and marked with their colour as the create page's
     *  bar does. */
    const LANGUAGES: AvailableLanguages[] = ['M68K', 'MIPS', 'RISC-V', 'RISC-V-64', 'X86', 'Z80']
    const languageOptions = LANGUAGES.map((value) => ({
        id: value,
        label: languageLabel(value),
        iconColor: languageAccent(value)
    }))

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
        },
        { key: 'showTests', label: 'Testcases' }
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

    /** The Share Card's tabs: the link, or the HTML that frames it; Copy copies the one shown. */
    type ShareFormat = 'link' | 'html'
    let shareFormat: ShareFormat = $state('link')
    const shareTabs: { id: ShareFormat; label: string }[] = [
        { id: 'link', label: 'Link' },
        { id: 'html', label: 'HTML' }
    ]
    const sharePanelId = 'share-panel'

    /**
     * The builder's settings: what its URL asks for, with the panels hidden until built and the
     * Open in editor button on unless the URL says otherwise, as most embeds want them. A link with
     * a program in it (the builder's own always names the language) keeps what it says, since it
     * leaves out the switches that are off. A framed embed reads its URL as it is, a missing
     * parameter being off, so the links already handed out keep their look.
     */
    function builderSettings(params: Pick<URLSearchParams, 'get' | 'has'>): EmbedSettings {
        const read = readEmbedSettings(params)
        const written = ['language', 'code', 'program'].some((name) => params.has(name))
        return {
            ...read,
            hideUntilBuilt: written || params.has('hideUntilBuilt') ? read.hideUntilBuilt : true,
            openButton: written || params.has('openButton') ? read.openButton : true
        }
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
    function pickLanguage(id: string) {
        const picked = LANGUAGES.find((value) => value === id)
        if (!picked || picked === settings.language) return
        settings.language = picked
        changeLanguage(picked)
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
        const query = embedQuery(settings, {
            code,
            program,
            testcases: $state.snapshot(testcases)
        })
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
                    <Title style="margin-bottom: 0.5rem">Embed a program</Title>
                    <p class="lead">Put a working editor with your program on any web page.</p>
                </header>

                <Card element="section" padding="0" aria-labelledby="preview-title">
                    <div class="card-head">
                        <h2 id="preview-title">Preview</h2>
                        <p class="hint">
                            The embed starts with the code and Testcases you leave here.
                        </p>
                    </div>
                    <!-- the frame's own page: its background, its 0.5rem of padding and the
                         generated iframe's height, so the editor sits here as it will there -->
                    <div class="stage" style="--embed-padding: 0.5rem">
                        {@render editor()}
                    </div>
                </Card>

                <div class="embed-row">
                    <Card element="section" padding="0" aria-labelledby="settings-title">
                        <div class="card-head">
                            <h2 id="settings-title">Settings</h2>
                        </div>
                        <div class="card-body settings-body">
                            <div class="group language-group">
                                <span class="group-title" aria-hidden="true">Instruction set</span>
                                <SegmentedControl
                                    wrap
                                    size="md"
                                    ariaLabel="Instruction set"
                                    options={languageOptions}
                                    selected={settings.language}
                                    onSelect={pickLanguage}
                                >
                                    {#snippet face(option)}
                                        <span
                                            class="language-square"
                                            style:background-color={option.iconColor}
                                            aria-hidden="true"
                                        ></span>
                                        {option.label}
                                    {/snippet}
                                </SegmentedControl>
                            </div>
                            <section class="group" aria-labelledby="panels-title">
                                <h3 class="group-title" id="panels-title">Panels</h3>
                                <div class="switches panels">
                                    {#each panelSwitches as entry (entry.key)}
                                        {@render switchRow(entry)}
                                    {/each}
                                </div>
                            </section>
                            <section class="group" aria-labelledby="behaviour-title">
                                <h3 class="group-title" id="behaviour-title">Behaviour</h3>
                                <div class="switches behaviour">
                                    {#each behaviourSwitches as entry (entry.key)}
                                        {@render switchRow(entry)}
                                    {/each}
                                </div>
                            </section>
                        </div>
                    </Card>

                    <Card element="section" padding="0" aria-labelledby="share-title">
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
                                    <p class="hint" id="share-hint">
                                        {#if shareFormat === 'link'}
                                            A page with only this editor on it, to send to someone
                                            or to open in a frame of your own.
                                        {:else}
                                            Paste this HTML into your web page to show the editor
                                            there.
                                        {/if}
                                    </p>
                                    <textarea
                                        class="share-code"
                                        aria-label={shareName}
                                        aria-describedby="share-hint"
                                        readonly
                                        spellcheck="false"
                                        value={shareText}></textarea>
                                </div>
                            </div>
                            <Button
                                kind="secondary"
                                style="width: 100%; gap: 0.5rem"
                                disabled={!generatedCode}
                                onClick={() => void copyText(shareText, shareName)}
                            >
                                <Icon size="small"><FaCopy /></Icon>
                                Copy
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </Page>
    {/if}
</ThemeScope>

<!-- the live editor: the one in the frame, and the builder's preview of it -->
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
                        embedded={inIframe}
                        showConsole={settings.showConsole}
                        showMemory={settings.showMemory}
                        showTestcases={settings.showTests}
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
    <div class="switch-row">
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
    @use '../../styles/radius.scss' as *;
    @use '../../styles/field.scss';

    /* the title at the other index pages' height (S4-06), and room under the cards; on the
       narrowest phones the column's gutter is halved, so that the preview's registers, 18rem at
       the least, still fit inside its Card */
    .embed-page {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
        padding-top: 1.5rem;
        padding-bottom: 4rem;

        @media screen and (max-width: 650px) {
            padding: 0.75rem 0 3rem;
        }

        @media screen and (max-width: 359px) {
            width: auto;
            margin-inline: -0.5rem;
        }
    }

    .page-head {
        margin-bottom: 0.5rem;
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

    /* the generated iframe's box (min-height 20.8rem) on its page's colour, the Card's lower
       corners inside its 1px edge */
    .stage {
        display: flex;
        flex-direction: column;
        min-height: 20.8rem;
        padding: var(--embed-padding);
        background-color: var(--background);
        color: var(--background-text);
        border-radius: 0 0 nested-radius(var(--wb-radius), $border: 1px)
            nested-radius(var(--wb-radius), $border: 1px);

        @media screen and (max-width: 359px) {
            padding: 0.25rem;
        }
    }

    /* the settings and the output side by side, the settings a little wider for the instruction
       sets' bar; stacked on a phone */
    .embed-row {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
        gap: 1rem;
        align-items: stretch;

        @media (max-width: 800px) {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    /* under the rule, at the head's side padding; the Share box takes the height left beside the
       settings */
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

    /* a label over its control, as the create page's fields draw theirs */
    .group {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin: 0;
    }

    .group-title {
        margin: 0;
        font: 400 var(--fs-body) / 1.2 var(--font-ui);
    }

    /* drawn as the create page's and the home page's bars draw their squares */
    .language-square {
        flex: none;
        width: 0.5rem;
        height: 0.5rem;
        margin-right: 0.5rem;
        border-radius: 2px;
    }

    .switches {
        display: grid;
        gap: 0.3rem 0.5rem;
    }

    /* the panels' short names two to a row, one on the narrowest phones; the longer behaviours as
       many as fit */
    .switches.panels {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .switches.behaviour {
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
    }

    /* the bar is as wide as the card's body, its six sets in one row while they fit, else two rows
       of three, or three of two on the narrowest, where the panels go one to a row */
    .settings-body {
        container-type: inline-size;
    }

    @container (max-width: 35rem) {
        .language-group {
            --segmented-columns: 3;
        }
    }

    @container (max-width: 18rem) {
        .language-group {
            --segmented-columns: 2;
        }

        .switches.panels {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    .switch-row {
        display: flex;
        gap: 0.6rem;
        align-items: center;
        justify-content: space-between;
        min-height: 2.3rem;
        padding: 0.3rem 0.5rem 0.3rem 0.75rem;
        background-color: var(--wb-section-header);
        border-radius: var(--r-control);
        font-size: var(--fs-small);

        span {
            min-width: 0;
        }
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
        flex: 1;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;

        > :global(.tab-strip) {
            --secondary: var(--share-fill);
        }
    }

    /* the hint ruled off from the code under it by the hairline under a header, across the
       frame's full width */
    .share-panel {
        display: flex;
        flex: 1;
        flex-direction: column;
        padding-top: 0.6rem;

        .hint {
            padding: 0 0.75rem 0.6rem;
            border-bottom: 1px solid var(--line);
        }
    }

    /* the output, read-only code in Fira Code on the frame's fill, taking the rest of the card's
       height beside the settings; the keyboard's ring is the global one, inside its edge */
    .share-code {
        flex: 1;
        width: 100%;
        min-height: 8rem;
        resize: vertical;
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
