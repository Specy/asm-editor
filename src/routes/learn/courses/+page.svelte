<script lang="ts">
    import type { PageData } from './$types'
    import Card from '$cmp/shared/layout/Card.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import { resolve } from '$app/paths'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()
</script>

<DefaultNavbar />

<svelte:head>
    <title>Courses</title>
    <meta
        name="description"
        content="Explore our courses to learn assembly programming from scratch."
    />
    <meta property="og:title" content="Courses" />
    <meta
        property="og:description"
        content="Explore our courses to learn assembly programming from scratch."
    />
</svelte:head>

<Page hasNavbar cropped contentStyle="padding: 1rem;">
    <Header>Courses</Header>
    <p></p>
    <div class="courses">
        {#each data.courses as course (course.slug)}
            <a href={resolve('/learn/courses/[courseId]', { courseId: course.slug })}>
                <Card
                    background="secondary"
                    gap="1rem"
                    padding="1rem"
                    style="width: 100%; height: 100%"
                >
                    <Header type="h2" noMargin>
                        {course.name}
                    </Header>
                    <p class="text-muted">
                        {course.description}
                    </p>
                </Card>
            </a>
        {/each}
    </div>
</Page>

<style>
    .courses {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
        gap: 1rem;
        width: 100%;
    }
    .courses a {
        display: flex;
    }
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
