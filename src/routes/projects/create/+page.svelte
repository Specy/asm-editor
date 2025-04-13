<script lang="ts">
    import { goto } from '$app/navigation'

    import Button from '$cmp/shared/button/Button.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import Input from '$cmp/shared/input/Input.svelte'
    import Select from '$cmp/shared/input/Select.svelte'
    import Textarea from '$cmp/shared/input/Textarea.svelte'
    import Title from '$cmp/shared/layout/Header.svelte'
    import Form from '$cmp/shared/layout/Form.svelte'
    import { toast } from '$stores/toastStore'
    import { makeProject, type AvailableLanguages } from '$lib/Project.svelte'
    import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
    import { ProjectStore } from '$stores/projectsStore.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    let name = $state('')
    let description = $state('')
    let language: AvailableLanguages = $state('M68K')
    async function create() {
        const project = makeProject({
            name,
            description,
            language,
            createdAt: new Date().getTime(),
            updatedAt: new Date().getTime()
        })
        try {
            await ProjectStore.addProject(project)
            toast.logPill('Project created')
            goto(`/projects/${project.id}`)
        } catch (e) {
            console.error(e)
            toast.error('Error creating project')
        }
    }
</script>

<svelte:head>
    <title>Create Project</title>
    <meta name="description" content="Create a new project" />
    <meta name="og:description" content="Create a new project" />
    <meta name="og:title" content="Create Project" />
</svelte:head>

<Page cropped contentStyle="max-width: 40rem">
    <div class="create-project">
        <div class="row top-title">
            <a href="/projects" class="go-back" title="Go to the projects page">
                <Button hasIcon cssVar="primary" style="padding: 0.4rem">
                    <Icon size={2}>
                        <FaAngleLeft />
                    </Icon>
                </Button>
            </a>
            <Title>Create new project</Title>
        </div>
        <Form style="display: grid; gap: 1.2rem; margin:0.5rem 0" on:submit={create}>
            <Input title="Name" placeholder='Name' bind:value={name} />
            <Textarea title="Description" bind:value={description} />
            <Select title="Language" options={['M68K', 'MIPS', 'X86']} bind:value={language} />
        </Form>
        <div
            style="display:flex; justify-content: space-between; align-items:center; margin-top: 1rem;"
        >
            <ButtonLink href="/projects" cssVar="primary" title="Cancel new project"
                >Cancel</ButtonLink
            >
            <Button onClick={create}>Create</Button>
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
    @media screen and (min-width: 650px) {
        .go-back {
            position: absolute;
            top: 1rem;
            left: 1rem;
        }
    }
</style>
