<script lang="ts">
    import type { PageData } from './$types'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import TogglableSection from '$cmp/shared/layout/TogglableSection.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import LecturesMenu from '$cmp/content/LecturesMenu.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'

    interface Props {
        data: PageData & { content: string }
    }

    let { data }: Props = $props()
</script>

<svelte:head>
    <title>{data.course.name}</title>
    <meta name="description" content={data.course.description} />
    <meta property="og:title" content={data.course.name} />
    <meta property="og:description" content={data.course.description} />
    <meta property="og:type" content="article" />
    <meta property="og:image" content={data.course.image} />
</svelte:head>

<Page cropped style="padding: 1rem;" contentStyle="gap: 2rem">
    <Header noMargin>
        {data.course.name}
    </Header>

    <Column gap="0.8rem">
        <MarkdownRenderer source={data.content} />
    </Column>
    <Column gap="1rem">
        {#each data.course.modules as module}
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
