<script lang="ts">
    /**
     * The Lectures whose code uses the instruction, as the last line of its page's header: the way
     * from what an instruction does to where a Course teaches it in a program
     * (`lectureInstructions.ts`). Every Lecture is a link in the page's HTML from the start, for
     * crawlers as much as for readers; a long list shows its first few, and opens in place into one
     * row a Lecture, its Course beside it, so the example stays the last thing on the page.
     */
    import { resolve } from '$app/paths'
    import type { InstructionLesson } from '#lib/content/lectureInstructions.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import { courseLanguage, documentationLanguageOf } from '#lib/search/scope.ts'

    interface Props {
        lessons: readonly InstructionLesson[]
        /** The page's language: the closed line names a Course only when it is another one's. */
        language: AvailableLanguages
    }

    /** The Lectures the closed line shows. One more shows whole: "+1 more" would hide nothing. */
    const SHOWN = 3

    let { lessons, language }: Props = $props()
    const id = $props.id()
    let open = $state(false)
    let long = $derived(lessons.length > SHOWN + 1)
    let ownCourse = $derived(documentationLanguageOf(language))
</script>

{#if lessons.length > 0}
    <div class="lessons" class:long class:open>
        <span class="label"
            >Used in{#if open}&nbsp;{lessons.length} lessons{/if}</span
        >
        <ul {id}>
            {#each lessons as lesson, index (`${lesson.courseSlug}/${lesson.moduleSlug}/${lesson.lectureSlug}`)}
                <li
                    class:extra={index >= SHOWN}
                    class:other={courseLanguage(lesson.courseSlug) !== ownCourse}
                >
                    <a
                        href={resolve('/learn/courses/[courseId]/[moduleId]/[lectureId]', {
                            courseId: lesson.courseSlug,
                            moduleId: lesson.moduleSlug,
                            lectureId: lesson.lectureSlug
                        })}>{lesson.name}</a
                    ><span class="course">{lesson.course}</span>
                </li>
            {/each}
        </ul>
        {#if long}
            <button
                type="button"
                class="more"
                aria-expanded={open}
                aria-controls={id}
                onclick={() => (open = !open)}
            >
                {open ? 'Show fewer' : `+${lessons.length - SHOWN} more`}
            </button>
        {/if}
    </div>
{/if}

<style>
    /* closed, a line of text like the header's other facts */
    .lessons {
        --rule: color-mix(in srgb, var(--tertiary) 85%, transparent);
        max-width: 80ch;
        min-width: 0;
        font-size: 0.9rem;
        line-height: 1.5;
        color: var(--background-text-muted);
    }
    ul {
        display: inline;
        margin: 0;
        padding: 0;
        list-style: none;
    }
    li {
        display: inline;
    }
    li + li::before {
        content: '·' / '';
        padding: 0 0.4em;
    }
    .long:not(.open) .extra {
        display: none;
    }
    a {
        color: var(--accent);
        text-decoration: underline;
        overflow-wrap: anywhere;
    }
    .course {
        display: none;
    }
    .other .course {
        display: inline;
        margin-left: 0.3em;
        white-space: nowrap;
    }
    .other .course::before {
        content: '(';
    }
    .other .course::after {
        content: ')';
    }
    .more {
        margin-left: 0.6em;
        padding: 0;
        border: none;
        background: none;
        color: var(--accent);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
    }
    .more:hover {
        text-decoration: underline;
    }
    .more:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }

    /* open, ruled like the instruction's own boxes: one Lecture a row, its Course beside it */
    .open ul {
        display: grid;
        grid-template-columns: minmax(0, max-content) max-content;
        width: fit-content;
        max-width: 100%;
        margin: 0.45rem 0;
        border: 1px solid var(--rule);
        border-radius: var(--wb-radius, 0.4rem);
    }
    .open li {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: subgrid;
        column-gap: 1.5rem;
        padding: 0.45rem 0.8rem;
        border-top: 1px solid var(--rule);
    }
    .open li:first-child {
        border-top: none;
    }
    .open li + li::before {
        content: none;
    }
    .open .course {
        display: inline;
        margin-left: 0;
    }
    .open .course::before,
    .open .course::after {
        content: none;
    }
    .open .more {
        margin-left: 0;
    }
    /* on a phone the Course goes under its Lecture */
    @media (max-width: 600px) {
        .open ul {
            grid-template-columns: minmax(0, 1fr);
        }
    }
    @media print {
        .long:not(.open) .extra {
            display: inline;
        }
        .more {
            display: none;
        }
    }
</style>
