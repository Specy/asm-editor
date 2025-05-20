<script>
    import Navbar from '$cmp/shared/layout/Navbar.svelte'
</script>

<Navbar>
    <div class="row" style="gap: 1rem; align-items:center; flex: 1">
        <a class="icon" href="/" title="Go to the home">
            <img src="/favicon.png" alt="logo" />
            Home
        </a>
        <a class="icon" href="/projects" title="Go to your projects"> Projects </a>
        <a class="icon" href="/documentation/" title="Go to the docs"> Docs </a>
        <a href="/learn/courses" title="Learn assembly"> Learn </a>
        <a class="icon" href="/embed" title="Embed the website"> Embed </a>
    </div>
</Navbar>

<style lang="scss">
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
