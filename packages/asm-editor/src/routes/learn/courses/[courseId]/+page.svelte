<script lang="ts">
    import type { PageData } from './$types'
    import Page from '#cmp/shared/layout/Page.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import TogglableSection from '#cmp/shared/layout/TogglableSection.svelte'
    import Column from '#cmp/shared/layout/Column.svelte'
    import LecturesMenu from '#cmp/content/LecturesMenu.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import MarkdownRenderer from '#cmp/shared/markdown/MarkdownRenderer.svelte'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import { courseLanguage } from '#lib/search/scope.ts'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { breadcrumbLd, courseLd } from '#lib/seo.ts'

    interface Props {
        data: PageData & { content: string }
    }

    let { data }: Props = $props()

    let coursePathname = $derived(`/learn/courses/${data.course.slug}`)
    let jsonLd = $derived([
        breadcrumbLd([
            { name: 'Courses', pathname: '/learn/courses' },
            { name: data.course.name, pathname: coursePathname }
        ]),
        courseLd({
            name: data.course.name,
            description: data.course.description,
            pathname: coursePathname,
            lectures: data.course.modules.flatMap((module) =>
                module.lectures.map((lecture) => ({
                    name: lecture.name,
                    description: lecture.description,
                    pathname: `${coursePathname}/${module.slug}/${lecture.slug}`
                }))
            )
        })
    ])
</script>

<PageMeta
    title="{data.course.name} course: free interactive lessons - ASM Editor"
    description={data.course.description}
    type="article"
    {jsonLd}
/>

<Page cropped="70rem" contentStyle="padding: 1rem; gap: 2rem">
    <Header>
        {data.course.name}
    </Header>
    <!-- what the course is, under its title and at its left edge, before the search -->
    <div class="reading-copy">
        <MarkdownRenderer source={data.content} centered={false} />
    </div>
    <SearchLauncher
        size="full"
        placeholder={courseLanguage(data.course.slug)
            ? `Search ${data.course.name} and its documentation`
            : 'Search in every course'}
    />
    <Column gap="1rem">
        {#each data.course.modules as module (module.slug)}
            <TogglableSection
                open={true}
                level={2}
                sectionStyle="margin-left: 0.6rem; padding-left: 0.6rem;"
                style="gap: 0.2rem"
            >
                {#snippet title()}{module.name}{/snippet}
                <Card style="overflow: hidden">
                    <LecturesMenu
                        lectures={module.lectures}
                        courseId={data.course.slug}
                        moduleId={module.slug}
                    />
                </Card>
            </TogglableSection>
        {/each}
    </Column>
</Page>
