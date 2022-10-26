<script lang="ts">
	import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte'
	import Button from './buttons/Button.svelte'
	import Icon from './layout/Icon.svelte'

	export let name: string
	export let open = true
</script>

<div class="section" class:open>
	<div class="section-title">
		<div>
			{name}
		</div>
		<Button on:click={() => (open = !open)} hasIcon cssVar="tertiary" style="padding: 0.2rem">
			<Icon style={`transform: rotate(${open ? 90 : 0}deg); transition: all 0.2s;`} size={1.6}>
				<FaAngleRight />
			</Icon>
		</Button>
	</div>
	<div class="column sub-section-content" class:open>
		<slot />
	</div>
</div>

<style lang="scss">
	.section-title {
		font-size: 1.5rem;
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.sub-section-content {
        display: none;
        padding-left: 0.8rem;
		gap: 0.8rem;
		border-left: 0.2rem solid var(--secondary);
        &.open {
			display: flex;
		}
	}
</style>
