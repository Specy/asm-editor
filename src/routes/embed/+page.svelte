<script lang="ts">
    import { onMount } from 'svelte'
    import InteractiveInstructionEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import { type AvailableLanguages, makeProject, type Testcase } from '$lib/Project.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import lzstring from 'lz-string'
    import { page } from '$app/stores'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Select from '$cmp/shared/input/Select.svelte'
    import { viewStore } from '$stores/view'
    import { BASE_CODE } from '$lib/Config'
    import Header from '$cmp/shared/layout/Header.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import { createShareLink } from '$lib/utils'
    import Button from '$cmp/shared/button/Button.svelte'
		import FaExternal from 'svelte-icons/fa/FaExternalLinkAlt.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    type Settings = {
        showMemory: boolean
        language: AvailableLanguages
        showConsole: boolean
        showTests: boolean
        showPc: boolean
        showRegisters: boolean
        showSizes: boolean
        showFlags: boolean
        openButton: boolean
    }

    let settings: Settings = $state({
        showMemory: true,
        language: 'M68K',
        showConsole: false,
        showTests: true,
        showPc: false,
        showRegisters: true,
        showSizes: true,
        showFlags: false,
        openButton: false
    })
    let inIframe = $state(true)
    let code = $state(BASE_CODE[settings.language])
    let testcases = $state([] as Testcase[])
    let generatedCode = $state('')
    let timeoutId = 0 as any
    onMount(() => {
        inIframe = window.self !== window.top
        settings = getSettings()
        code = getCodeFromUrl() ?? BASE_CODE[settings.language]
        testcases = getTestsFromUrl()
    })

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
            return JSON.parse(lzstring.decompressFromEncodedURIComponent(tests))
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
        const showSizes = searchParams.get('showSizes') !== 'false'
        const showFlags = searchParams.get('showFlags') === 'true'
        const openButton = searchParams.get('openButton') === 'true'

        return {
            showMemory,
            language,
            showConsole,
            showTests,
            showPc,
            showRegisters,
            showSizes,
            showFlags,
            openButton
        } satisfies Settings
    }

    function createCodeUrl(code: string, settings: Settings, testcases: Testcase[]) {
        const showMemory = settings.showMemory ? 'showMemory=true&' : ''
        const showConsole = settings.showConsole ? 'showConsole=true&' : ''
        const showTests = settings.showTests ? 'showTests=true&' : 'showTests=false&'
        const showPc = settings.showPc ? 'showPc=true&' : ''
        const showRegisters = settings.showRegisters ? 'showRegisters=true&' : 'showRegisters=false&'
        const showSizes = settings.showSizes ? 'showSizes=true&' : ''
        const showFlags = settings.showFlags ? 'showFlags=true&' : 'showFlags=false&'
        const openButton = settings.openButton ? 'openButton=true&' : ''
        const props = [showMemory, showConsole, showTests, showPc, showRegisters, showSizes, showFlags, openButton].join('')
        const lang = `language=${settings.language}&`
        const compressed = lzstring.compressToEncodedURIComponent(code)
        const tests =
            testcases.length > 0
                ? `testcases=${lzstring.compressToEncodedURIComponent(JSON.stringify(testcases))}&`
                : ''
        return `${window.location.origin}/embed?${lang}${props}${tests}code=${compressed}`
    }

    function generateCodeUrl(code: string, settings: Settings, testcases: Testcase[]) {
        clearTimeout(timeoutId)
        viewStore(settings)
        timeoutId = setTimeout(() => {
            generatedCode = createCodeUrl(code, settings, testcases)
        }, 1000)
    }

    $effect(() => {
        generateCodeUrl(code, settings, testcases)
    })
</script>

