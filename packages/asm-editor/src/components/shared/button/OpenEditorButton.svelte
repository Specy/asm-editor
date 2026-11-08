<script lang="ts">
    /**
     * A reading page's way into the editor, at the foot of its sidebar: the reader's projects, or
     * making the first one when there are none yet. A secondary Button: the page's own content is
     * what the reader came for (owner, 2026-11-08).
     */
    import { onMount } from 'svelte'
    import ButtonLink from './ButtonLink.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { storedProjectCount } from '#lib/storage/projectCount.ts'

    /** How many Projects are stored, counted without reading them; until then, none. */
    let count = $state<number | undefined>(undefined)
    onMount(() => {
        void storedProjectCount().then((stored) => (count = stored))
    })
    const hasProjects = $derived(count !== undefined && count > 0)
</script>

<ButtonLink
    style="width: 100%;"
    kind="secondary"
    href={hasProjects ? '/projects' : '/projects/create'}
    {@attach tooltip('Open the editor')}
>
    {hasProjects ? 'Go to your projects' : 'Create your first project'}
</ButtonLink>
