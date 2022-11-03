<script lang="ts">
	export let value = ''
	export let style = ''
	export let placeholder = ''
    export let label = ''
</script>

<div class="input-row" {style}>
    {#if label}
        <div class="label">
            {label}
        </div>
    {/if}
	<input bind:value class="form-input" {placeholder} />
</div>

<style lang="scss">
	.input-row {
		display: flex;
		align-items: center;
		border-radius: 0.4rem;
		padding: 0.4rem 0.8rem;
        font-size: 0.9rem;
		background-color: var(--secondary);
		> input {
			width: 100%;
			color: #bfbfbf;
		}
	}
    .label{
       margin-right: 0.4rem; 
       padding: 0.3rem 0.4rem 0.3rem 0; 
       border-right: solid 1px gray;
    }
	.form-input {
		display: flex;
		flex: 1;
		border: none;
		background-color: transparent;
	}
	input::placeholder {
		color: rgb(116, 116, 116);
		font-size: 0.8rem;
	}
</style>
