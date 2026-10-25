<script lang="ts">
    import type { PageData } from './$types'
    import ContentLinkCard from '#cmp/content/ContentLinkCard.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import { resolve } from '$app/paths'
    import { courseAccent } from '#lib/languages/languageColors.ts'
    import { onMount } from 'svelte'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import SearchPalette from '#cmp/search/SearchPalette.svelte'
    import { COURSES_SCOPE, courseLanguage } from '#lib/search/scope.ts'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import { resolveHref } from '#lib/hrefs.ts'

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
    description="Free interactive courses for M68K, MIPS, RISC-V, x86-64 and Z80 assembly. Learn the basics, run code in your browser and practice with exercises."
/>

<Page hasNavbar cropped="70rem" contentStyle="padding: 1rem;">
    <Header>Courses</Header>
    <div class="intro">
        <p>
            Learn assembly programming with interactive courses for M68K, MIPS, RISC-V, x86-64 and
            Z80. If you are new to assembly, start with
            <a href={resolve('/learn/courses/[courseId]', { courseId: 'assembly-basics' })}
                >Assembly basics</a
            > to learn about registers, memory, branching, the stack and system calls. Then choose a language
            course to write your first programs and work through examples.
        </p>
        <p>
            The lessons include code you can run in your browser. Step through a program one
            instruction at a time, undo steps and inspect registers and memory. Many lessons also
            include exercises with tests to check your solution.
        </p>
    </div>
    <SearchLauncher size="full" placeholder="Search in every course" />
    <div class="courses">
        {#each data.courses as course (course.slug)}
            {@const accent = courseAccent(course.slug)}
            {@const language = courseLanguage(course.slug)}
            <ContentLinkCard
                headingId={`course-${course.slug}`}
                title={course.name}
                description={course.description}
                {accent}
                primary={{
                    label: 'View course',
                    href: resolve('/learn/courses/[courseId]', { courseId: course.slug })
                }}
                secondary={language
                    ? {
                          label: `${languageLabel(language.toUpperCase())} docs`,
                          href: resolveHref(`/documentation/${language}`)
                      }
                    : undefined}
            />
        {/each}
    </div>
</Page>
<SearchPalette scope={COURSES_SCOPE} placeholder="Search in every course" />

<style>
    .intro {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
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
</style>
