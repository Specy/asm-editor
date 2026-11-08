<script lang="ts">
    import { resolve } from '$app/paths'
    import Column from '#cmp/shared/layout/Column.svelte'
    import type { Lecture } from '#lib/content/getters.ts'
    interface Props {
        currentLecture?: Lecture
        lectures: Lecture[]
        courseId: string
        moduleId: string
        onClick?: (e: MouseEvent) => void
        lectureStyle?: string
    }

    let { currentLecture, lectures, courseId, moduleId, onClick, lectureStyle }: Props = $props()
</script>

<Column>
    {#each lectures as lecture (lecture.slug)}
        <a
            href={resolve('/learn/courses/[courseId]/[moduleId]/[lectureId]', {
                courseId,
                moduleId,
                lectureId: lecture.slug
            })}
            class="lecture-link"
            class:current-lecture={lecture.slug === currentLecture?.slug}
            aria-current={lecture.slug === currentLecture?.slug ? 'page' : undefined}
            onclick={onClick}
            style={lectureStyle}
        >
            <div class="lecture-link-inner">
                {lecture.name}
            </div>
        </a>
    {/each}
</Column>

<style lang="scss">
    @use '../../styles/rows.scss';

    /* the text where a 0.2rem edge used to push it; a caller's `lectureStyle` padding counts it */
    a {
        padding: 0.4rem 0.6rem 0.4rem 0.8rem;
        border-radius: 0 0.2rem 0.2rem 0;
    }

    /* the row under the pointer, and the page you are on (design-system.md, D4) */
    a:hover:not(.current-lecture) {
        background-color: var(--hover-bg);
    }
    .current-lecture {
        @include rows.selected;
    }
    .lecture-link-inner {
        transition: transform var(--dur-fast);
        font-size: var(--fs-body);
    }
    a:hover > .lecture-link-inner {
        transform: translateX(0.2rem);
    }
</style>
