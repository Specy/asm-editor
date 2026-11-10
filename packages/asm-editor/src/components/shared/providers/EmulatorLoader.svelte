<script lang="ts">
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import type { Emulator } from '#lib/languages/Emulator.ts'
    import { startEmulator } from '#lib/languages/startEmulator.ts'
    import { onDestroy, untrack, type Snippet } from 'svelte'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import ErrorState from '#cmp/shared/layout/ErrorState.svelte'
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import type { EmulatorSettings } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import Column from '#cmp/shared/layout/Column.svelte'
    import type { BuildInput } from '#lib/projectFiles.ts'
    import { setAudioPreferences } from '#lib/languages/peripherals/audio/audioContext.ts'
    import { preferencesStore } from '#stores/preferencesStore.svelte.ts'

    // Define the props the component expects
    interface Props {
        language: AvailableLanguages
        code: string
        source?: BuildInput
        children: Snippet<[Emulator]>
        loading?: Snippet
        /** The host's own ways out, shown beside Reload when the Core fails to load. */
        failureActions?: Snippet
        settings?: Omit<EmulatorSettings, 'language'>
        emulator?: Emulator | null
    }

    let {
        language,
        code = $bindable(),
        source,
        children,
        loading,
        failureActions,
        settings,
        emulator = $bindable(null)
    }: Props = $props()

    let destroyed = false

    //mute and volume are Preferences, which every Emulator on the page shares
    $effect(() => {
        setAudioPreferences({
            enabled: preferencesStore.values.sound.value,
            volume: preferencesStore.values.soundVolume.value
        })
    })

    //the peripherals are the page's own, made at once, and `emulator.peripherals` hands them to
    //the children (ADR 0004)
    const emulatorPromise = untrack(() => startEmulator(language, source ?? code, settings))
    emulatorPromise.then(
        (emulatorInstance) => {
            if (destroyed) {
                emulatorInstance.dispose()
                return
            }

            emulator = emulatorInstance
        },
        //the {:catch} below shows a Core that failed to load; the reason goes to the console
        (error) => console.error('Could not load the emulator', error)
    )

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
            <Spinner size="lg" label="Loading…" />
        {/if}
    </Column>
{:then data}
    {@render children(data)}
{:catch error}
    <ErrorState
        title={`The ${languageLabel(language)} emulator didn't load`}
        {error}
        reload
        actions={failureActions}
    >
        Its code could not be downloaded or started. This usually happens when the site was updated
        while this page was open, or when the connection dropped, and reloading the page fixes it.
    </ErrorState>
{/await}
