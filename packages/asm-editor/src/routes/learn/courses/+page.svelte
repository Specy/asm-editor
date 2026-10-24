<script lang="ts">
    import type { PageData } from './$types'
    import Card from '#cmp/shared/layout/Card.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import { resolve } from '$app/paths'
    import { courseAccent } from '#lib/languages/languageColors.ts'
    import { onMount } from 'svelte'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import SearchPalette from '#cmp/search/SearchPalette.svelte'
    import { COURSES_SCOPE } from '#lib/search/scope.ts'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()

    // the list of Courses searches every Course, as a General course page does
    onMount(() => searchClient.preload(COURSES_SCOPE))
</script>

<DefaultNavbar />

<PageMeta
    title="Assembly courses - M68K, MIPS, RISC-V, x86-64, Z80 | Asm Editor"
    description="Free interactive assembly courses: start with Assembly basics, then learn M68K, MIPS, RISC-V, x86-64 or Z80 with code that runs in your browser."
/>

<Page hasNavbar cropped contentStyle="padding: 1rem;">
    <Header>Courses</Header>
    <div class="intro">
        <p>
            Interactive courses on assembly programming.
            <a href={resolve('/learn/courses/[courseId]', { courseId: 'assembly-basics' })}
                >Assembly basics</a
            > covers what every assembly language has in common, from registers and memory to branching,
            the stack and system calls, and is the place to start if you have never written assembly.
            The language courses then teach M68K, MIPS, RISC-V, x86-64 and Z80 one at a time, from a first
            program to complete examples such as sorting and searching an array.
        </p>
        <p>
            The code in the lessons runs in your browser: each playground is an editor with its own
            emulator, where you can run a program, step through it one instruction at a time, undo a
            step and watch the registers change. In the language courses, many lessons close with an
            exercise whose tests check your solution.
        </p>
    </div>
    <SearchLauncher size="full" placeholder="Search in every course" />
    <div class="courses">
        {#each data.courses as course (course.slug)}
            {@const accent = courseAccent(course.slug)}
            <a
                href={resolve('/learn/courses/[courseId]', { courseId: course.slug })}
                class="course"
                class:of-a-language={accent !== null}
                style={accent ? `--course-accent: ${accent}` : ''}
            >
                <Card
                    background="secondary"
                    gap="1rem"
                    padding="1rem"
                    style="width: 100%; height: 100%"
                >
                    <Header type="h2" noMargin>
                        {course.name}
                    </Header>
                </Card>
            </a>
        {/each}
    </div>
</Page>
<SearchPalette scope={COURSES_SCOPE} placeholder="Search in every course" />

<style>
    .intro {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        max-width: 60rem;
        margin-bottom: 1.5rem;
        line-height: 1.5;
        color: var(--background-text-muted);
    }
    .intro p {
        margin: 0;
    }
    .intro a {
        color: var(--accent);
        text-decoration: underline;
    }
    .courses {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
        gap: 1rem;
        width: 100%;
        margin-top: 1.5rem;
    }
    .courses a {
        display: flex;
        border-radius: 0.5rem;
    }

    /* A Language course wears its language's colour, the same one its pages and its documentation
       show. The General course has no language and stays as it is, which is what tells the two
       kinds apart at a glance. */
    .course.of-a-language > :global(*) {
        border-left: 0.3rem solid var(--course-accent);
        background-color: color-mix(in srgb, var(--course-accent) 8%, var(--secondary)) !important;
        transition: background-color 0.2s;
    }
    .course.of-a-language:hover > :global(*) {
        background-color: color-mix(in srgb, var(--course-accent) 18%, var(--secondary)) !important;
    }
</style>
