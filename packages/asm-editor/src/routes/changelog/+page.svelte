<script lang="ts">
    import Page from '#cmp/shared/layout/Page.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import { versions } from './versions'
    import FaCircle from '~icons/fa-solid/circle'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Column from '#cmp/shared/layout/Column.svelte'
    import Row from '#cmp/shared/layout/Row.svelte'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaBookOpen from '~icons/fa-solid/book-open'
    import { resolve } from '$app/paths'
</script>

<svelte:head>
    <title>Changelog - ASM Editor</title>
    <meta
        name="description"
        content="Write, learn and run M68K, MIPS, RISC-V, x86-64 and Z80 assembly code in your browser. View registers and memory, step and undo the execution."
    />
    <meta
        property="og:description"
        content="Write, learn and run M68K, MIPS, RISC-V, x86-64 and Z80 assembly code in your browser. View registers and memory, step and undo the execution."
    />
    <meta property="og:title" content="Changelog - ASM Editor" />
</svelte:head>

<DefaultNavbar />

<Page hasNavbar cropped="70rem" contentStyle="padding: 1rem">
    <div class="title-room">
        <Header>Changelog</Header>
    </div>
    <Column gap="0.6rem">
        {#each versions as version (version.version)}
            <Column gap="0.6rem">
                <Row gap="1rem" align="center">
                    <h2 class="version-title">
                        {version.version}
                    </h2>
                    <p class="date">
                        {version.date.toISOString().split('T')[0].replace(/-/g, '/')}
                    </p>
                    {#if version.blogPost}
                        <ButtonLink
                            kind="secondary"
                            style="gap: 0.5rem; margin-left: auto; white-space: nowrap"
                            href={resolve('/blog/posts/[slug]', { slug: version.blogPost })}
                        >
                            <Icon><FaBookOpen /></Icon>
                            Blog post
                        </ButtonLink>
                    {/if}
                </Row>

                <div class="version-content">
                    {#if version.title}
                        <h2 class="title">
                            {version.title}
                        </h2>
                    {/if}
                    <ul>
                        {#each version.changes as change (change)}
                            <li>
                                {change}
                            </li>
                        {/each}
                    </ul>
                </div>
            </Column>
        {/each}
    </Column>

    <div class="fading">
        <FaCircle />
    </div>
</Page>

<style lang="scss">
    /* the title starts where the other index pages' titles do (contentPages.css' room above it) */
    .title-room {
        padding-top: 1.5rem;
    }
    @media (max-width: 600px) {
        .title-room {
            padding-top: 0.75rem;
        }
    }
    .fading {
        width: var(--fs-body);
        height: var(--fs-body);
        margin-left: 2.1rem;
        margin-top: -0.1rem;
        color: var(--accent);
    }
    .version-title {
        font-weight: 400;
        width: 5rem;
        text-align: center;
        padding: 0.3rem;
        border-radius: var(--r-control);
        background-color: var(--accent);
        color: var(--accent-text);
        font-size: var(--fs-lead);
    }
    .title {
        font-size: var(--fs-h3);
        color: var(--accent);
        margin-bottom: 0.4rem;
    }
    .version-content {
        border-left: 3px solid var(--accent);
        margin-left: 2.5rem;
        font-size: var(--fs-prose);
        padding: 0 0 1rem 2rem;
    }
    @media (max-width: 600px) {
        .version-content {
            padding-left: 1rem;
        }
    }
    ul {
        display: flex;
        margin-top: 0.6rem;
        flex-direction: column;
        padding-left: 2rem;
        gap: 0.4rem;
        > li {
            line-height: 1.4em;
        }
    }
</style>
