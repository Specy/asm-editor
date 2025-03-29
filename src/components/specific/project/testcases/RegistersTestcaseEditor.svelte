<script lang="ts">
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import RegisterTestcaseValue from '$cmp/specific/project/testcases/RegisterTestcaseValue.svelte'
    import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
    import RegistersRenderer from '$cmp/specific/project/cpu/RegistersRenderer.svelte'
    import { makeRegister } from '$lib/languages/commonLanguageFeatures.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'

    interface Props {
        registers: Record<string, number>
        editable: boolean
        registerNames: string[]
        hiddenRegistersNames?: string[]
    }

    let { registers = $bindable(), editable, registerNames, hiddenRegistersNames }: Props = $props()

    function makeNewRegister(defaultName?: string) {
        return {
            name: defaultName ?? registerNames[0],
            value: 0
        }
    }

    function sortRegisters(registers: Record<string, number>) {
        return Object.entries(registers).sort((a, b) => a[0].localeCompare(b[0]))
    }

    function getAvailableRegisterName(usedNames: Record<string, any>) {
        return registerNames.filter((name) => usedNames[name] === undefined)
    }

    let newRegister = $state(makeNewRegister())
    let startingRegisters = $derived(sortRegisters(registers))
    let freeStartingRegisters = $derived(getAvailableRegisterName(registers))
</script>

<Column gap="0.3rem" style="max-width: 12rem">
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
                registersNames={registerNames}
            />
        {/each}
        <div class="add-input" style={freeStartingRegisters.length === 0 ? 'display:none' : ''}>
            <RegisterTestcaseValue
                bind:value={newRegister.value}
                on:change-key={(e) => (newRegister.name = e.detail.new)}
                canDelete={false}
                name={newRegister.name}
                registersNames={freeStartingRegisters}
            />
            <button
                onclick={() => {
                    registers[newRegister.name] = newRegister.value
                    const availableNames = getAvailableRegisterName(registers)
                    if (!availableNames.length) return
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
          hiddenRegistersNames={hiddenRegistersName}
            registers={Object.entries(registers).map(([name, value]) => makeRegister(name, value))}
        />
    {/if}
</Column>

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
