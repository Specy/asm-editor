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
    title="{data.course.name} course - free interactive lessons | Asm Editor"
    description={data.course.description}
    type="article"
    {jsonLd}
/>

<svelte:head>
    <meta property="og:image" content={data.course.image} />
</svelte:head>

<Page cropped style="padding: 1rem;" contentStyle="gap: 2rem">
    <Header noMargin>
        {data.course.name}
    </Header>
    <SearchLauncher
        size="full"
        placeholder={courseLanguage(data.course.slug)
            ? `Search ${data.course.name} and its documentation`
            : 'Search in every course'}
    />

    <Column gap="0.8rem">
        <MarkdownRenderer source={data.content} />
    </Column>
    <Column gap="1rem">
        {#each data.course.modules as module (module.slug)}
            <TogglableSection
                open={true}
                sectionStyle="margin-left: 0.6rem; padding-left: 0.6rem;"
                style="gap: 0.2rem"
            >
                {#snippet title()}
                    <h4 style="font-weight: normal; margin-left: -0.1rem">
                        {module.name}
                    </h4>
                {/snippet}
                <Card background="secondary" style="overflow: hidden">
                    <LecturesMenu
                        lectures={module.lectures}
                        hrefBase={`/learn/courses/${data.course.slug}/${module.slug}`}
                        lectureStyle="padding: 0.6rem 1rem"
                    />
                </Card>
            </TogglableSection>
        {/each}
    </Column>
</Page>
