<script lang="ts">
	import Input from "$cmp/inputs/Input.svelte"
	import M68KDocumentation from "$cmp/M68KDocumentation.svelte"
    let searchValue = ''

</script>

<title>
    M68K Documentation
</title>

<div class="page">

    <div class="search-bar">
        <a class="icon" href="/">
            <img src="/favicon.png" alt="logo"/>
            Home
        </a>
        <Input
            bind:value={searchValue}
            placeholder="Search"
            style="padding: 0rem; background-color: var(--tertiary); color: var(--tertiary-text); max-width: 15rem;"
        />
    </div>
    <div class="content">

        <M68KDocumentation 
            bind:searchValue
            visible={true}
            defaultOpen={true}
        />
    </div>
</div>


<style lang="scss">
 	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.content {
		display: flex;
		flex-direction: column;
		padding: 0.8rem;
		max-width: 60rem;
		width: 100%;
	}
    .icon{
        height: 2.2rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        img {
            height: 100%;
        }
        &:hover{
            color: var(--accent);
        }
    }
    .search-bar{
        position: sticky;
        top: 0rem;
        padding: 0.8rem;
        width: 100%;
        gap: 0.8rem;
        border-radius: 0.6rem;
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        display: flex;
        justify-content: space-between;
        background-color: rgba(var(--RGB-secondary), 0.5);
        backdrop-filter: blur(0.4rem);
        z-index: 1;
    }
</style>    