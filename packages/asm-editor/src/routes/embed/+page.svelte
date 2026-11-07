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
    import Select from '#cmp/shared/input/Select.svelte'
    import Switch from '#cmp/shared/input/Switch.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { viewStore } from '#stores/view.ts'
    import { BASE_CODE, LANGUAGE_THEMES } from '#lib/Config.ts'
    import Header from '#cmp/shared/layout/Header.svelte'
    import EmulatorLoader from '#cmp/shared/providers/EmulatorLoader.svelte'
    import { copyText, createShareLink } from '#lib/utils.ts'
    import { toast } from '#stores/toastStore.ts'
    import FaExternal from '~icons/fa-solid/external-link-alt'
    import Button from '#cmp/shared/button/Button.svelte'
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

    const languageOptions: Array<{ key: string; value: AvailableLanguages }> = [
        { key: 'M68K', value: 'M68K' },
        { key: 'MIPS', value: 'MIPS' },
        { key: 'RISC-V', value: 'RISC-V' },
        { key: 'RISC-V-64', value: 'RISC-V-64' },
        { key: languageLabel('X86'), value: 'X86' },
        { key: 'Z80', value: 'Z80' }
    ]
    /** The builder's switches, each a setting of the URL it writes. */
    const switches: {
        key: Exclude<keyof EmbedSettings, 'language' | 'registerFile'>
        label: string
        description?: string
    }[] = [
        { key: 'showMemory', label: 'Show memory' },
        { key: 'showConsole', label: 'Show console' },
        { key: 'showTests', label: 'Show tests' },
        { key: 'showPc', label: 'Show PC' },
        { key: 'showRegisters', label: 'Show registers' },
        { key: 'showFlags', label: 'Show flags' },
        {
            key: 'showCycles',
            label: 'Show cycles',
            description: 'The clock cycles the program has taken so far, on M68K'
        },
        { key: 'showScreen', label: 'Show screen' },
        { key: 'openScreen', label: 'Screen open' },
        {
            key: 'hideUntilBuilt',
            label: 'Hide panels until built',
            description: 'Show the memory, registers and screen only once the code is built'
        },
        { key: 'openButton', label: 'Open in editor button' }
    ]

    //what a URL without parameters asks for, until the page reads its own once mounted
    const blank = readEmbedSettings(new URLSearchParams())
    let settings: EmbedSettings = $state(blank)
    let inIframe = $state(true)
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
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    onMount(() => {
        inIframe = window.self !== window.top
        framedByUs = inIframe && framedBySameOrigin()
        const params = page.url.searchParams
        settings = readEmbedSettings(params)
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
    {#if !inIframe}
        <DefaultNavbar />
    {/if}
    <Page fillsScreen={inIframe} contentStyle={!inIframe ? 'padding-top: 3.5rem' : ''}>
        <div
            class="playground"
            class:embed-builder={!inIframe}
            style={inIframe ? 'display: contents' : ''}
        >
            <div class:builder-workspace={!inIframe} style={inIframe ? 'display: contents' : ''}>
                <Column
                    style={`--embed-padding: ${framedByUs ? 'var(--wb-gap)' : '0.5rem'}; padding: var(--embed-padding) var(--embed-padding) ${inIframe ? 'var(--embed-padding)' : '0'}; flex:1; min-width: 0`}
                >
                    {#if ready}
                        {#key settings.language}
                            <EmulatorLoader
                                bind:code
                                bind:emulator={loadedEmulator}
                                source={project ? playgroundBuildSources(project) : undefined}
                                language={settings.language}
                                settings={{
                                    automaticChecking:
                                        !project || !sourceLanguage(project.selectedProgram ?? ''),
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
                                        showScreen={settings.showScreen &&
                                            languageHasScreen(settings.language)}
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
                                    <Header>Loading emulator...</Header>
                                {/snippet}
                            </EmulatorLoader>
                        {/key}
                    {/if}
                </Column>

                {#if !inIframe}
                    <div class="embed-grid">
                        <section class="embed-card settings-card" aria-labelledby="settings-title">
                            <div class="card-heading">
                                <h2 id="settings-title">Embed settings</h2>
                                <p>Choose which tools appear in the embedded editor.</p>
                            </div>
                            <div class="settings-grid">
                                {#each switches as { key, label, description } (key)}
                                    <div class="share-settings">
                                        <span>{label}</span>
                                        <!-- a switch with a Tooltip is named by aria-label in place
                                             of the title that repeats its label (ADR 0064) -->
                                        <Switch
                                            bind:checked={settings[key]}
                                            aria-label={description ? label : undefined}
                                            title={description ? undefined : label}
                                            {@attach tooltip(description)}
                                        />
                                    </div>
                                {/each}
                                <div class="share-settings">
                                    <span>Instruction Set</span>
                                    <Select
                                        onChange={changeLanguage}
                                        style="background-color: var(--tertiary); color: var(--secondary-text); padding: 0.3rem 0.6rem; gap: 0.4rem;"
                                        wrapperStyle="width: 7rem; flex: none;"
                                        options={languageOptions}
                                        bind:value={settings.language}
                                    />
                                </div>
                            </div>
                        </section>
                        <section class="embed-card output-card" aria-labelledby="url-title">
                            <div class="card-heading">
                                <div>
                                    <h2 id="url-title">Embed URL</h2>
                                    <p>Use this link to preview or share your configured editor.</p>
                                </div>
                                <Button
                                    cssVar="secondary"
                                    hasIcon
                                    style="padding: 0.35rem 0.65rem; font-size: 0.78rem;"
                                    disabled={!generatedCode}
                                    onClick={() => void copyText(generatedCode, 'Embed URL')}
                                >
                                    Copy
                                </Button>
                            </div>
                            <textarea aria-label="Embed URL" readonly>{generatedCode}</textarea>
                        </section>
                        <section class="embed-card output-card" aria-labelledby="code-title">
                            <div class="card-heading">
                                <div>
                                    <h2 id="code-title">Iframe code</h2>
                                    <p>Paste this HTML into your website to embed the editor.</p>
                                </div>
                                <Button
                                    cssVar="secondary"
                                    hasIcon
                                    style="padding: 0.35rem 0.65rem; font-size: 0.78rem;"
                                    disabled={!generatedCode}
                                    onClick={() =>
                                        void copyText(generatedIframeCode, 'Iframe code')}
                                >
                                    Copy
                                </Button>
                            </div>
                            <textarea aria-label="Iframe embed code" readonly
                                >{generatedIframeCode}</textarea
                            >
                        </section>
                    </div>
                {/if}
            </div>
        </div>
    </Page>
</ThemeScope>

<style lang="scss">
    @use '../../styles/radius.scss' as *;

    .embed-builder {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
        width: min(100%, 96rem);
        margin: 0 auto;
        box-sizing: border-box;
        padding: 0;
    }

    .builder-workspace {
        display: contents;
    }

    .card-heading p {
        margin: 0;
        color: var(--hint);
    }

    .embed-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
        gap: var(--wb-gap, 0.5rem);
        padding: 0 0.5rem 0.5rem;
        min-width: 0;
    }

    .embed-card {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 1rem;
        gap: 0.8rem;
        background: var(--wb-surface, var(--secondary));
        color: var(--secondary-text);
        border: var(--wb-card-edge, 1px solid var(--line));
        border-radius: var(--wb-radius, 0.4rem);
    }

    .output-card .card-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.6rem;
    }

    .output-card .card-heading > div {
        min-width: 0;
    }

    .card-heading h2 {
        margin: 0;
        font-size: 1.05rem;
    }

    .card-heading p {
        margin-top: 0.25rem;
        font-size: var(--fs-small);
    }

    .settings-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.35rem 0.75rem;
    }

    .share-settings {
        display: flex;
        gap: 0.6rem;
        align-items: center;
        justify-content: space-between;
        min-height: 2.4rem;
        padding: 0.35rem 0.5rem 0.35rem 0.75rem;
        background: var(
            --wb-section-header,
            color-mix(in srgb, var(--secondary) 72%, var(--tertiary))
        );
        border-radius: nested-radius(var(--wb-radius, var(--r-control)), $inset: 0.1rem);
        font-size: 0.9rem;
    }

    .share-settings span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    textarea {
        width: 100%;
        min-height: 7.5rem;
        resize: vertical;
        background: var(--wb-strip, var(--background));
        border: var(--wb-card-edge, 1px solid var(--tertiary));
        border-radius: var(--wb-radius, 0.4rem);
        padding: 0.5rem;
        color: var(--secondary-text);
        font: 0.82rem/1.45 monospace;
        overflow-wrap: anywhere;
    }

    textarea[readonly] {
        cursor: text;
    }

    @media (max-width: 760px) {
        .settings-grid {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    /* On a desktop sized viewport, let the editor and embed controls share one screen. The
       regular document flow below this breakpoint remains the fallback when the page needs to
       grow vertically. */
    @media (min-width: 1100px) and (min-height: 640px) {
        .builder-workspace {
            display: grid;
            flex: 1;
            grid-template-columns: minmax(0, 1fr);
            /* the settings set the bottom row's height, all of them in view; the editor takes the rest */
            grid-template-rows: minmax(15.5rem, 1fr) auto;
            gap: 0.35rem;
            min-height: 0;
            min-width: 0;
        }

        /* the settings get the widest column, the two outputs wrap their text in what is left */
        .embed-grid {
            grid-template-columns: minmax(22rem, 1.5fr) repeat(2, minmax(0, 1fr));
            align-content: stretch;
            align-items: stretch;
            gap: 0.35rem;
            min-height: 0;
            padding: 0 0.5rem 0.5rem;
        }

        .embed-card {
            gap: 0.4rem;
            padding: 0.55rem;
            /* a short window scrolls the card rather than the page */
            min-height: 0;
            overflow: auto;
        }

        .card-heading h2 {
            font-size: 0.95rem;
        }

        .card-heading p {
            font-size: 0.72rem;
        }

        .settings-grid {
            gap: 0.25rem 0.4rem;
        }

        .share-settings {
            min-height: 2rem;
            padding: 0.15rem 0.35rem 0.15rem 0.65rem;
            font-size: 0.78rem;
        }

        .share-settings :global(.switch) {
            --switch-width: 2.35rem;
            --switch-height: 1.3rem;
        }

        .output-card textarea {
            flex: 1;
            height: auto;
            min-height: 4rem;
            resize: vertical;
        }
    }

    @media (max-width: 1099px), (max-height: 639px) {
        .embed-builder {
            flex: none;
            min-height: max-content;
        }

        .builder-workspace {
            display: flex;
            flex: none;
            flex-direction: column;
            gap: 0.35rem;
            min-height: max-content;
        }
    }
</style>
