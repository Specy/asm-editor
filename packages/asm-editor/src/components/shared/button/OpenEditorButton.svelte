<script lang="ts">
    /**
     * A reading page's way into the editor, at the foot of its sidebar: the reader's projects, or
     * making the first one when there are none yet.
     */
    import ButtonLink from './ButtonLink.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { ProjectStore } from '#stores/projectsStore.svelte.ts'

    const hasProjects = $derived(ProjectStore.projects.length > 0)
</script>

<ButtonLink
    style="width: 100%;"
    href={hasProjects ? '/projects' : '/projects/create'}
    {@attach tooltip('Open the editor')}
>
    {hasProjects ? 'Go to your projects' : 'Create your first project'}
</ButtonLink>
