<script lang="ts">
    /**
     * The Lectures whose code uses the instruction, under its page: the way from what an
     * instruction does to where a Course teaches it in a program (`lectureInstructions.ts`).
     */
    import { resolve } from '$app/paths'
    import type { InstructionLesson } from '#lib/content/lectureInstructions.ts'

    interface Props {
        lessons: readonly InstructionLesson[]
    }

    let { lessons }: Props = $props()
</script>

{#if lessons.length > 0}
    <section class="lessons">
        <h2>Used in these lessons</h2>
        <ul>
            {#each lessons as lesson (`${lesson.courseSlug}/${lesson.moduleSlug}/${lesson.lectureSlug}`)}
                <li>
                    <a
                        href={resolve('/learn/courses/[courseId]/[moduleId]/[lectureId]', {
                            courseId: lesson.courseSlug,
                            moduleId: lesson.moduleSlug,
                            lectureId: lesson.lectureSlug
                        })}>{lesson.name}</a
                    >
                    <span class="course">{lesson.course}</span>
                </li>
            {/each}
        </ul>
    </section>
{/if}

<style>
    .lessons {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        min-width: 0;
        max-width: 64rem;
        margin-top: 0.8rem;
    }
    h2 {
        margin: 0;
        font-size: 1.25rem;
    }
    /* ruled like the instruction's own boxes: one Lecture a row, its Course beside it */
    ul {
        display: grid;
        grid-template-columns: minmax(0, max-content) max-content;
        width: fit-content;
        max-width: 100%;
        margin: 0;
        padding: 0;
        list-style: none;
        border: 1px solid color-mix(in srgb, var(--tertiary) 85%, transparent);
        border-radius: var(--wb-radius, 0.4rem);
        font-size: 0.95rem;
    }
    li {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: subgrid;
        column-gap: 1.5rem;
        padding: 0.45rem 0.8rem;
        border-top: 1px solid color-mix(in srgb, var(--tertiary) 85%, transparent);
    }
    li:first-child {
        border-top: none;
    }
    a {
        color: var(--accent);
        text-decoration: underline;
        overflow-wrap: anywhere;
    }
    .course {
        color: var(--background-text-muted);
    }
    /* on a phone the Course goes under its Lecture */
    @media (max-width: 600px) {
        ul {
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>
