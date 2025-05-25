<script lang="ts">
    import type { PageData } from './$types'
    import Card from '$cmp/shared/layout/Card.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import Navbar from '$cmp/shared/layout/Navbar.svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import Footer from '$cmp/shared/layout/Footer.svelte'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()
</script>

<DefaultNavbar />

<svelte:head>
    <title>Courses</title>
    <meta name="description" content="Explore our courses to learn assembly programming from scratch." />
    <meta property="og:title" content="Courses" />
    <meta property="og:description" content="Explore our courses to learn assembly programming from scratch." />
</svelte:head>


<Page hasNavbar cropped contentStyle="padding: 1rem;">
    <Header>Courses</Header>
    <p></p>
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
