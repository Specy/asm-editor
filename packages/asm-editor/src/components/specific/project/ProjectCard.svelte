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
    import IconButton from '#cmp/shared/button/IconButton.svelte'
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
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'

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
            class="name editable ellipsis"
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
            <IconButton
                class="card-action"
                quiet
                label="Share this project"
                {@attach tooltip('Share this project')}
                onClick={() => dispatcher('share', project)}
            >
                <FaShareAlt />
            </IconButton>
            <IconButton
                class="card-action"
                quiet
                label="Download this project"
                {@attach tooltip(
                    singleSource
                        ? 'Download this project as a source file'
                        : 'Download this project as an archive'
                )}
                onClick={() => dispatcher('download', project)}
            >
                <FaDownload />
            </IconButton>
            <IconButton
                class="card-action delete"
                quiet
                label="Delete this project"
                {@attach tooltip('Delete this project')}
                onClick={deleteProject}
            >
                <FaTrashAlt />
            </IconButton>
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
            size="sm"
            title="Open this project"
        >
            Open
            <Icon size="caption">
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
            background-color var(--dur-fast),
            outline-color var(--dur-fast);

        &:hover {
            background-color: var(--hover-bg);
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
        font-size: var(--fs-body);
        font-weight: 600;

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

    /* Delete turns red under the pointer, over a red tint */
    .card-actions :global(.card-action.delete:hover) {
        color: var(--danger);
        background-color: color-mix(in srgb, var(--danger) 15%, transparent);
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
        font-size: var(--fs-small);
        line-height: 1.45;
        color: var(--secondary-text-prose, var(--secondary-text));
        overflow-wrap: anywhere;

        &:empty::before {
            content: attr(data-placeholder);
            color: var(--hint);
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
        font-size: var(--fs-caption);
        color: var(--hint);
    }

    .language {
        flex: none;
        color: var(--hint);
        font-size: var(--fs-small);
        font-weight: 500;
        white-space: nowrap;
    }
</style>
