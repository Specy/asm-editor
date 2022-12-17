<script lang="ts">
	import { Size } from "s68k"
    export let selected:Size = Size.Word
</script>

<div class="row">
    <div class="column">
        <div>
            L
        </div>
        <input type="radio" name="size" value={Size.Long} bind:group={selected} />
    </div>
    <div class="column">
        <div>
            W
        </div>
        <input type="radio" name="size" value={Size.Word} bind:group={selected} />
    </div>
    <div class="column">
        <div>
            B
        </div>
        <input type="radio" name="size" value={Size.Byte} bind:group={selected} />
    </div>
</div>



<style>
    .row {
        display: flex;
        flex-direction: row;
        justify-content: space-around;
        background-color: var(--secondary);
        border-radius: 0.4rem;
        min-width: 6rem;
        margin-right: 0.5rem;
        padding: 0.3rem;
    }

    .column{
        display: flex;
        align-items: center;
        flex-direction: column;
    }
</style>