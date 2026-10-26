<script lang="ts">
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'

    import Button from '#cmp/shared/button/Button.svelte'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import Input from '#cmp/shared/input/Input.svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    import Textarea from '#cmp/shared/input/Textarea.svelte'
    import Title from '#cmp/shared/layout/Header.svelte'
    import Form from '#cmp/shared/layout/Form.svelte'
    import { toast } from '#stores/toastStore.ts'
    import { type AvailableLanguages, makeProject } from '#lib/Project.svelte.ts'
    import FaAngleLeft from '~icons/fa-solid/angle-left'
    import { ProjectStore } from '#stores/projectsStore.svelte.ts'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import type { PageData } from './$types'
    import { isCompilationTarget } from '#lib/sourceCompilation/records.ts'
    import { warmUpMonaco } from '#lib/monaco/warmUp.ts'
    import { onMount } from 'svelte'
    import FileDropZone from '#cmp/shared/fileImporter/FileDropZone.svelte'
    import { IMPORTABLE_FILES, importFiles } from '#lib/projectImport.ts'

    let { data }: { data: PageData } = $props()

    //creating a project opens it in the editor straight after
    onMount(warmUpMonaco)

    let name = $state('')
    let description = $state('')
    let language: AvailableLanguages = $state('RISC-V-64')
    const languageOptions: Array<{ key: string; value: AvailableLanguages }> = [
        { key: 'M68K', value: 'M68K' },
        { key: 'MIPS', value: 'MIPS' },
        { key: languageLabel('X86'), value: 'X86' },
        { key: 'RISC-V', value: 'RISC-V' },
        { key: 'RISC-V-64', value: 'RISC-V-64' },
        { key: 'Z80', value: 'Z80' }
    ]

    const LANGUAGE_STORAGE_KEY = 'asm-editor_new-project-isa'
    onMount(() => {
        try {
            const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
            const option = languageOptions.find((option) => option.value === stored)
            if (option) language = option.value
        } catch {
            // Project creation still works when browser storage is unavailable.
        }
    })

    function rememberLanguage(value: AvailableLanguages) {
        try {
            localStorage.setItem(LANGUAGE_STORAGE_KEY, value)
        } catch {
            // Keep the selected ISA for this form even if it cannot be saved.
        }
    }

    const BAREBONES = 'barebones'
    let templateId = $state(BAREBONES)

    const templates = $derived(data.templates[language] ?? [])
    const templateOptions = $derived(
        templates.map((template) => ({ key: template.name, value: template.id }))
    )
    /** x86 offers fewer programs than the others, so a selection can stop existing when the
     *  language changes. Fall back rather than leaving the select showing nothing. */
    $effect(() => {
        if (!templates.some((template) => template.id === templateId)) templateId = BAREBONES
    })
    /** A language that does not offer the selected program falls back to its empty one, so
     *  switching language never leaves the form pointing at code it cannot create. */
    const selected = $derived(
        templates.find((template) => template.id === templateId) ?? templates[0]
    )

    async function create() {
        const project = makeProject({
            name,
            description,
            language,
            code: selected?.code,
            createdAt: new Date().getTime(),
            updatedAt: new Date().getTime()
        })
        try {
            await ProjectStore.addProject(project)
            toast.logPill('Project created')
            goto(resolve('/projects/[project]', { project: project.id }))
        } catch (e) {
            console.error(e)
            toast.error('Error creating project')
        }
    }

    /** A program brought in instead of a template opens as Create would; several are listed. */
    async function importDropped(files: File[]) {
        const projects = await importFiles(files)
        if (projects.length === 1) goto(resolve('/projects/[project]', { project: projects[0].id }))
        else if (projects.length > 1) goto(resolve('/projects'))
    }
</script>

<svelte:head>
    <title>Create Project</title>
    <meta name="description" content="Create a new project" />
    <meta property="og:description" content="Create a new project" />
    <meta property="og:title" content="Create Project" />
</svelte:head>

<DefaultNavbar />
<Page cropped="40rem" style="padding-top: 3rem">
    <div class="create-project">
        <div class="row top-title">
            <a
                href={resolve('/projects')}
                class="go-back"
                {@attach tooltip('Go to the projects page')}
                aria-label="Back"
            >
                <Button hasIcon cssVar="primary" style="padding: 0.4rem">
                    <Icon size={2}>
                        <FaAngleLeft />
                    </Icon>
                </Button>
            </a>
            <Title>Create new project</Title>
        </div>
        {#if data.gettingStarted}
            <p style="margin: 0.8rem 0; line-height: 1.6">
                New to ASM Editor? <a
                    href={resolve('/blog/posts/[slug]', { slug: data.gettingStarted })}
                    style="color: var(--accent)">Follow the getting-started guide</a
                >.
            </p>
        {/if}
        <Form
            style="display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.2rem; margin:0.5rem 0"
            onSubmit={create}
        >
            <Input title="Name" placeholder="Name" bind:value={name} />
            <Textarea title="Description" bind:value={description} />
            <Select
                title="Instruction Set"
                options={languageOptions}
                bind:value={language}
                onChange={rememberLanguage}
            >
                {#snippet item(option)}
                    <span class="language-option">
                        <span>{option.key}</span>
                        {#if isCompilationTarget(option.value)}
                            <span class="language-badge">C/C++ available</span>
                        {/if}
                    </span>
                {/snippet}
            </Select>
            <div class="template-field">
                <Select title="Template" options={templateOptions} bind:value={templateId}>
                    {#snippet item(option)}
                        <span class="template-option-name">{option.key}</span>
                        <span class="template-option-description">
                            {templates.find((template) => template.id === option.value)
                                ?.description ?? ''}
                        </span>
                    {/snippet}
                </Select>
                {#if selected && selected.id !== BAREBONES}
                    <span class="template-description">{selected.description}</span>
                {/if}
            </div>
        </Form>
        <div
            style="display:flex; justify-content: space-between; align-items:center; margin-top: 1rem;"
        >
            <ButtonLink href="/projects" cssVar="primary" {@attach tooltip('Cancel new project')}
                >Cancel
            </ButtonLink>
            <Button onClick={create}>Create</Button>
        </div>
        <div class="import-drop">
            <FileDropZone
                title="Already have a program? Drop it here"
                hint={IMPORTABLE_FILES}
                dropLabel="Drop to open as a project"
                onFiles={importDropped}
            />
        </div>
    </div>
</Page>

<style lang="scss">
    .create-project {
        padding-top: 2rem;

        @media screen and (max-width: 650px) {
            padding: 1rem;
        }
    }

    .top-title {
        align-items: center;
    }

    .import-drop {
        margin-top: 2.5rem;
    }

    .template-field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .language-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
    }

    .language-badge {
        flex-shrink: 0;
        padding: 0.15rem 0.45rem;
        border-radius: 0.3rem;
        background: color-mix(in srgb, var(--accent) 12%, transparent);
        color: var(--accent);
        font-size: 0.7rem;
        font-weight: normal;
        white-space: nowrap;
    }

    .template-option-name {
        display: block;
    }

    /* one row, clipped: a description is a hint at what the program does, not the program */
    .template-option-description {
        display: block;
        overflow: hidden;
        font-size: 0.85rem;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.75;
    }

    .template-description {
        font-size: 0.85rem;
        opacity: 0.8;
    }

    @media screen and (min-width: 650px) {
        .go-back {
            position: absolute;
            top: 4.2rem;
            left: 1rem;
        }
    }
</style>
