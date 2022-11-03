<script>
	import ButtonLink from '$cmp/buttons/ButtonLink.svelte'
</script>

<div class="page">
	<div class="center-wrapper">
		<div class="floating-middle">
			<a href="/">
				<div class="go-back">
					<div class="go-back-404">404</div>
					<ButtonLink href="/" cssVar="accent2">Click to go back</ButtonLink>
				</div>
			</a>
		</div>
	</div>
</div>

<style lang="scss">
	.floating-middle {
		width: 20rem;
		height: 20rem;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 1rem;
		border-radius: 0.5rem;
	}
	.go-back {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.go-back-404 {
		color: var(--accent);
		font-size: 10rem;
		animation: infinite bounce 1.5s;
		transform-origin: bottom;
	}
	.center-wrapper {
		display: flex;
		justify-content: center;
		align-items: center;
		flex: 1;
	}
	@keyframes bounce {
		0% {
			transform: scale(1, 1) translateY(0);
		}
		10% {
			transform: scale(1.1, 0.9) translateY(0);
		}
		30% {
			transform: scale(0.9, 1.1) translateY(-2rem);
		}
		50% {
			transform: scale(1.05, 0.95) translateY(0);
		}
	}
</style>
