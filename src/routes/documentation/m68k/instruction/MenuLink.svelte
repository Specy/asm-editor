<script lang="ts">
    import { createBubbler } from 'svelte/legacy'

    const bubble = createBubbler()
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaCircle from 'svelte-icons/fa/FaCircle.svelte'
    interface Props {
        href: string
        title: string
    }

    let { href, title }: Props = $props()
</script>

<a {href} class="menu-link row" onclick={bubble('click')}>
    <Icon size={0.4} style="color: var(--accent);">
        <FaCircle />
    </Icon>
    <h2 class="menu-title">{title}</h2>
</a>

<style lang="scss">
    .menu-title {
        font-size: 1rem;
        font-weight: normal;
    }
    .menu-link {
        gap: 0.9rem;
        align-items: center;
        transition: color 0.2s;
    }
    .menu-link:hover {
        color: var(--accent);
    }
</style>
