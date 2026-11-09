<script lang="ts">
    import { resolve } from '$app/paths'
    import Column from '#cmp/shared/layout/Column.svelte'
    import type { Lecture } from '#lib/content/getters.ts'
    import SidebarLink from './SidebarLink.svelte'
    interface Props {
        /** The lecture the reader is on, the sidebar's current row. */
        currentLecture?: Lecture
        lectures: Lecture[]
        courseId: string
        moduleId: string
        onClick?: (e: MouseEvent) => void
        /**
         * The lectures as the sidebar's rows (SidebarLink), as the exam builder draws its parts:
         * the course sidebar's look. Left out, the list of a course's page.
         */
        outline?: boolean
    }

    let { currentLecture, lectures, courseId, moduleId, onClick, outline = false }: Props = $props()
</script>

<Column>
    {#each lectures as lecture (lecture.slug)}
        {@const href = resolve('/learn/courses/[courseId]/[moduleId]/[lectureId]', {
            courseId,
            moduleId,
            lectureId: lecture.slug
        })}
        {#if outline}
            <SidebarLink {href} current={lecture.slug === currentLecture?.slug} {onClick}>
                <div class="lecture-link-inner">
                    {lecture.name}
                </div>
            </SidebarLink>
        {:else}
            <a {href} class="lecture-link" onclick={onClick}>
                <div class="lecture-link-inner">
                    {lecture.name}
                </div>
            </a>
        {/if}
    {/each}
</Column>

<style lang="scss">
    /* a course page's list, in a Card: the row under the pointer tinted (design-system.md, D4),
       its text sliding in where a 0.2rem edge used to push it */
    .lecture-link {
        padding: 0.6rem 1rem 0.6rem 1.2rem;
        border-radius: 0 0.2rem 0.2rem 0;
    }
    .lecture-link:hover {
        background-color: var(--hover-bg);
    }
    .lecture-link-inner {
        font-size: var(--fs-body);
    }
    .lecture-link > .lecture-link-inner {
        transition: transform var(--dur-fast);
    }
    .lecture-link:hover > .lecture-link-inner {
        transform: translateX(0.2rem);
    }
</style>
