<script lang="ts">
    import { onMount } from 'svelte'
    import InteractiveInstructionEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import {
        type AvailableLanguages,
        cleanTestcases,
        makeProject,
        type Project,
        type Testcase
    } from '$lib/Project.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import lzstring from 'lz-string'
    import { page } from '$app/stores'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Select from '$cmp/shared/input/Select.svelte'
    import Switch from '$cmp/shared/input/Switch.svelte'
    import { viewStore } from '$stores/view'
    import { BASE_CODE, LANGUAGE_THEMES } from '$lib/Config'
    import Header from '$cmp/shared/layout/Header.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import { createShareLink } from '$lib/utils'
    import { toast } from '$stores/toastStore'
    import FaExternal from '~icons/fa-solid/external-link-alt'
    import Button from '$cmp/shared/button/Button.svelte'
    import { serializer } from '$lib/json'
    import { languageHasScreen } from '$lib/languages/peripherals/peripheralSet'
    import ThemeScope from '$cmp/shared/providers/ThemeScope.svelte'
    import {
        decodePlaygroundProgram,
        encodePlaygroundProgram,
        playgroundBuildSources
    } from '$lib/content/playgroundProgram'
    import { sourceLanguage } from '$lib/sourceCompilation/records'

    type Settings = {
        showMemory: boolean
        language: AvailableLanguages
        showConsole: boolean
        showTests: boolean
        showPc: boolean
        showRegisters: boolean
        showFlags: boolean
        showScreen: boolean
        openScreen: boolean
        openButton: boolean
        /** The Register file the panel opens on, from a Playground's `fpu`/`cp0`/`csr`/`sse`/`x87` flag. */
        registerFile?: string
    }

    const languageOptions: Array<{ key: AvailableLanguages; value: AvailableLanguages }> = [
        { key: 'M68K', value: 'M68K' },
        { key: 'MIPS', value: 'MIPS' },
        { key: 'RISC-V', value: 'RISC-V' },
        { key: 'RISC-V-64', value: 'RISC-V-64' },
        { key: 'X86', value: 'X86' },
        { key: 'Z80', value: 'Z80' }
    ]

    let settings: Settings = $state({
        showMemory: true,
        language: 'M68K',
        showConsole: false,
        showTests: true,
        showPc: false,
        showRegisters: true,
        showFlags: false,
        showScreen: false,
        openScreen: false,
        openButton: false,
        registerFile: undefined
    })
    let inIframe = $state(true)
    let code = $state(BASE_CODE[settings.language])
    let project = $state<Project>()
    let ready = $state(false)
    let testcases = $state([] as Testcase[])
    let generatedCode = $state('')
    let generatedIframeCode = $derived(
        `<iframe src="${generatedCode}" style="border: none; border-radius: 0.8rem; width: 100%; min-height: 20.8rem;"></iframe>`
    )
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    onMount(() => {
        inIframe = window.self !== window.top
        settings = getSettings()
        code = getCodeFromUrl() ?? BASE_CODE[settings.language]
        testcases = cleanTestcases(getTestsFromUrl())
        const encoded = $page.url.searchParams.get('program')
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

    function openInEditor() {
        const opened = project
            ? makeProject({ ...project.toObject(), testcases })
            : makeProject({ code, language: settings.language, testcases })
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
            const source = previous.compilations.find(
                (record) => record.outputPath === previous.entry
            )?.sourcePath
            project = makeProject({
                files: previous.files,
                entry: source ?? previous.entry,
                language
            })
        }
    }

    async function copyToClipboard(value: string, label: string) {
        try {
            await navigator.clipboard.writeText(value)
            toast.logPill(`${label} copied`)
        } catch (error) {
            console.error(error)
            toast.error(`Could not copy ${label.toLowerCase()}`)
        }
    }

    function getCodeFromUrl() {
        const searchParams = $page.url.searchParams
        const code = searchParams.get('code')
        if (!code) return undefined
        try {
            return lzstring.decompressFromEncodedURIComponent(code)
        } catch (e) {
            console.error(e)
            return undefined
        }
    }

    function getTestsFromUrl() {
        const searchParams = $page.url.searchParams
        const tests = searchParams.get('testcases')
        if (!tests) return []
        try {
            return serializer.parse<Testcase[]>(lzstring.decompressFromEncodedURIComponent(tests))
        } catch (e) {
            console.error(e)
            return []
        }
    }

    function getSettings() {
        const searchParams = $page.url.searchParams
        const showMemory = searchParams.get('showMemory') === 'true'
        const language = (searchParams.get('language') ?? 'M68K') as AvailableLanguages
        const showConsole = searchParams.get('showConsole') === 'true'
        const showTests = (searchParams.get('showTests') ?? 'true') === 'true'
        const showPc = searchParams.get('showPc') === 'true'
        const showRegisters = searchParams.get('showRegisters') !== 'false'
        const showFlags = searchParams.get('showFlags') === 'true'
        const openScreen = searchParams.get('openScreen') === 'true'
        //asking for the Screen open is asking for one, so a link needs only the one parameter
        const showScreen = openScreen || searchParams.get('showScreen') === 'true'
        const openButton = searchParams.get('openButton') === 'true'
        //the panel itself decides what to do with a file this language has not got, which is to
        //open on the CPU one
        const registerFile = searchParams.get('registerFile')?.trim().toLowerCase() || undefined

        return {
            showMemory,
            language,
            showConsole,
            showTests,
            showPc,
            showRegisters,
            showFlags,
            showScreen,
            openScreen,
            openButton,
            registerFile
        } satisfies Settings
    }

    function createCodeUrl(code: string, settings: Settings, testcases: Testcase[]) {
        const showMemory = settings.showMemory ? 'showMemory=true&' : ''
        const showConsole = settings.showConsole ? 'showConsole=true&' : ''
        const showTests = settings.showTests ? 'showTests=true&' : 'showTests=false&'
        const showPc = settings.showPc ? 'showPc=true&' : ''
        const showRegisters = settings.showRegisters
            ? 'showRegisters=true&'
            : 'showRegisters=false&'
        const showFlags = settings.showFlags ? 'showFlags=true&' : 'showFlags=false&'
        const showScreen = settings.showScreen ? 'showScreen=true&' : ''
        const openScreen = settings.openScreen ? 'openScreen=true&' : ''
        const openButton = settings.openButton ? 'openButton=true&' : ''
        const registerFile = settings.registerFile ? `registerFile=${settings.registerFile}&` : ''
        const props = [
            showMemory,
            showConsole,
            showTests,
            showPc,
            showRegisters,
            showFlags,
            showScreen,
            openScreen,
            openButton,
            registerFile
        ].join('')
        const lang = `language=${settings.language}&`
        const compressed = lzstring.compressToEncodedURIComponent(code)
        const tests =
            testcases.length > 0
                ? `testcases=${lzstring.compressToEncodedURIComponent(serializer.stringify($state.snapshot(testcases)))}&`
                : ''
        const program = project
            ? encodePlaygroundProgram({
                  files: $state.snapshot(project.files),
                  entry: project.entry,
                  compilations: project.compilations
              })
            : undefined
        return `${window.location.origin}/embed?${lang}${props}${tests}${program ? `program=${program}` : `code=${compressed}`}`
    }

    function generateCodeUrl(code: string, settings: Settings, testcases: Testcase[]) {
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
            void project.entry
            void project.compilations
        }
        generateCodeUrl(code, settings, testcases)
    })
