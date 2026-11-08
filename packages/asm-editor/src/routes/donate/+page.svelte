<script lang="ts">
    import '#cmp/content/contentPages.css'
    import type { Component } from 'svelte'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import Kofi from '#cmp/shared/misc/KoFi.svelte'
    import FaGithub from '~icons/fa-brands/github'
    import FaPaypal from '~icons/fa-brands/paypal'

    const platforms = [
        {
            id: 'github-sponsors',
            name: 'GitHub Sponsors',
            about: 'Sponsor the project every month, or once, from your GitHub account.',
            action: 'Sponsor on GitHub',
            href: 'https://github.com/sponsors/Specy',
            icon: FaGithub
        },
        {
            id: 'ko-fi',
            name: 'Ko-fi',
            about: 'Buy me a coffee with a one-time donation, by card or PayPal. No account needed.',
            action: 'Donate on Ko-fi',
            href: 'https://ko-fi.com/specy',
            icon: Kofi
        },
        {
            id: 'paypal',
            name: 'PayPal',
            about: 'Send a donation of any amount straight from your PayPal account.',
            action: 'Donate with PayPal',
            href: 'https://www.paypal.com/paypalme/specydev',
            icon: FaPaypal
        }
    ] satisfies {
        id: string
        name: string
        about: string
        action: string
        href: string
        icon: Component
    }[]
</script>

<DefaultNavbar />
<PageMeta
    title="Donate - ASM Editor"
    description="Support the development of ASM Editor, the free web IDE for assembly, with GitHub Sponsors, Ko-fi or PayPal."
/>

<div class="content-pages">
    <Page cropped="70rem" hasNavbar contentStyle="padding: 1rem">
        <Header>Support ASM Editor</Header>
        <div class="intro">
            <p>
                Thanks for using ASM Editor! It is free and open source. If it helped you, you can
                support the development of new features and ISAs with a monthly sponsorship or a
                one-time donation.
            </p>
            <p>
                You can also find my other apps on <a href="https://specy.app">specy.app</a>.
            </p>
        </div>
        <div class="platforms">
            {#each platforms as platform (platform.id)}
                <Card element="section" aria-labelledby={`donate-${platform.id}`}>
                    <div class="platform-name">
                        <h2 id={`donate-${platform.id}`}>{platform.name}</h2>
                        <Icon size="h2">
                            <platform.icon />
                        </Icon>
                    </div>
                    <p class="about">{platform.about}</p>
                    <div class="platform-footer">
                        <ButtonLink
                            href={platform.href}
                            class="card-cover"
                            target="_blank"
                            style="position: static; width: 100%"
                        >
                            {platform.action}
                        </ButtonLink>
                    </div>
                </Card>
            {/each}
        </div>
    </Page>
</div>

<style>
    .intro {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    }
    .intro p {
        margin: 0;
    }
    .intro a {
        color: var(--accent);
        text-decoration: underline;
    }
    .platforms {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
        gap: 1rem;
    }

    /* A Card as the documentation and course lists have, with the platform's logo across from its
       name; its button's link covers the whole card. */
    .platforms > :global(.card) {
        gap: 1rem;
        padding: 1.2rem;
    }
    .platform-name {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8rem;
    }
    h2 {
        margin: 0;
        font-size: var(--fs-h3);
        font-weight: 600;
        line-height: 1.3;
        letter-spacing: -0.015em;
    }
    .about {
        margin: 0;
        font-size: var(--fs-body);
        line-height: 1.6;
        color: var(--background-text-prose);
    }
    /* a rule inside the card, its edge's hairline */
    .platform-footer {
        display: flex;
        margin-top: auto;
        padding-top: 1rem;
        border-top: 1px solid var(--line);
    }

    @media (max-width: 600px) {
        .platforms > :global(.card) {
            padding: 0.9rem;
        }
    }
</style>
