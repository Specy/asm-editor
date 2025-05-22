<script lang="ts" generics="T">
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import { type Emulator, GenericEmulator } from '$lib/languages/Emulator'
    import type { Snippet } from 'svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import type { EmulatorSettings } from '$lib/languages/commonLanguageFeatures.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'

    // Define the props the component expects
    interface Props {
        language: AvailableLanguages,
        code: string
        children: Snippet<[Emulator]>
        loading?: Snippet,
        settings?: EmulatorSettings
    }

    let { language, code = $bindable(), children, loading, settings }: Props = $props()

    const emulator = GenericEmulator(language, code, settings)

</script>

{#await emulator}
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