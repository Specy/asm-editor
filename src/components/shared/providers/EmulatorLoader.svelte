<script lang="ts">
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import { createEmulator, type Emulator } from '$lib/languages/Emulator'
    import { onDestroy, untrack, type Snippet } from 'svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import type { EmulatorSettings } from '$lib/languages/commonLanguageFeatures.svelte'
    import { createInjectedPeripherals } from '$lib/languages/peripherals/peripheralSet'
    import Column from '$cmp/shared/layout/Column.svelte'

    // Define the props the component expects
    interface Props {
        language: AvailableLanguages
        code: string
        children: Snippet<[Emulator]>
        loading?: Snippet
        settings?: Omit<EmulatorSettings, 'language'>
        emulator?: Emulator | null
    }

    let {
        language,
        code = $bindable(),
        children,
        loading,
        settings,
        emulator = $bindable(null)
    }: Props = $props()

    let destroyed = false

    //One set per emulator, created here rather than inside it so that the GUI owns the instances the
    //Core draws on and reads from (ADR 0004); `emulator.peripherals` hands them to the children.
    //Anything the caller already passed in `settings.peripherals` is kept.
    const injectedPeripherals = untrack(() =>
        createInjectedPeripherals(language, settings?.peripherals)
    )

    const emulatorPromise = untrack(() =>
        createEmulator(language, code, {
            ...settings,
            language,
            peripherals: injectedPeripherals
        })
    )
    emulatorPromise.then((emulatorInstance) => {
        if (destroyed) {
            emulatorInstance.dispose()
            return
        }

        emulator = emulatorInstance
    })

    onDestroy(() => {
        destroyed = true
        if (emulator) {
            emulator.dispose()
        }
    })
</script>

{#await emulatorPromise}
    <Column justify="center" align="center" flex1>
        {#if loading}
            {@render loading()}
        {:else}
            <Header>Loading...</Header>
        {/if}
    </Column>
{:then data}
    {@render children(data)}
{:catch error}
    <Header>
        <h1>Error</h1>
        <p>Failed to load the emulator.</p>
        <p>
            {#if error instanceof Error}
                {error.message}
            {:else}
                {JSON.stringify(error)}
            {/if}
        </p>
        <ButtonLink href="/projects">Go to Projects</ButtonLink>
    </Header>
{/await}
