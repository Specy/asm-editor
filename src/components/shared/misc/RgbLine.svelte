<script lang="ts">
	export let width = '100%'
	export let height = '0.2rem'
	export let style = ''
</script>

<div class="rgb-line" style={` height: ${height}; width: ${width}; ${style}`} />

<style>
	.rgb-line {
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
	}
</style>
