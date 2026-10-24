<script lang="ts">
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import { createEmulator, type Emulator } from '#lib/languages/Emulator.ts'
    import { onDestroy, untrack, type Snippet } from 'svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import type { EmulatorSettings } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import { createInjectedPeripherals } from '#lib/languages/peripherals/peripheralSet.ts'
    import Column from '#cmp/shared/layout/Column.svelte'
    import type { BuildInput } from '#lib/projectFiles.ts'
    import { createBrowserAudioOutput } from '#lib/languages/peripherals/audio/browserAudioOutput.ts'
    import { setAudioPreferences } from '#lib/languages/peripherals/audio/audioContext.ts'
    import { preferencesStore } from '#stores/preferencesStore.svelte.ts'

    // Define the props the component expects
    interface Props {
        language: AvailableLanguages
        code: string
        source?: BuildInput
        children: Snippet<[Emulator]>
        loading?: Snippet
        settings?: Omit<EmulatorSettings, 'language'>
        emulator?: Emulator | null
    }

    let {
        language,
        code = $bindable(),
        source,
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
    //the page's sound, which an Audio made outside a page never gets; x86 plays nothing
    if (untrack(() => language) !== 'X86') {
        injectedPeripherals.audio.setOutput(createBrowserAudioOutput())
    }
    //mute and volume are Preferences, which every Emulator on the page shares
    $effect(() => {
        setAudioPreferences({
            enabled: preferencesStore.values.sound.value,
            volume: preferencesStore.values.soundVolume.value
        })
    })

    const emulatorPromise = untrack(() =>
        createEmulator(language, source ?? code, {
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
