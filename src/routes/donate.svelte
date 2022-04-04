<script lang="ts">
	import Title from '$cmp/layout/Title.svelte'
</script>

<div class="page">
	<Title>Donate</Title>
		<div style="margin-top: 1rem;">
			<div class="text">
				Each App I develop takes months of learning and development. Added to that are also the
				costs of hosting. With a higher budget I can afford to not worry so much about how much I
				spend on the server, giving you the best possible experience.<br />I care about giving users
				all features without having to pay for it, neither having intrusive ads which can be
				annoying. For this same reason, there is no source of income except donations.
				<br /><br />
				I would be really thankful if you could consider donating in order to fund development and costs
			</div>
			<div class="donation-wrapper">
				<a href="https://www.buymeacoffee.com/specy" target="_blank">
					<img src="/images/buymeacoffee.svg" alt="buymeacoffee" style="height: 4rem;"/>
				</a>
				<a href="https://ko-fi.com/specy" target="_blank" class="kofi" rel="noreferrer">
					<img src='/images/kofi.png' alt="kofi" style="height: 3rem;" />
				</a>
				<a href="https://paypal.me/specyDev" target="_blank" class="paypal">
					<img src="/images/paypalme.png" alt="paypal" style="height: 4rem;"/>
				</a>
			</div>
		</div>
</div>

<style lang="scss">
	.donation-wrapper {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		width: 100%;
		justify-content: space-around;
		margin-top: 2rem;
	}
	.donation-wrapper a {
		margin-top: 0.5rem;
	}
	.paypal,
	.kofi {
		background-color: #efefef;
		padding-left: 1rem;
		height: 4rem;
		border-radius: 0.8rem;
	}
	.kofi {
		background-color: white;
		padding: 0.5rem 1rem;
	}

	.paypal {
		background-color: #efefef;
		width: fit-content;
		padding-left: 1rem;
		height: 4rem;
		border-radius: 0.8rem;
	}
</style>
