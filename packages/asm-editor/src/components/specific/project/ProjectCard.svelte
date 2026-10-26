<script lang="ts">
    /**
     * A Project on the projects page, drawn as one of the Workbench's cards: a header band with the
     * name and the card's own actions, the description and when it was last edited in the body, and
     * the language beside Open at the bottom. The name and description are edited in place and
     * saved when they lose the focus.
     */
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import { languageAccent } from '#lib/languages/languageColors.ts'
    import type { Project } from '#lib/Project.svelte.ts'
    import timeAgo from 's-ago'
    import { ProjectStore } from '#stores/projectsStore.svelte.ts'
    import { ThemeStore } from '#stores/themeStore.svelte.ts'
    import FaTrashAlt from '~icons/fa-solid/trash-alt'
    import FaDownload from '~icons/fa-solid/download'
    import FaShareAlt from '~icons/fa-solid/share-alt'
    import FaArrowRight from '~icons/fa-solid/arrow-right'
    import { Prompt } from '#stores/promptStore.svelte.ts'
    import { toast } from '#stores/toastStore.ts'
    import { createEventDispatcher } from 'svelte'
    import { isSingleSourceProject } from '#lib/projectArchive.ts'
    import { resolve } from '$app/paths'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'

    interface Props {
        project: Project
    }

    let { project = $bindable() }: Props = $props()
    let textContent = $state(project.name || 'Unnamed')
    let descriptionContent = $state(project.description || '')
    const dispatcher = createEventDispatcher<{
        download: Project
        share: Project
    }>()
    /** One File travels as its source text; anything more only survives as the archive. */
    const singleSource = $derived(isSingleSourceProject(project))

    /** Open's fill: the language's own colour, the one its theme, Documentation and Courses wear. */
    const accent = $derived(languageAccent(project.language))
    const created = $derived(new Date(project.createdAt))
    const edited = $derived(new Date(project.updatedAt))

    /**
     * Saves the name or description that changed, and only that: the other may be one this list's
     * copy is behind on, changed in another tab since, and stays as it is stored.
     */
    async function save() {
        const name = textContent
        const description = descriptionContent
        const details: { name?: string; description?: string } = {}
        if (name !== (project.name || 'Unnamed')) details.name = name
        if (description !== (project.description || '')) details.description = description
        if (details.name === undefined && details.description === undefined) return
        const result = await ProjectStore.saveDetails(project.id, details)
        if (result.local === 'failed') toast.error(`Could not save "${name}" in the browser`)
    }
    async function deleteProject() {
        const result = await Prompt.confirm(`Are you sure you want to delete "${project.name}"?`)
        if (result === null) return
        if (!result) return
        try {
            await ProjectStore.deleteProject(project)
        } catch (error) {
            console.error(error)
            toast.error(`Could not delete "${project.name}"`)
        }
    }
</script>

<article class="project-card">
    <header class="card-header">
        <div
            class="name editable"
            title={textContent}
            contenteditable
            bind:textContent
            spellcheck="false"
            role="textbox"
            aria-label="Project name"
            tabindex="0"
            onblur={save}
        ></div>
        <div class="card-actions">
            <button
                class="card-action"
                title="Share this project"
                aria-label="Share this project"
                onclick={() => dispatcher('share', project)}
            >
                <FaShareAlt />
            </button>
            <button
                class="card-action"
                title={singleSource
                    ? 'Download this project as a source file'
                    : 'Download this project as an archive'}
                aria-label="Download this project"
                onclick={() => dispatcher('download', project)}
            >
                <FaDownload />
            </button>
            <button
                class="card-action delete"
                title="Delete this project"
                aria-label="Delete this project"
                onclick={deleteProject}
            >
                <FaTrashAlt />
            </button>
        </div>
    </header>
    <div class="card-body">
        <div
            class="description editable"
            contenteditable
            bind:textContent={descriptionContent}
            spellcheck="false"
            role="textbox"
            aria-label="Project description"
            aria-multiline="true"
            tabindex="0"
            data-placeholder="Add a description"
            onblur={save}
        ></div>
        <span
            class="edited ellipsis"
            title={`Created ${created.toLocaleString()}\nEdited ${edited.toLocaleString()}`}
        >
            Edited {timeAgo(edited)}
        </span>
    </div>
    <footer class="card-footer">
        <span class="language">{languageLabel(project.language)}</span>
        <ButtonLink
            bg={accent}
            color={ThemeStore.textOfColor(accent)}
            href={resolve('/projects/[project]', { project: project.id })}
            style="gap: 0.45rem; padding: 0.3rem 0.75rem; font-size: 0.85rem"
            title="Open this project"
        >
            Open
            <Icon size={0.7}>
                <FaArrowRight />
            </Icon>
        </ButtonLink>
    </footer>
