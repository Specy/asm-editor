<script lang="ts">
	import type { Register } from '$lib/M68KEmulator'
import RegisterDiff from './RegisterDiff.svelte'
	export let registers: Register[] = []
</script>

<div class="register-grid">
    <div class='register-grid-title'>
        Name
    </div >
    <div class='register-grid-title'>
        Value
    </div>
    <div class='register-grid-title'>
        Hex
    </div>
	{#each registers as register (register.name)}
            <div class="register-name" >
                {register.name}
            </div>
            <div class="register-value" >
                <RegisterDiff 
                    value={register.value}
                    diff={register.diff.value}
                />
            </div>
            <div class="register-hex">
                {#each register.hex as hex,i}
                    <RegisterDiff 
                        value={hex}
                        diff={register.diff.hex[i]}
                        monospaced
                    />
                {/each}
            </div>
	{/each}
</div>

<style lang="scss">
    .register-grid{
        display: grid;
        grid-template-columns:1fr 3fr 3fr;
        align-items: space-between;
        justify-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
        .register-grid-title{
            margin-bottom: 0.7rem;
        }
        .register-name{
            font-weight: bold;
        }
        .register-value{
            font-weight: bold;
        }
        .register-hex{
            display: flex;
            gap: 0.3rem;

        }
    }
</style>
