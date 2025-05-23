<script lang="ts">
    import type { Project } from '$lib/Project.svelte'
    import timeAgo from 's-ago'
    import { ProjectStore } from '$stores/projectsStore.svelte'
    import FaTrashAlt from 'svelte-icons/fa/FaTrashAlt.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import { Prompt } from '$stores/promptStore'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import FaDownload from 'svelte-icons/fa/FaDownload.svelte'
    import { createEventDispatcher } from 'svelte'
    import { BUILTIN_THEMES, ThemeStore } from '$stores/themeStore.svelte'
    import { LANGUAGE_THEMES } from '$lib/Config'
    import FaShareAlt from 'svelte-icons/fa/FaShareAlt.svelte'

    interface Props {
        project: Project
    }

    let { project = $bindable() }: Props = $props()
    let textContent = $state(project.name || 'Unnamed')
    let descriptionContent = $state(project.description || '')
    const dispatcher = createEventDispatcher<{ download: Project, share: Project }>()

    const colors = $derived(
        BUILTIN_THEMES.find((t) => t.id === LANGUAGE_THEMES[project.language]) ?? BUILTIN_THEMES[0]
    )
    function save() {
        project.name = textContent
        project.description = descriptionContent
        ProjectStore.save(project)
    }
    async function deleteProject() {
        const result = await Prompt.confirm(`Are you sure you want to delete "${project.name}"?`)
        if (!result) return
        ProjectStore.deleteProject(project)
    }
</script>

<article class="project-card">
    <div
        class="project-title"
        contenteditable
        bind:textContent
        spellcheck="false"
        onblur={save}
    ></div>
    <div
        class="description"
        contenteditable
        bind:textContent={descriptionContent}
        spellcheck="false"
        onblur={save}
    ></div>
    <div class="project-dates">
        <div>Created</div>
        <div>
            {timeAgo(new Date(project.createdAt))}
        </div>
        <div>Edited</div>
        <div>
            {timeAgo(new Date(project.updatedAt))}
        </div>
    </div>
    <div class="project-footer">
        <div style="margin-left: 0.4rem">
            {project.language.toUpperCase()}
        </div>
        <div style="display: flex; gap: 0.4rem">
            <Button
              cssVar="secondary"
              style="width: 2.2rem; height: 2.2rem;"
              title="Share this project"
              onClick={() => dispatcher('share', project)}
            >
                <Icon>
                    <FaShareAlt />
                </Icon>
            </Button>
            <Button
                cssVar="secondary"
                style="width: 2.2rem; height: 2.2rem;"
                title="Download this project"
                onClick={() => dispatcher('download', project)}
            >
                <Icon>
                    <FaDownload />
                </Icon>
            </Button>
            <button class="trash-icon" onclick={deleteProject} title="Delete this project">
                <Icon>
                    <FaTrashAlt />
                </Icon>
            </button>

            <ButtonLink
                bg={colors.theme.accent2.color}
                color={ThemeStore.textOfColor(colors.theme.accent2.color)}
                href={`/projects/${project.id}`}
                title="Open this project"
            >
                Open
            </ButtonLink>
        </div>
    </div>
</article>

<style lang="scss">
    .description {
        padding: 0.5rem;
        margin: 0.5rem 0;
        background-color: transparent;
        transition: all 0.2s;
        border-radius: 0.4rem;
        &:hover,
        &:focus {
            background-color: var(--secondary);
            color: var(--secondary-text);
            filter: brightness(1.2);
        }
    }

    .project-dates {
        color: var(--hint);
        font-size: 0.8rem;
        display: grid;
        grid-template-columns: 1fr 1fr;
        margin-left: 0.4rem;
        column-gap: 0.5rem;
        row-gap: 0.3rem;
        margin-bottom: 0.5rem;
    }
    .trash-icon {
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--red);
        width: 2.2rem;
        cursor: pointer;
        height: 2.2rem;
        display: flex;
        justify-content: center;
        align-items: center;
        transition: all 0.2s;
        &:hover {
            background-color: var(--red);
            color: var(--red-text);
        }
    }
    .project-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .project-card {
        width: 100%;
        background-color: var(--secondary);
        color: var(--secondary-text);
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        padding: 0.6rem;
        border-radius: 0.6rem;
        height: fit-content;
    }
    .project-title {
        font-size: 1.3rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
        padding: 0.4rem;
        justify-content: center;
        border-radius: 0.4rem;
        background-color: transparent;
        transition: all 0.2s;
        &:hover,
        &:focus {
            background-color: var(--secondary);
            color: var(--secondary-text);
            filter: brightness(1.2);
        }
    }
</style>
