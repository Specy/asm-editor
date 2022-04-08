<script lang="ts">
	export let options = []
	export let value = ''
	export let style = ''
    export let title = ''
    export let disabled = []
</script>

<div class="wrapper">
    <div>{title}</div>
    <select bind:value {style}>
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
		color: white;
		padding: 0.6rem 1rem;
        margin-top: 0.3rem;
	}
    .wrapper{
        display: flex;
        flex-direction: column;
        flex:1;
    }
</style>
