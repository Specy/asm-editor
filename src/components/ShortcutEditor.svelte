<script lang="ts">
	import { shortcutsStore } from '$stores/shortcutsStore'
	import Button from './buttons/Button.svelte'
	import FloatingContainer from './FloatingContainer.svelte'
	import Icon from './layout/Icon.svelte'
	import FaCheck from 'svelte-icons/fa/FaCheck.svelte'
	import FaUndo from 'svelte-icons/fa/FaUndo.svelte'
	import { onMount } from 'svelte'
	export let visible = false
	let currentShortcut = ''
	let currentKeys = new Map()
	let selectedId = -1
	let inputRef: HTMLInputElement
	function handleKeydown(event: KeyboardEvent) {
		if (event.repeat) return
		if (event.code === 'Escape') return (selectedId = -1)
		currentKeys.set(event.code, true)
		setCurrentShortcut()
	}

	function setCurrentShortcut() {
		currentShortcut = Array.from(currentKeys.keys()).join('+')
	}
	onMount(() => {
		window.addEventListener('keydown', handleKeydown)
		return () => {
			window.removeEventListener('keydown', handleKeydown)
		}
	})
	$: {
		if (selectedId !== -1) {
			inputRef.focus()
		}
		currentKeys.clear()
		setCurrentShortcut()
		if (inputRef) inputRef.value = ''
	}
	$: {
		if (!visible && selectedId !== -1) {
			selectedId = -1
		}
	}
</script>

<FloatingContainer {visible} title="Shortcuts" style="width: 45rem">
	<div class="shortcuts column">
		<input bind:this={inputRef} class="input-preview" />
		{#each Array.from($shortcutsStore.entries()).sort((a, b) => a[1].id - b[1].id) as entry}
			<div class="row input-row">
				<div>
					{entry[1].description}
				</div>
				<div class="row" style="gap:0.3rem">
					<Button
						active={entry[1].id === selectedId}
						cssVar="secondary"
						on:click={() => {
							selectedId = entry[1].id
						}}
					>
						{entry[1].id !== selectedId ? entry[0] : currentShortcut}
					</Button>
					{#if entry[1].id === selectedId}
						<Button
							hasIcon
							style="min-height: 2.2rem"
							on:click={() => {
								shortcutsStore.updateKey(entry[0], currentShortcut)
								selectedId = -1
							}}
						>
							<Icon size={1}>
								<FaCheck />
							</Icon>
						</Button>
					{:else}
						<Button
							hasIcon
							style="min-height: 2.2rem"
							cssVar={entry[0] !== entry[1].defaultValue ? 'accent' : 'secondary'}
							disabled={entry[0] === entry[1].defaultValue}
							on:click={() => shortcutsStore.updateKey(entry[0], entry[1].defaultValue)}
						>
							<Icon size={1}>
								<FaUndo />
							</Icon>
						</Button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</FloatingContainer>

<style lang="scss">
	.shortcuts {
		display: flex;
		padding: 0.8rem;
		flex-direction: column;
		height: 80vh;
		padding-top: 0;
		gap: 0.4rem;
		overflow-y: auto;
		font-family: FiraCode;
	}
	.input-row {
		justify-content: space-between;
		padding-bottom: 0.4rem;
		align-items: center;
		padding-left: 0.4rem;
		border-bottom: 1px solid var(--secondary);
	}
	.input-preview {
		padding: 0 1rem;
		padding-top: 0.8rem;
		color: var(--secondary-text);
		background-color: transparent;
		pointer-events: none;
	}
</style>
