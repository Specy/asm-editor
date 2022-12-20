<script lang="ts">
	export let value = 0
    export let placeholder = ''
    export let style = ''
</script>

<div class="input-wrapper">
    <input
    type="number"
    bind:value
    class="form-input"
    {placeholder}
    {style}
/>
</div>

<style lang="scss">
	.form-input {
		display: flex;
		align-items: center;
		padding: 0.6rem 1rem;
		border-radius: 0.4rem;
		background-color: rgb(81 85 87 / 50%);
        color: white;
	}
	input::placeholder {
		color: rgb(116, 116, 116);
		font-size: 0.8rem;
	}
</style>
