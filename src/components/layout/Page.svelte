<script lang="ts">
	export let cropped = false
</script>

<div class="content">
	<div class="column" style="max-width: {cropped ? '60rem' : 'unset'}; width:100%; gap: 1rem; height: 100%">
		<slot />
	</div>
</div>

<style lang="scss">
	.content {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.8rem;
        height: 100%;
		margin-top: 1rem;
		padding-top: 4rem;
	}

</style>
