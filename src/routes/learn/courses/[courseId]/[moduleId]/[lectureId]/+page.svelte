<script lang="ts">
    import type { PageData } from './$types'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import FaChevronLeft from 'svelte-icons/fa/FaChevronLeft.svelte'
    import FaChevronRight from 'svelte-icons/fa/FaChevronRight.svelte'
    import { page } from '$app/state'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()

    let currentLectureName = $derived(page.params.lectureId)


    let lectures = $derived(data.course.modules.flatMap(m => m.lectures))

    let nextLecture = $derived.by(() => {
        const currentLectureIndex = lectures.findIndex(l => l.slug === currentLectureName)
        if (currentLectureIndex === -1) return null
        const next = lectures[currentLectureIndex + 1]
        if (!next) return null
        const module = data.course.modules.find(m => m.lectures.some(l => l.slug === next?.slug))
        return {
            ...lectures[currentLectureIndex + 1],
            module: module
        }
    })

    let previousLecture = $derived.by(() => {
        const currentLectureIndex = lectures.findIndex(l => l.slug === currentLectureName)
        if (currentLectureIndex === -1) return null
        const prev = lectures[currentLectureIndex - 1]
        if (!prev) return null
        const module = data.course.modules.find(m => m.lectures.some(l => l.slug === prev?.slug))
        return {
            ...lectures[currentLectureIndex - 1],
            module: module
        }
    })

</script>

<svelte:head>
	<title>{data.lecture.name} - {data.course.name}</title>
	<meta name="description" content={data.lecture.description} />
	<meta property="og:title" content={data.lecture.name} />
	<meta property="og:description" content={data.lecture.description} />
	<meta property="og:type" content="article" />
	<meta property="og:image" content={data.course.image} />
</svelte:head>

<Page cropped="100ch" style="padding: 1rem;" contentStyle="gap: 1rem;">
	<Card padding="1.5rem" gap="1rem" background="secondary">
		<Header noMargin style="width: min(100%, 46rem); margin: 0 auto">
			{data.lecture.name}
		</Header>
		<p class="description" >
			{data.lecture.description}
		</p>
	</Card>
	<MarkdownRenderer
		style="font-size: 1.1rem;"
		source={data.content}
		spacing="1.2rem"
	/>

	<Row justify="between" wrap gap="1rem" style="margin-top: 3rem">
		{#if previousLecture}
			<ButtonLink
				style="gap: 1rem"
				cssVar="secondary"
				onClick={() => {
        	document.body.scrollTo({top: 0, behavior: 'smooth'})
				}}
				href={`/learn/courses/${data.course.slug}/${previousLecture?.module.slug}/${previousLecture?.slug}`}
			>
				<Icon>
					<FaChevronLeft />
				</Icon>
				Previous Lecture
			</ButtonLink>
		{:else}
			<div></div>
		{/if}

		{#if nextLecture}
			<ButtonLink
				style="gap: 1rem"
				disabled={!nextLecture}
				onClick={() => {
        	document.body.scrollTo({top: 0, behavior: 'smooth'})
				}}
				href={`/learn/courses/${data.course.slug}/${nextLecture?.module.slug}/${nextLecture?.slug}`}
			>
				Next Lecture
				<Icon>
					<FaChevronRight />
				</Icon>
			</ButtonLink>
		{:else}
			<div></div>
		{/if}
	</Row>
</Page>


<style>
    .description {
        white-space: pre-line;
        line-height: 1.5;
        font-family: 'Noto Serif', Rubik, sans-serif;
        font-weight: 500;
        width: min(100%, 70ch);
				font-size: 1.1rem;
				margin: 0 auto;

    }
</style>
