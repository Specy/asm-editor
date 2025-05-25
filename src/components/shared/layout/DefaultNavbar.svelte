<script>
	import Navbar from '$cmp/shared/layout/Navbar.svelte'
	import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
	import FaStar from 'svelte-icons/fa/FaStar.svelte'
	import Icon from '$cmp/shared/layout/Icon.svelte'
</script>

<Navbar>
	<div class="row" style="gap: 1rem; align-items:center; flex: 1">
		<a class="icon" href="/" title="Go to the home">
			<img src="/favicon.png" alt="logo" />
		</a>
		<a class="icon" href="/projects" title="Go to your projects"> Projects </a>
		<a class="icon" href="/documentation/" title="Go to the docs"> Docs </a>
		<a class="icon" href="/learn/courses" title="Learn assembly"> Learn </a>
		<a class="icon" href="/embed" title="Embed the website"> Embed </a>
	</div>
	<div class="star-on-github">
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

  @media (max-width: 600px) {
    .star-on-github {
      display: none;
    }
  }
</style>
