<script lang="ts">
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import { languageAccent } from '#lib/languages/languageColors.ts'
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'

    import Button from '#cmp/shared/button/Button.svelte'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import Badge from '#cmp/shared/misc/Badge.svelte'
    import TextField from '#cmp/shared/input/TextField.svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    import SegmentedControl from '#cmp/shared/input/SegmentedControl.svelte'
    import Textarea from '#cmp/shared/input/Textarea.svelte'
    import Title from '#cmp/shared/layout/Header.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import Form from '#cmp/shared/layout/Form.svelte'
    import { toast } from '#stores/toastStore.ts'
    import { type AvailableLanguages, makeProject } from '#lib/Project.svelte.ts'
    import { ProjectStore } from '#stores/projectsStore.svelte.ts'
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
    /** The instruction sets in the bar, each named as the rest of the app names it and marked
     *  with the colour of its own theme, as the home page's bar marks them. */
    const LANGUAGES: AvailableLanguages[] = ['M68K', 'MIPS', 'RISC-V', 'RISC-V-64', 'X86', 'Z80']
    const languageOptions = LANGUAGES.map((value) => ({
        id: value,
        label: languageLabel(value),
        iconColor: languageAccent(value)
    }))

    /** The simulator each Instruction set follows, for a course that teaches with that tool. */
    const COMPATIBLE_WITH: Partial<Record<AvailableLanguages, string>> = {
        M68K: 'EASy68K',
        MIPS: 'MARS',
        'RISC-V': 'RARS',
        'RISC-V-64': 'RARS'
    }

    /** What an Instruction set can do that some others cannot, shown under the bar for the one
     *  picked. */
    function languageTags(language: AvailableLanguages): string[] {
        const tags: string[] = []
        const compatible = COMPATIBLE_WITH[language]
        if (compatible) tags.push(compatible)
        //only an x86 Project runs Linux executables, so only it disassembles and decompiles them
        if (language === 'X86') tags.push('Disassemble', 'Decompile')
        if (isCompilationTarget(language)) tags.push('C/C++')
        return tags
    }
    const tags = $derived(languageTags(language))

    const LANGUAGE_STORAGE_KEY = 'asm-editor_new-project-isa'
    onMount(() => {
        try {
            const stored = LANGUAGES.find(
                (value) => value === localStorage.getItem(LANGUAGE_STORAGE_KEY)
            )
            if (stored) language = stored
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

    function pickLanguage(id: string) {
        const picked = LANGUAGES.find((value) => value === id)
        if (!picked) return
        language = picked
        rememberLanguage(picked)
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
    const templateDescriptionId = $props.id()

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
            void goto(resolve('/projects/[project]', { project: project.id }))
        } catch (e) {
            console.error(e)
            toast.error('Error creating project')
        }
    }

    /** A program brought in instead of a template opens as Create would; several are listed. */
    async function importDropped(files: File[]) {
        const projects = await importFiles(files)
        if (projects.length === 1)
            void goto(resolve('/projects/[project]', { project: projects[0].id }))
        else if (projects.length > 1) void goto(resolve('/projects'))
    }
</script>

<svelte:head>
    <title>Create project - ASM Editor</title>
    <meta name="description" content="Create a new project" />
    <meta property="og:description" content="Create a new project" />
    <meta property="og:title" content="Create Project" />
</svelte:head>

<DefaultNavbar />
<!-- the other index pages' column and title height, with this page's own narrower column centred
     in it, its title over it: the owner's call of 2026-11-08 (design-system.md, D8) -->
<Page hasNavbar cropped="70rem" contentStyle="padding: 1rem">
    <div class="create-project">
        <header class="page-head">
            <Title style="margin-bottom: 0.5rem">Create new project</Title>
            {#if data.gettingStarted}
                <p class="guide">
                    New to ASM Editor? <a
                        href={resolve('/blog/posts/[slug]', { slug: data.gettingStarted })}
                        >Follow the getting-started guide</a
                    >.
                </p>
            {/if}
        </header>
        <Card padding="0">
            <Form onSubmit={create}>
                <div class="fields">
                    <div class="field">
                        <span aria-hidden="true">Instruction set</span>
                        <SegmentedControl
                            wrap
                            size="md"
                            ariaLabel="Instruction set"
                            options={languageOptions}
                            selected={language}
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
                        <!-- a line tall with no tags, so the fields under it stay put -->
                        <div class="language-tags">
                            {#each tags as tag (tag)}
                                <Badge tone="accent">{tag}</Badge>
                            {/each}
                        </div>
                    </div>
                    <div class="field">
                        <Select
                            title="Template"
                            options={templateOptions}
                            bind:value={templateId}
                            aria-describedby={selected ? templateDescriptionId : undefined}
                        >
                            {#snippet item(option)}
                                <span class="template-option-name">{option.key}</span>
                                <span class="template-option-description ellipsis">
                                    {templates.find((template) => template.id === option.value)
                                        ?.description ?? ''}
                                </span>
                            {/snippet}
                        </Select>
                        {#if selected}
                            <span class="template-description" id={templateDescriptionId}>
                                {selected.description}
                            </span>
                        {/if}
                    </div>
                    <TextField label="Name" placeholder="Name" bind:value={name} />
                    <Textarea title="Description" bind:value={description} />
                </div>
                <div class="card-footer">
                    <ButtonLink
                        href={resolve('/projects')}
                        kind="secondary"
                        {@attach tooltip('Cancel new project')}
                    >
                        Cancel
                    </ButtonLink>
                    <Button type="submit">Create</Button>
                </div>
            </Form>
        </Card>
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
    /* centred in the page's column (a flex column, where auto margins would shrink it to its
       content without the width); the title starts where the other index pages' titles do, and
       room between the drop zone and the footer */
    .create-project {
        width: 100%;
        max-width: 40rem;
        margin: 0 auto;
        padding-top: 1.5rem;
        padding-bottom: 4rem;

        @media screen and (max-width: 650px) {
            padding: 0.75rem 0 3rem;
        }
    }

    .page-head {
        margin-bottom: 1.5rem;
        text-align: center;
    }

    .guide {
        margin: 0;
        line-height: 1.6;
        color: var(--text-muted);

        a {
            color: var(--accent);
        }
    }

    .fields {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1.2rem;
        padding: 1.25rem;
    }

    /* a label over its control, as the shared fields draw theirs */
    .field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }

    /* the bar wraps to two rows of three on a phone, and three of two on the narrowest, so that no
       name is cut */
    @media (max-width: 560px) {
        .field {
            --segmented-columns: 3;
        }
    }
    @media (max-width: 354px) {
        .field {
            --segmented-columns: 2;
        }
    }

    /* drawn as the home page's instruction-set bar draws its squares */
    .language-square {
        flex: none;
        width: 0.5rem;
        height: 0.5rem;
        margin-right: 0.5rem;
        border-radius: 2px;
    }

    .language-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
        min-height: 1.1rem;
        margin-top: 0.2rem;
    }

    .template-option-name {
        display: block;
    }

    /* one row, clipped: a description is a hint at what the program does, not the program */
    .template-option-description {
        display: block;
        font-size: var(--fs-small);
        color: var(--text-muted);
    }

    .template-description {
        margin-top: 0.1rem;
        font-size: var(--fs-small);
        color: var(--text-muted);
    }

    /* a rule across the card, its edge's hairline, over the actions at the right */
    .card-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding: 0.9rem 1.25rem;
        border-top: 1px solid var(--line);
    }

    @media (max-width: 600px) {
        .fields {
            padding: 1rem;
        }
        .card-footer {
            padding: 0.8rem 1rem;
        }
    }

    .import-drop {
        margin-top: 1.5rem;
    }
</style>
