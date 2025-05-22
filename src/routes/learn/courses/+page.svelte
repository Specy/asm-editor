<script lang="ts">
    import type { PageData } from './$types'
    import Card from '$cmp/shared/layout/Card.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import Navbar from '$cmp/shared/layout/Navbar.svelte'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()

</script>

<Navbar style="border-bottom-left-radius: 0;">
	<Row gap="1rem" align="center" flex1>
		<a class="icon" href="/" title="Go to the home">
			<img src="/favicon.png" alt="logo" />
			Home
		</a>
		<a class="icon" href="/projects" title="Go to your projects"> Projects </a>
		<a class="icon" href="/documentation/" title="Go to the docs"> Docs </a>
		<a href="/learn/courses" title="Learn assembly"> Learn </a>
	</Row>
</Navbar>

<Page cropped style="padding: 1rem; padding-top: 4rem;">
	<Header>
		Courses
	</Header>
	<p>

	</p>
	<Row gap="1rem" wrap>
		{#each data.courses as course}
			<a href="/learn/courses/{course.slug}">
				<Card
					background="secondary"
					gap="1rem"
					padding="1rem"
					style="width: min(100vw - 2rem,25rem)"
				>
					<Header type="h2" noMargin>
						{course.name}
					</Header>
					<p>
						{course.description}
					</p>
				</Card>
			</a>
		{/each}
	</Row>

</Page>

<style>
    .icon {
        height: 2.2rem;
        display: flex;
        align-items: center;
        gap: 1rem;

        img {
            height: 100%;
        }

        &:hover {
            color: var(--accent);
        }
    }
</style>