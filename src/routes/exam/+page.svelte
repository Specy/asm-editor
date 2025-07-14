<script lang="ts">
    import { onMount } from 'svelte'
    import InteractiveInstructionEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import {
        type AvailableLanguages,
        cleanTestcases,
        makeProject,
        type Testcase
    } from '$lib/Project.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import lzstring from 'lz-string'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Select from '$cmp/shared/input/Select.svelte'
    import { viewStore } from '$stores/view'
    import { BASE_CODE } from '$lib/Config'
    import Header from '$cmp/shared/layout/Header.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import { serializer } from '$lib/json'
    import Row from '$cmp/shared/layout/Row.svelte'
    import MarkdownEditor from '$cmp/shared/markdown/MarkdownEditor.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import Input from '$cmp/shared/input/Input.svelte'
    import { createShareLink, makeHash } from '$lib/utils'
    import { toast } from '$stores/toastStore'
    	import FaDumbbell from 'svelte-icons/fa/FaDumbbell.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'

    type Settings = {
        language: AvailableLanguages
        track: string
        password: string
    }

    let settings: Settings = $state({
        language: 'M68K',
        track: '',
        password: ''
    })
    let code = $state(BASE_CODE[settings.language])
    let testcases = $state([] as Testcase[])



    async function createExamUrl() {
        const hash = (await makeHash(settings.password)).slice(0,6)
        const pr = makeProject({
            code,
            testcases,
            language: settings.language,
            exam: {
                track: settings.track,
                passwordHash: hash,
                timeLimit: -1
            }
        })
        const url = createShareLink(pr, 'exam')
        await navigator.clipboard.writeText(url)
        toast.logPill('Copied to clipboard')
    }
</script>

<svelte:head>
    <title>Embed - Assembly Emulator</title>
    <meta name="description" content="Embed an assembly emulator in your website" />
    <meta property="og:title" content="Embed - Asm Editor" />
    <meta property="og:description" content="Embed an assembly emulator in your website" />
</svelte:head>

<DefaultNavbar />
<Page contentStyle={'padding-top: 3.5rem'}>
    <Row gap="1rem" flex1>
        <Column gap="1rem" padding="0.6rem 1rem" flex1>
            <Row align="center" justify="between" gap="1rem">
                <Header type="h2">Language</Header>
                <Select
                    wrapperStyle="max-width: 14rem"
                    bind:value={settings.language}
                    options={Object.keys(BASE_CODE) as AvailableLanguages[]}
                />
            </Row>
            <Row align="center" justify="between" gap="1rem">
                <Header type="h2">Password</Header>
                <Input
                    type="password"
                    placeholder="Exam unlock password"
                    bind:value={settings.password}
                />
            </Row>
            <Column 
            flex1
            style="max-height: 20rem; overflow: hidden;"
            >
                <MarkdownEditor bind:value={settings.track} />
            </Column>
            <p style="padding: 1rem; max-width: 70ch">
                When people open the exam, they will put their name, which, together with other
                information, will generate a random code that identifies them which you can save. If
                they reload the page, or if they reset the website data, a new code will be
                generated. Once the user is ready to start, the page will go full screen and any
                attempt to leave the page will result with the editor being blocked. To unlock the
                editor, the user will need to enter the password you set above. Letting you know
                that they might have either accidentally or intentionally left the exam.
            </p>
        </Column>

        <Column style={'padding: 0.5rem; flex:1'} gap="1rem">
            {#key settings.language}
                <EmulatorLoader
                    bind:code
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
                            embedded={false}
                            showConsole={false}
                            showMemory={false}
                            showTestcases={true}
                            showPc={false}
                            showRegisters={false}
                            showFlags={false}
                            language={settings.language}
                        ></InteractiveInstructionEditor>
                    {/snippet}
                    {#snippet loading()}
                        <Header>Loading emulator...</Header>
                    {/snippet}
                </EmulatorLoader>
            {/key}
            <Row>
                <Button 
                    onClick={createExamUrl}
                    hasIcon
                    style="gap: 0.5rem; padding: 0.6rem 1rem;"
                >
                    <Icon>
                        <FaDumbbell />
                    </Icon>
                    Create exam
                </Button>
            </Row>
        </Column>
    </Row>
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

    :global(.carta-editor) {
        height: 100%;
    }
    :global(.carta-theme__default) {
        --border-color: var(--border-color-dark);
        --selection-color: var(--selection-color-dark);
        --focus-outline: var(--focus-outline-dark);
        --hover-color: var(--hover-color-dark);
        --caret-color: var(--caret-color-dark);
        --text-color: var(--text-color-dark);
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
