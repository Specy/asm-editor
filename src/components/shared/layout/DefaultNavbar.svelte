<script>
    import Navbar from '$cmp/shared/layout/Navbar.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import FaStar from 'svelte-icons/fa/FaStar.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Row from './Row.svelte'
</script>

<Navbar>
    <Row style="gap: 1rem; align-items:center; flex: 1">
        <a class="icon" href="/" title="Go to the home">
            <img src="/favicon.png" alt="logo" />
        </a>
        <a class="icon" href="/projects" title="Go to your projects"> Projects </a>
        <a class="icon" href="/documentation/" title="Go to the docs"> Docs </a>
        <a class="icon" href="/learn/courses" title="Learn assembly"> Learn </a>
        <a class="icon hidden-on-mobile" href="/embed" title="Embed the website"> Embed </a>
    </Row>
    <Row gap='0.5rem' align='center'>
        <a class="icon ai" href="/chat" title="AI Chat"> 
			AI Chat 
		</a>
        <div class="hidden-on-mobile">
            <ButtonLink
                style="gap: 0.5rem; padding: 0.5rem 1rem"
                cssVar="secondary"
                href="https://github.com/Specy/asm-editor"
                target="_blank"
                title="Star the project on github"
            >
                <Icon>
                    <FaStar />
                </Icon>
                Star on github
            </ButtonLink>
        </div>
    </Row>
</Navbar>

<style lang="scss">
    .icon {
        height: 2.2rem;
        display: flex;
        align-items: center;
        gap: 1rem;

        &.ai {
            color: var(--accent);
            padding: 0.3rem 0.8rem;
            border-radius: 0.4rem;
            background-color: color-mix(in srgb, var(--accent) 10%, transparent);
        }

        img {
            height: 100%;
        }

        &:hover {
            color: var(--accent);
        }
    }

    @media (max-width: 600px) {
        .hidden-on-mobile {
            display: none;
        }
    }
</style>
