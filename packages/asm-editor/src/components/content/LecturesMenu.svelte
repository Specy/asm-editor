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
        /**
         * The lectures as an outline's rows (styles/outline.scss), as the exam builder draws its
         * parts: the course sidebar's look. The caller runs them to its own leading edge.
         */
        outline?: boolean
    }

    let {
        currentLecture,
        lectures,
        courseId,
        moduleId,
        onClick,
        lectureStyle,
        outline = false
    }: Props = $props()
</script>

<Column>
    {#each lectures as lecture (lecture.slug)}
        <a
            href={resolve('/learn/courses/[courseId]/[moduleId]/[lectureId]', {
                courseId,
                moduleId,
                lectureId: lecture.slug
            })}
            class={outline ? 'row' : 'lecture-link'}
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
    @use '../../styles/outline.scss';
    @use '../../styles/focus.scss' as *;

    /* the text where a 0.2rem edge used to push it; a caller's `lectureStyle` padding counts it */
    .lecture-link {
        padding: 0.4rem 0.6rem 0.4rem 0.8rem;
        border-radius: 0 0.2rem 0.2rem 0;
    }

    /* the row under the pointer, and the page you are on (design-system.md, D4) */
    .lecture-link:hover:not(.current-lecture) {
        background-color: var(--hover-bg);
    }
    .lecture-link.current-lecture {
        @include rows.selected;
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

    /* the outline's rows: edge to edge with no gap, their padding the rhythm, rounded on the far
       side, the one under the pointer in the hover tint and the lecture shown in the current
       item's look; the keyboard's ring inside the row, which may sit against a clipping edge */
    .row {
        @include outline.row('[aria-current="page"]');
        @include outline.row-padding;
        @include focus-ring($inset: true);
    }
</style>