{#if !inIframe}
	<DefaultNavbar />
{/if}
<Page contentStyle={!inIframe ? 'padding-top: 3.5rem' : ''}>
	{#if !inIframe}
		<Column gap="1rem" padding="0.6rem 1rem">
			<p>
				Write some assembly code, below the editor there will be generated an embed URL and
				embed html code that you can put in your website
			</p>
		</Column>
	{/if}

	<Column style={'padding: 0.5rem; flex:1'}>
		{#key settings.language}
			<EmulatorLoader
				bind:code={code}
				language={settings.language}
				settings={{
						globalPageElementsPerRow: 4,
						globalPageSize: 4 * 8
				}}
			>
				{#snippet children(emulator)}
					<InteractiveInstructionEditor
						{emulator}
						bind:code
						bind:testcases
						embedded={inIframe}
						showConsole={settings.showConsole}
						showMemory={settings.showMemory}
						showTestcases={settings.showTests}
						showPc={settings.showPc}
						showRegisters={settings.showRegisters}
						showSizes={settings.showSizes}
						showFlags={settings.showFlags}
						language={settings.language}

					>
						{#snippet controls()}
							{#if settings.openButton  }
								<Button
									cssVar="secondary"
									style="gap: 0.5rem; margin-left: auto"
									onClick={() => {
										const project = makeProject({code, language: settings.language})
										const url = createShareLink(project)
										window.open(url, '_blank')
									}}
								>
									<Icon>
										<FaExternal />
									</Icon> Open in editor
								</Button>
							{/if}
						{/snippet}

					</InteractiveInstructionEditor>
				{/snippet}
				{#snippet loading()}
					<Header>
						Loading emulator...
					</Header>
				{/snippet}
			</EmulatorLoader>
		{/key}
	</Column>

	{#if !inIframe}
		<div class="share-container">
			<div class="share-card" style="padding: 1rem; gap: 0.5rem">
				<h2 style="text-align: center;">Embed Settings</h2>
				<div class="share-settings">
					<span>Show memory</span>
					<input type="checkbox" bind:checked={settings.showMemory} />
				</div>
				<div class="share-settings">
					<span>Show console</span>
					<input type="checkbox" bind:checked={settings.showConsole} />
				</div>
				<div class="share-settings">
					<span>Show tests</span>
					<input type="checkbox" bind:checked={settings.showTests} />
				</div>
				<div class="share-settings">
					<span>Show PC</span>
					<input type="checkbox" bind:checked={settings.showPc} />
				</div>
				<div class="share-settings">
					<span>Show registers</span>
					<input type="checkbox" bind:checked={settings.showRegisters} />
				</div>
				<div class="share-settings">
					<span>Show sizes</span>
					<input type="checkbox" bind:checked={settings.showSizes} />
				</div>
				<div class="share-settings">
					<span>Show flags</span>
					<input type="checkbox" bind:checked={settings.showFlags} />
				</div>
				<div class="share-settings">
					<span>Open in editor button</span>
					<input type="checkbox" bind:checked={settings.openButton} />
				</div>
				<div class="share-settings" style="justify-content: space-between;">
					<span>Language</span>
					<Select
						onChange={() => (code = BASE_CODE[settings.language])}
						style="background-color: var(--tertiary); color: var(--secondary-text); text-align: center;"
						wrapperStyle="max-width: 5rem;"
						options={['M68K', 'MIPS', 'RISC-V', 'X86']}
						bind:value={settings.language}
					/>
				</div>
			</div>
			<div class="share-card">
				<h2 style="text-align: center;">URL</h2>
				<textarea>{generatedCode}</textarea>
			</div>
			<div class="share-card">
				<h2 style="text-align: center;">Embed code</h2>
				<textarea
				>{`<iframe src="${generatedCode}" style="border: none; border-radius: 0.8rem; width: 100%; min-height: 20.8rem;"></iframe>`}</textarea
				>
			</div>
		</div>
	{/if}
</Page>

<style>
    .share-container {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        padding: 0.5rem;
        border-top: 0.2rem dashed var(--tertiary);
    }

    .share-card {
        display: flex;
        flex-direction: column;
        padding: 0.5rem;
        gap: 1rem;
        flex: 1;
        background-color: var(--secondary);
        color: var(--secondary-text);
        border-radius: 0.5rem;
    }

    textarea {
        background-color: var(--secondary);
        border: solid 0.1rem var(--tertiary);
        border-radius: 0.3rem;
        min-height: 8rem;
        padding: 0.5rem;
        color: var(--secondary-text);
    }

    .share-settings {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        justify-content: space-between;
    }
</style>
