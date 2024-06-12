<script lang="ts">
    import { Register, registerName } from '$lib/languages/M68KEmulator.js'
    import Row from '$cmp/shared/layout/Row.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import RegisterTestcaseValue from '$cmp/specific/project/testcases/RegisterTestcaseValue.svelte'
    import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
    import RegistersRenderer from '$cmp/specific/project/cpu/RegistersRenderer.svelte'

    export let registers: Record<string, number>
    export let editable: boolean

    function makeNewRegister(defaultName = 'D0') {
        return {
            name: defaultName,
            value: 0
        }
    }

    function sortRegisters(registers: Record<string, number>) {
        return Object.entries(registers).sort((a, b) => a[0].localeCompare(b[0]))
    }

    function getAvailableRegisterName(usedNames: Record<string, any>) {
        return registerName.filter(name => usedNames[name] === undefined)
    }

    let newRegister = makeNewRegister()
    $: startingRegisters = sortRegisters(registers)
    $: freeStartingRegisters = getAvailableRegisterName(registers)

</script>


<Row gap="0.3rem" style="flex-wrap: wrap">
	{#if editable}

		{#each startingRegisters as [key, value] (key)}

			<RegisterTestcaseValue
				style={key[0] === 'A' ? 'filter: brightness(1.3)' : ''}
				on:change-key={(e) => {
					delete registers[e.detail.old]
					registers[e.detail.new] = value
				}}
				canDelete={true}
				on:delete={() => {
				delete registers[key]
				registers = registers
			}}
				bind:value={registers[key]}
				name={key}
				registersNames={registerName}
			/>
		{/each}
		<div
			class="add-input"
			style="{freeStartingRegisters.length === 0 ? 'display:none' : ''}"
		>
			<RegisterTestcaseValue
				bind:value={newRegister.value}
				on:change-key={(e) => newRegister.name = e.detail.new}
				canDelete={false}
				name={newRegister.name}
				registersNames={freeStartingRegisters}
			/>
			<button
				on:click={() => {
						registers[newRegister.name] = newRegister.value
						const availableNames = getAvailableRegisterName(registers)
						if(!availableNames.length) return
						newRegister = makeNewRegister(availableNames[0])
				}}
				class="add-input-btn"
			>
				<Icon>
					<FaPlus />
				</Icon>
			</button>
		</div>
	{:else}
		<RegistersRenderer
			registers={Object.entries(registers).map(([name, value]) => new Register(name, value))}
		/>
	{/if}

</Row>


<style>
    .add-input {
        display: flex;
        border-radius: 0.4rem;
        border: solid 0.1rem var(--accent2);
        overflow: hidden;
    }

    .add-input-btn {
        background-color: var(--accent2);
        color: var(--accent2-text);
        padding: 0.2rem 0.5rem;
    }
</style>