<script lang="ts">
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'

    import Button from '$cmp/shared/button/Button.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import Input from '$cmp/shared/input/Input.svelte'
    import Select from '$cmp/shared/input/Select.svelte'
    import Textarea from '$cmp/shared/input/Textarea.svelte'
    import Title from '$cmp/shared/layout/Header.svelte'
    import Form from '$cmp/shared/layout/Form.svelte'
    import { toast } from '$stores/toastStore'
    import { type AvailableLanguages, makeProject } from '$lib/Project.svelte'
    import FaAngleLeft from '~icons/fa-solid/angle-left'
    import { ProjectStore } from '$stores/projectsStore.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import type { PageData } from './$types'

    let { data }: { data: PageData } = $props()

    let name = $state('')
    let description = $state('')
    let language: AvailableLanguages = $state('M68K')
    const languageOptions: Array<{ key: AvailableLanguages; value: AvailableLanguages }> = [
        { key: 'M68K', value: 'M68K' },
        { key: 'MIPS', value: 'MIPS' },
        { key: 'X86', value: 'X86' },
        { key: 'RISC-V', value: 'RISC-V' },
        { key: 'RISC-V-64', value: 'RISC-V-64' },
        { key: 'Z80', value: 'Z80' }
    ]

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
            <a href={resolve('/projects', {})} class="go-back" title="Go to the projects page">
                <Button hasIcon cssVar="primary" style="padding: 0.4rem">
                    <Icon size={2}>
                        <FaAngleLeft />
                    </Icon>
                </Button>
            </a>
            <Title>Create new project</Title>
        </div>
        <Form style="display: grid; gap: 1.2rem; margin:0.5rem 0" on:submit={create}>
            <Input title="Name" placeholder="Name" bind:value={name} />
            <Textarea title="Description" bind:value={description} />
            <Select title="Language" options={languageOptions} bind:value={language} />
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
            <ButtonLink href="/projects" cssVar="primary" title="Cancel new project"
                >Cancel
            </ButtonLink>
            <Button onClick={create}>Create</Button>
        </div>
        {#if language === 'X86'}
            <p
                style="margin-top: 2rem; background: rgba(var(--RGB-red), 0.1); padding: 1rem; border-radius: 0.5rem;"
            >
                X86 is experimental and might have bugs. Please report any issues you find.
            </p>
        {/if}
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

    .template-field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
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
