<script lang="ts">
	import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	export let open = true
	export let style = ''
	export let sectionStyle = ''
	let cantAnimate = true
</script>

<section class="section" class:open {style}>
	<button class="section-title" on:click={() => {
		open = !open
		cantAnimate = false
	}}>
		<Icon style={`transform: rotate(${open ? 90 : 0}deg); transition: all 0.2s cubic-bezier(.54,.9,0,.97); color: var(--accent); `} size={1.4}>
			<FaAngleRight />
		</Icon>
		<slot name="title" />
	</button>
	<div class="column sub-section-content" class:open class:cantAnimate style={sectionStyle}>
		<slot />
	</div>
</section>

<style lang="scss">
	.section-title {
		font-size: 1.5rem;
		display: flex;
		gap: 0.4rem;
		cursor: pointer;
		background-color: transparent;
		font-family: FiraCode;
		color: var(--secondary-text);
		font-weight: bold;
		align-items: center;
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.sub-section-content {
		display: none;
		padding-left: 0.8rem;
		margin-left: 0.6rem;
		gap: 0.8rem;
		border-left: 0.2rem solid var(--secondary);
		opacity: 0;
		&.open {
			display: flex;
			animation: fade-in 0.2s forwards;
		}
	}

	.cantAnimate {
		animation: unset !important;
		&.open {
			opacity: 1;
			translate: translateX(0);
		}
	}
	@keyframes fade-in{
		from {
			opacity: 0;
			transform: translateX(-1rem);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
</style>
