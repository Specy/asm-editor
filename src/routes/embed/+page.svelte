<script lang="ts">
    import { onMount } from 'svelte'
    import InteractiveInstructionEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import { type AvailableLanguages, type Testcase } from '$lib/Project.svelte'
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

    type Settings = {
        showMemory: boolean
        language: AvailableLanguages
        showConsole: boolean
        showTests: boolean
    }

    let settings: Settings = $state({
        showMemory: true,
        language: 'M68K',
        showConsole: false,
        showTests: true
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
        return {
            showMemory,
            language,
            showConsole,
            showTests
        } satisfies Settings
    }

    function createCodeUrl(code: string, settings: Settings, testcases: Testcase[]) {
        const showMemory = settings.showMemory ? 'showMemory=true&' : ''
        const showConsole = settings.showConsole ? 'showConsole=true&' : ''
        const showTests = settings.showTests ? 'showTests=true&' : ''
        const lang = `language=${settings.language}&`
        const compressed = lzstring.compressToEncodedURIComponent(code)
        const tests =
            testcases.length > 0
                ? `testcases=${lzstring.compressToEncodedURIComponent(JSON.stringify(testcases))}&`
                : ''
        return `${window.location.origin}/embed?${showMemory}${showTests}${showConsole}${lang}${tests}code=${compressed}`
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
		<Column gap="1rem" padding="1rem">
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
						language={settings.language}
					/>
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
				<div class="share-settings" style="justify-content: space-between;">
					<span>Language</span>
					<Select
						onChange={() => (code = BASE_CODE[settings.language])}
						style="background-color: var(--tertiary); color: var(--secondary-text); text-align: center;"
						wrapperStyle="max-width: 5rem;"
						options={['M68K', 'MIPS']}
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
				>{`<iframe src="${generatedCode}" style="border: none; border-radius: 0.8rem; width: 100%; min-height: 20.4rem;"></iframe>`}</textarea
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
        padding: 1rem;
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
