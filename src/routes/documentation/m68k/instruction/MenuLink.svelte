<script lang="ts">
	import Icon from "$cmp/layout/Icon.svelte"
	import FaCircle from "svelte-icons/fa/FaCircle.svelte"

	export let href: string
	export let title: string
</script>

<a {href} class="menu-link row">
    <Icon size={0.4} style="color: var(--accent)">
        <FaCircle />
    </Icon>
	<h2 class="menu-title">{title}</h2>
</a>

<style lang="scss">
	.menu-title {
		font-size: 1rem;
        font-weight: normal;
	}
    .menu-link{
        gap: 0.8rem;
        align-items: center;
        transition: color 0.2s;   
    }
    .menu-link:hover{
        color: var(--accent);
    }
</style>