</script>

<svelte:head>
    <title>Embed - Assembly Emulator</title>
    <meta name="description" content="Embed an assembly emulator in your website" />
    <meta property="og:title" content="Embed - Asm Editor" />
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
    <Page contentStyle={!inIframe ? 'padding-top: 3.5rem' : ''}>
        <div
            class:embed-builder={!inIframe}
            class:playground={!inIframe}
            style={inIframe ? 'display: contents' : ''}
        >
            {#if !inIframe}
                <header class="page-heading">
                    <h1>Embed an assembly editor</h1>
                    <p>
                        Customize the editor below, then copy its URL or iframe code into your
                        website.
                    </p>
                </header>
            {/if}

            <div class:builder-workspace={!inIframe} style={inIframe ? 'display: contents' : ''}>
                <Column
                    style={`padding: 0.5rem 0.5rem ${inIframe ? '0.5rem' : '0'}; flex:1; min-width: 0`}
                >
                    {#if ready}
                        {#key settings.language}
                            <EmulatorLoader
                                bind:code
                                source={project ? playgroundBuildSources(project) : undefined}
                                language={settings.language}
                                settings={{
                                    automaticChecking: !project || !sourceLanguage(project.entry),
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
                                        showScreen={settings.showScreen &&
                                            languageHasScreen(settings.language)}
                                        openScreen={settings.openScreen}
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
                                <div class="share-settings">
                                    <span>Show memory</span>
                                    <Switch
                                        bind:checked={settings.showMemory}
                                        title="Show memory"
                                    />
                                </div>
                                <div class="share-settings">
                                    <span>Show console</span>
                                    <Switch
                                        bind:checked={settings.showConsole}
                                        title="Show console"
                                    />
                                </div>
                                <div class="share-settings">
                                    <span>Show tests</span>
                                    <Switch bind:checked={settings.showTests} title="Show tests" />
                                </div>
                                <div class="share-settings">
                                    <span>Show PC</span>
                                    <Switch bind:checked={settings.showPc} title="Show PC" />
                                </div>
                                <div class="share-settings">
                                    <span>Show registers</span>
                                    <Switch
                                        bind:checked={settings.showRegisters}
                                        title="Show registers"
                                    />
                                </div>
                                <div class="share-settings">
                                    <span>Show flags</span>
                                    <Switch bind:checked={settings.showFlags} title="Show flags" />
                                </div>
                                <div class="share-settings">
                                    <span>Show screen</span>
                                    <Switch
                                        bind:checked={settings.showScreen}
                                        title="Show screen"
                                    />
                                </div>
                                <div class="share-settings">
                                    <span>Screen open</span>
                                    <Switch
                                        bind:checked={settings.openScreen}
                                        title="Screen open"
                                    />
                                </div>
                                <div class="share-settings">
                                    <span>Open in editor button</span>
                                    <Switch
                                        bind:checked={settings.openButton}
                                        title="Open in editor button"
                                    />
                                </div>
                                <div class="share-settings">
                                    <span>Language</span>
                                    <Select
                                        onChange={changeLanguage}
                                        style="background-color: var(--tertiary); color: var(--secondary-text); text-align: center;"
                                        wrapperStyle="max-width: 5rem;"
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
                                    onClick={() => void copyToClipboard(generatedCode, 'Embed URL')}
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
                                        void copyToClipboard(generatedIframeCode, 'Iframe code')}
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

<style>
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

    .page-heading {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.2rem 1rem;
        padding: 0.5rem 0.5rem 0;
    }

    .page-heading h1 {
        margin: 0;
        font-size: 1.8rem;
    }

    .page-heading p,
    .card-heading p {
        margin: 0;
        color: var(--hint);
    }

    .page-heading p {
        flex: 1 1 20rem;
        min-width: 0;
        max-width: 52rem;
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
        border: var(--wb-card-edge, 1px solid color-mix(in srgb, var(--tertiary) 60%, transparent));
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
        font-size: 0.85rem;
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
        border-radius: calc(var(--wb-radius, 0.4rem) - 0.1rem);
        font-size: 0.9rem;
    }

    .share-settings span {
        min-width: 0;
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
        .page-heading {
            flex: none;
            padding: 0.15rem 0.5rem 0;
        }

        .page-heading h1 {
            font-size: 1.45rem;
        }

        .page-heading p {
            font-size: 0.85rem;
        }

        .builder-workspace {
            display: grid;
            flex: 1;
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: minmax(15.5rem, 1.25fr) minmax(13rem, 0.85fr);
            gap: 0.35rem;
            min-height: 0;
            min-width: 0;
        }

        .embed-grid {
            grid-template-columns: minmax(17rem, 1fr) repeat(2, minmax(0, 1.1fr));
            align-content: stretch;
            align-items: stretch;
            gap: 0.35rem;
            min-height: 0;
            padding: 0 0.5rem 0.5rem;
        }

        .embed-card {
            gap: 0.4rem;
            padding: 0.55rem;
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
