<script>
</script>

<div class="page">
	<div class="center-wrapper">
		<div class="floating-middle">
			<a href="/">
				<div class="go-back">
					<div>404</div>
					<div class="go-back-text">Click to go back</div>
				</div>
			</a>
		</div>
	</div>
</div>

<style lang="scss">
	@import '../variables.scss';
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
		font-size: 10rem;
		color: $accent;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.go-back-text {
		font-size: 1rem;
		margin-top: -1rem;
		color: #bd7796;
	}
	.center-wrapper {
		display: flex;
		justify-content: center;
		align-items: center;
		flex: 1;
	}
</style>
