<script lang="ts">
    export let href:string
    export let title:string
</script>


<a class="link-element" {href} {title}>
    <div class="link-icon">
        <slot name="icon" />
    </div>
    <div class="link-description">
        <slot name="description"/>
    </div>
</a>



<style lang="scss">
    .link-element{
        display: flex;
        flex-direction: column;
        gap: 1rem;
		flex: 1;
        min-width: 10rem;
        padding: 1.4rem;
        align-items: center;
        justify-content: space-between;
        background-color: inherit;
        transition: all 0.3s;
        &:hover{
            background-color: var(--tertiary);
            color: var(--tertiary-text);
        }
    }
    .link-icon{
        width: 1.8rem;
        height: 1.8rem;
    }
    .link-description{
        font-size: 1.2rem;
        text-align: center;
    }
</style>