</article>

<style lang="scss">
    /* a Workbench card (workbench.css): the page's surface inside a 1px edge, with a header band a
       shade lighter than the card */
    .project-card {
        display: flex;
        flex-direction: column;
        min-width: 0;
        height: 100%;
        background-color: var(--wb-surface);
        color: var(--secondary-text);
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
        overflow: hidden;
    }

    .card-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: none;
        min-height: 2.4rem;
        padding: 0 0.3rem 0 0.7rem;
        background-color: var(--wb-section-header);
        border-bottom: 1px solid var(--wb-line);
    }

    /* text that reads as text until it is pointed at or edited */
    .editable {
        /* the page around it takes no selection (projects/+page.svelte) */
        user-select: text;
        border-radius: 0.25rem;
        outline: 1px solid transparent;
        outline-offset: 0;
        transition:
            background-color 0.15s,
            outline-color 0.15s;

        &:hover {
            background-color: color-mix(in srgb, var(--tertiary) 45%, transparent);
        }

        &:focus {
            background-color: var(--background);
            outline-color: color-mix(in srgb, var(--accent) 70%, transparent);
        }
    }

    .name {
        flex: 1;
        min-width: 0;
        padding: 0.2rem 0.3rem;
        margin-left: -0.3rem;
        font-size: 0.95rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        &:focus {
            text-overflow: clip;
        }
    }

    .card-actions {
        display: flex;
        align-items: center;
        gap: 0.1rem;
        flex: none;
    }

    .card-action {
        display: grid;
        place-items: center;
        width: 1.75rem;
        height: 1.75rem;
        padding: 0.42rem;
        border-radius: 0.25rem;
        background: transparent;
        color: inherit;
        opacity: 0.75;
        cursor: pointer;
        transition:
            background-color 0.15s,
            color 0.15s,
            opacity 0.15s;

        :global(svg) {
            width: 100%;
            height: 100%;
        }

        &:hover {
            opacity: 1;
            background-color: var(--tertiary);
        }

        &:focus-visible {
            opacity: 1;
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }

        &.delete:hover {
            color: var(--red);
            background-color: color-mix(in srgb, var(--red) 15%, transparent);
        }
    }

    .card-body {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        flex: 1;
        padding: 0.6rem 0.7rem 0.5rem;
    }

    .description {
        flex: 1;
        min-height: 2.6rem;
        padding: 0.25rem 0.3rem;
        margin: -0.25rem -0.3rem;
        font-size: 0.85rem;
        line-height: 1.45;
        color: var(--secondary-text-muted, var(--secondary-text));
        overflow-wrap: anywhere;

        &:empty::before {
            content: attr(data-placeholder);
            color: var(--hint);
            opacity: 0.7;
        }
    }

    .card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        flex: none;
        padding: 0.4rem 0.4rem 0.4rem 0.7rem;
        border-top: 1px solid var(--wb-line);
    }

    .edited {
        align-self: flex-end;
        max-width: 100%;
        font-size: 0.75rem;
        color: var(--hint);
    }

    .language {
        flex: none;
        color: var(--hint);
        font-size: 0.85rem;
        font-weight: 500;
        white-space: nowrap;
    }
</style>
