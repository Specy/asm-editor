<script lang="ts">
    import Row from '$cmp/shared/layout/Row.svelte'

    interface Props {
        children?: import('svelte').Snippet
				content?: import('svelte').Snippet
				menuOpen?: boolean
    }

    let {
        children,
				content,
				menuOpen = $bindable(false)
    }: Props = $props()
</script>


<Row flex1>
	<button
		class="side-menu-underlay"
		aria-label="close menu"
		class:side-menu-underlay-open={menuOpen}
		onclick={() => (menuOpen = false)}
	>
	</button>
	<aside class="side-menu column" class:menu-open={menuOpen}>
		{@render children?.()}
	</aside>
	<div class="content">
		{@render content?.()}

	</div>
</Row>

<style lang="scss">
  .side-menu {
    background-color: var(--secondary);
    color: var(--secondary-text);
    width: 16rem;
		min-width: 16rem;
    gap: 1rem;
    top: 3.2rem;
    padding-top: 1rem;
    height: calc(100vh - 3.2rem);
    overflow-y: auto;
    position: sticky;
  }

  .mobile-only {
    display: none;
  }

	.content {
		width: 100%;
		max-width: calc(100vw - 16rem);
	}

  @media (max-width: 600px) {
		.content{
			max-width: unset;
		}
    .side-menu {
      position: fixed;
      width: calc(100vw - 4rem);
      left: 0;
      z-index: 5;
      transition: transform 0.3s;
      background-color: rgba(var(--RGB-secondary), 0.9);
      transform: translateX(calc((100vw - 4rem) * -1));
    }
    .mobile-only {
      display: flex;
    }
    .menu-open {
      transform: translateX(0);
    }
  }

  .instruction-search {
    background-color: var(--tertiary);
    color: var(--tertiary-text);
    padding: 0.6rem;
    border-radius: 0.4rem;
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

  .side-menu-underlay {
    position: fixed;
    top: 3.2rem;
    left: 0;
    width: 100vw;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    opacity: 0;
    pointer-events: none;
    cursor: pointer;
    z-index: 3;
    transition: opacity 0.3s;
    backdrop-filter: blur(0.2rem);
  }

  .side-menu-underlay-open {
    opacity: 1;
    pointer-events: all;
  }
</style>
