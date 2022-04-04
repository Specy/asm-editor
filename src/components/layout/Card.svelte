<script>
    import { theme } from "$stores/theme";
	export let morePadding = false
    export let style = ''
</script>

<div 
	class="card" 
	class:cardDark={$theme === 'dark'} 
	style={`padding: ${morePadding ? '1.2rem' : '0.6rem'}; ${style}`}
>
    <slot />
</div>

<style lang="scss">
	@import '../../variables.scss';
	.card {
		position: relative;
		border-radius: 0.6rem;
		transition: all 0.2s;
        background-color: $cardColor;
        box-shadow: 1px 1px 5px #45455940;
	}
	.cardDark {
		background-color: $dark;
        box-shadow: unset;
        color: #f6f6f6;
	}
</style>
