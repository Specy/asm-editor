<script lang="ts">
	export let id: string
	export let style: string = ''
	export let imageUrl: string = ''
	export let reverse: boolean = false
</script>

<div class="section" {id} {style} class:reverse>
	<div class="section-content">
		<div class="section-image" style={`background-image: url('${imageUrl}');`}>
			<div class="section-image-overlay" />
		</div>
		<div class="column section-right">
			<div class="title">
				<slot name="title" />
			</div>
			<div class="section-text">
				<slot />
			</div>
		</div>
	</div>
</div>

<style lang="scss">
	.section {
		display: flex;
		padding: 3rem 0.8rem;
		flex-direction: column;
		align-items: center;
	}
	.reverse {
		background-color: var(--secondary);
		.section-content {
			flex-direction: row-reverse;
		}
	}
	.section-image {
		background-repeat: no-repeat;
		position: relative;
		background-position: center;
		background-size: cover;
		border-radius: 0.6rem;
		overflow: hidden;
		width: 25vw;
		min-width: 25vw;
		height: 20vw;
		@supports (aspect-ratio: 3/2) {
			aspect-ratio: 3/2;
			height: unset;
		}
	}
	.section-text {
		font-size: 1.1rem;
		line-height: 1.6rem;
		padding: 2rem;
	}
	.section-image-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: var(--secondary);
		opacity: 0.6;
	}
	.section-content {
		display: flex;
		gap: 1rem;
		max-width: 80vw;
		width: 100%;
	}
	.title {
		font-size: 2.2rem;
		padding: 1rem;
		font-weight: bold;
	}
	@media screen and (max-width: 400px) {
		.reverse{
			background-color: unset;
		}
		.section-content{
			max-width: unset;
		}
		.section{
			position: relative;
			padding: 0;
			border-radius: 0.5rem;
			overflow: hidden;
			margin: 0.5rem 1rem;
		}
		.section-text{
			padding: 1.4rem;
		}
		.section-right{
			z-index: 2;
		}
		.title{
			padding: 1.2rem;
			font-size: 1.8rem;
			background-color: rgba(var(--RGB-tertiary), 0.5);
		}
		.section-image{
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			position: absolute;
		}
		.section-image-overlay{
			opacity: 0.92;
			border-radius: 0.5rem;
		}
	}
</style>
