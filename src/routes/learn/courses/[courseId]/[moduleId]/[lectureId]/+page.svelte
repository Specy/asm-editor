<script lang="ts">
    import type { PageData } from './$types'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()

</script>

<svelte:head>
	<title>{data.lecture.name} - {data.course.name}</title>
	<meta name="description" content={data.lecture.description} />
	<meta property="og:title" content={data.lecture.name} />
	<meta property="og:description" content={data.lecture.description} />
	<meta property="og:type" content="article" />
	<meta property="og:image" content={data.course.image} />
</svelte:head>

<Page cropped style="padding: 1rem">
	<Header>
		{data.lecture.name}
	</Header>
	<p>
		{data.lecture.description}
	</p>
	<MarkdownRenderer
		source={data.content}
	/>

</Page>

