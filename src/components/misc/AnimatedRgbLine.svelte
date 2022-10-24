<script lang="ts">
    export let height: string = "0.3rem"
    export let style = ""
</script>

<div class="line" style={`height:${height}; ${style}`}/>

<style lang="scss">
	.line {
		width: 100%;
		height: 0.3rem;
		border-radius: 1rem;
		background: linear-gradient(
			60deg,
			hsl(224, 85%, 66%),
			hsl(269, 85%, 66%),
			hsl(314, 85%, 66%),
			hsl(359, 85%, 66%),
			hsl(44, 85%, 66%),
			hsl(89, 85%, 66%),
			hsl(134, 85%, 66%),
			hsl(179, 85%, 66%)
		);
		background-size: 300% 300%;
		background-position: 0 50%;
		animation: moveLine 10s ease-in-out alternate infinite;
	}
	@keyframes moveLine {
		0% {
			background-position: 0% 50%;
		}
		100% {
			background-position: 100% 50%;
		}
	}
</style>
