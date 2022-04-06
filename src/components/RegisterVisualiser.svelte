<script lang="ts">
	import type { Register } from '$lib/M68KEmulator'
	export let registers: Register[] = []
</script>

<div class="register-grid">
    <div>
        Name
    </div>
    <div>
        Value
    </div>
    <div>
        Hex
    </div>
	{#each registers as register (register.name)}
            <div class="register-name">
                {register.name}
            </div>
            <div class="register-value">
                {register.value}
            </div>
            <div class="register-hex">
                <code>
                    {register.hex[0]}
                </code>
                <code>
                    {register.hex[1]}
                </code>
            </div>
	{/each}
</div>

<style lang="scss">
    .register-grid{
        display: grid;
        grid-template-columns:repeat(3, auto);
        grid-gap: 1rem;
        margin-bottom: 1rem;
        
        .register-name{
            font-weight: bold;
        }
        .register-value{
            font-weight: bold;
        }
        .register-hex{
            display: flex;
            gap: 0.3rem;
            justify-content: space-between;
            code{
                font-family: "Lucida Console", "Menlo", "Monaco", "Courier", monospace;
            }
        }
    }
</style>
