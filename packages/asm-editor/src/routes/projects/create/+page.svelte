<script lang="ts">
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import { languageAccent } from '#lib/languages/languageColors.ts'
    import {
        LANGUAGE_ORDER,
        languageCapabilities,
        type LanguageCapability
    } from '#lib/languages/languageCapabilities.ts'
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'
    import type { Component } from 'svelte'

    import Button from '#cmp/shared/button/Button.svelte'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import TextField from '#cmp/shared/input/TextField.svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    import InstructionSetPicker from '#cmp/shared/input/InstructionSetPicker.svelte'
    import Textarea from '#cmp/shared/input/Textarea.svelte'
    import Title from '#cmp/shared/layout/Header.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import Form from '#cmp/shared/layout/Form.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import { toast } from '#stores/toastStore.ts'
    import { type AvailableLanguages, makeProject } from '#lib/Project.svelte.ts'
    import { ProjectStore } from '#stores/projectsStore.svelte.ts'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import type { PageData } from './$types'
    import { warmUpMonaco } from '#lib/monaco/warmUp.ts'
    import { onMount } from 'svelte'
    import FileDropZone from '#cmp/shared/fileImporter/FileDropZone.svelte'
    import { IMPORTABLE_FILES, importFiles } from '#lib/projectImport.ts'
    import FaDesktop from '~icons/fa-solid/desktop'
    import FaKeyboard from '~icons/fa-solid/keyboard'
    import FaMouse from '~icons/fa-solid/mouse'
    import FaVolumeDown from '~icons/fa-solid/volume-down'
    import FaFolder from '~icons/fa-solid/folder'
    import FaCode from '~icons/fa-solid/code'
    import FaAlignLeft from '~icons/fa-solid/align-left'
    import FaFileCode from '~icons/fa-solid/file-code'
    import FaArrowRight from '~icons/fa-solid/arrow-right'

    let { data }: { data: PageData } = $props()

    //creating a project opens it in the editor straight after
    onMount(warmUpMonaco)

    let name = $state('')
    let description = $state('')
    let language: AvailableLanguages = $state('RISC-V-64')

    /** The mark of each thing a set can do, as the owner's mockup draws them (2026-11-08). */
    const CAPABILITY_ICONS: Record<LanguageCapability, Component> = {
        screen: FaDesktop,
        keyboard: FaKeyboard,
        mouse: FaMouse,
        sound: FaVolumeDown,
        fileSystem: FaFolder,
        compile: FaCode,
        disassemble: FaAlignLeft,
        decompile: FaFileCode
    }
    const capabilities = $derived(languageCapabilities(language))

    const LANGUAGE_STORAGE_KEY = 'asm-editor_new-project-isa'
    onMount(() => {
        try {
            const stored = LANGUAGE_ORDER.find(
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

    function pickLanguage(value: AvailableLanguages) {
        language = value
        rememberLanguage(value)
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
        <!-- the owner's mockup of 2026-11-08: two sections under header bands, then a footer with
             what will be created at the left and the actions at the right -->
        <Card>
            <Form onSubmit={create}>
                <h2 class="band first">Instruction set</h2>
                <div class="section">
                    <InstructionSetPicker selected={language} onSelect={pickLanguage} />
                    <ul class="capabilities" aria-label="Features">
                        {#each capabilities as capability (capability.id)}
                            {@const CapabilityIcon = CAPABILITY_ICONS[capability.id]}
                            <li class="capability" class:unavailable={!capability.available}>
                                <span class="capability-icon" aria-hidden="true"
                                    ><CapabilityIcon /></span
                                >
                                {capability.label}{#if !capability.available}<span
                                        class="visually-hidden">, not available</span
                                    >{/if}
                            </li>
                        {/each}
                    </ul>
                </div>
                <h2 class="band">Details</h2>
                <div class="section fields">
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
                    <TextField
                        label="Name"
                        hint="Optional"
                        placeholder="Unnamed"
                        bind:value={name}
                    />
                    <Textarea
                        title="Description"
                        hint="Optional"
                        placeholder="What this program does"
                        bind:value={description}
                    />
                </div>
                <div class="card-footer">
                    <p class="summary">
                        <span
                            class="language-square"
                            style:background-color={languageAccent(language)}
                            aria-hidden="true"
                        ></span>
                        <!-- the set and the template apart by the row's gap, no mark between them -->
                        <span class="summary-language">{languageLabel(language)}</span>
                        {#if selected}<span class="ellipsis">{selected.name}</span>{/if}
                    </p>
                    <div class="actions">
                        <ButtonLink
                            href={resolve('/projects')}
                            kind="ghost"
                            {@attach tooltip('Cancel new project')}
                        >
                            Cancel
                        </ButtonLink>
                        <Button type="submit" style="gap: 0.45rem">
                            Create project
                            <Icon size="caption"><FaArrowRight /></Icon>
                        </Button>
                    </div>
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
    @use '../../../styles/field.scss';
    @use '../../../styles/radius.scss' as *;

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

    /* a section's header, a band a shade lighter than the Card over a rule, as the Workbench's
       folding sections draw theirs (CollapsibleSection); the second one is ruled off above too */
    .band {
        margin: 0;
        padding: 0.6rem 1.25rem;
        background-color: var(--wb-section-header);
        border-block: 1px solid var(--line);
        font: 700 var(--fs-small) / 1.4 var(--font-ui);
        color: var(--secondary-text);
    }
    /* the first band is the Card's top, its corners inside the Card's 1px edge */
    .band.first {
        border-top: none;
        border-radius: nested-radius(var(--wb-radius), $border: 1px)
            nested-radius(var(--wb-radius), $border: 1px) 0 0;
    }

    .section {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0.85rem 1.25rem 1rem;
    }

    /* drawn as the home page's instruction-set bar draws its squares */
    .language-square {
        flex: none;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 2px;
    }

    .capabilities {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    /* a pill in a field's fill and edge; one the set cannot do is only outlined, dashed, its words
       dimmed and struck through, and says so to a screen reader in words */
    .capability {
        @include field.surface;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem 0.65rem;
        border-radius: var(--r-pill);
        font-size: var(--fs-caption);
        line-height: 1.3;
        white-space: nowrap;

        &.unavailable {
            background-color: transparent;
            border-style: dashed;
            color: color-mix(in srgb, field.$text 45%, transparent);
            text-decoration: line-through;
        }
    }

    .capability-icon {
        display: flex;
        flex: none;
        width: 0.8rem;
        height: 0.8rem;
        opacity: 0.75;
    }

    .fields {
        gap: 1.1rem;
    }

    /* a label over its control, as the shared fields draw theirs */
    .field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
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

    /* a rule across the card, its edge's hairline, over what will be created at the left and the
       actions at the right; on a phone the summary takes a line of its own over the actions.
       Held at the window's bottom while the Card's end is below it, so a set can be picked and
       created at once, and back in its place in the Card once the page reaches it (owner,
       2026-11-08): the Card's fill, so what scrolls under it does not show through, and its
       lower corners inside the Card's 1px edge */
    .card-footer {
        position: sticky;
        bottom: 0;
        z-index: 1;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem 1rem;
        padding: 0.7rem 1.25rem;
        border-top: 1px solid var(--line);
        background-color: var(--wb-surface);
        border-radius: 0 0 nested-radius(var(--wb-radius), $border: 1px)
            nested-radius(var(--wb-radius), $border: 1px);
    }

    .summary {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
        margin: 0;
        font: var(--fs-small) / 1.4 var(--font-mono);
        color: var(--text-muted);
    }

    .summary-language {
        flex: none;
    }

    .actions {
        display: flex;
        gap: 0.5rem;
        margin-left: auto;
    }

    @media (max-width: 600px) {
        .band {
            padding: 0.55rem 1rem;
        }
        .section {
            padding: 0.8rem 1rem 1rem;
        }
        .card-footer {
            padding: 0.7rem 1rem;
        }
    }

    .import-drop {
        margin-top: 1.5rem;
    }
</style>
