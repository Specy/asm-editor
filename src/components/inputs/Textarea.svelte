<script lang="ts">

    export let value = ''
    export let title = ''
</script>

<div class="wrapper">
    <div>{title}</div>
    <textarea 
        placeholder={title}
        bind:value 
    />
</div>


<style lang="scss">
    textarea{
        display: flex;
		align-items: center;
		border-radius: 0.4rem;
		padding: 0.2rem;
		background-color: var(--secondary);
		color: white;
		padding: 0.6rem 1rem;
        margin-top: 0.3rem;
        min-height: 4rem;
        max-height: 20rem;
        resize: vertical;
    }
    .wrapper{
        display: flex;
        flex-direction: column;
        flex:1;
    }
</style>