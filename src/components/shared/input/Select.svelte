<script lang="ts">
	export let options = []
	export let value = ''
	export let style = ''
    export let title = ''
    export let disabled = []
</script>

<div class="wrapper">
    <div>{title}</div>
    <select 
        bind:value
        style={`background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24' fill='#FFFFFF'><path d='M0 0h24v24H0z' fill='none'/><path d='M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'/></svg>"); ${style}`}
    >
        {#each options as option,i}
            <option value={option} disabled={disabled[i] !== undefined}>
                {option}
            </option>
        {/each}
    </select>
</div>


<style lang="scss">
	select {
		display: flex;
		align-items: center;
		border-radius: 0.4rem;
		padding: 0.2rem;
		background-color: var(--secondary);
		color: var(--secondary-text);
		padding: 0.6rem 1rem;
        margin-top: 0.3rem;
        -webkit-appearance:none;
	}
    .wrapper{
        display: flex;
        flex-direction: column;
        flex:1;
    }
</style>
