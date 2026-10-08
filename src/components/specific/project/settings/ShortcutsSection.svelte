<script lang="ts">
    /**
     * The shortcuts and their keys, each rebindable: pick one, press the keys, confirm. The keys are
     * recorded from a focused input, which is what keeps the Workbench's own shortcut handler (it
     * ignores keys typed into inputs) from also running the key being bound.
     */
    import {
        modShortcutKey,
        shortcutLabel,
        shortcutRecording,
        shortcutsStore
    } from '$stores/shortcutsStore'
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaCheck from '~icons/fa-solid/check'
    import FaUndo from '~icons/fa-solid/undo'
    import { onMount } from 'svelte'
    interface Props {
        /** Whether the list is on screen; hiding it drops a key being recorded. */
        visible?: boolean
        style?: string
    }

    let { visible = true, style = '' }: Props = $props()
    let currentShortcut = $state('')
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- This imperative accumulator must not self-invalidate and clear the input.
    let currentKeys = new Map<string, true>()
    let selectedId = $state(-1)
    let inputRef: HTMLInputElement | undefined = $state()
    function handleKeydown(event: KeyboardEvent) {
        if (event.repeat || selectedId === -1) return
        if (event.code === 'Escape') return (selectedId = -1)
        //a key held with the platform's command key is recorded as `Mod+…`, one binding for Ctrl on
        //Windows and Linux and ⌘ on a Mac; the browser's own use of it is held back meanwhile
        const command = modShortcutKey(event)
        if (command) {
            event.preventDefault()
            currentKeys.clear()
            currentShortcut = command
            return
        }
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
    $effect(() => {
        if (selectedId !== -1) {
            inputRef?.focus()
        }
        currentKeys.clear()
        setCurrentShortcut()
        if (inputRef) inputRef.value = ''
    })
    $effect(() => {
        if (!visible && selectedId !== -1) {
            selectedId = -1
        }
    })
    $effect(() => {
        shortcutRecording.active = selectedId !== -1
        return () => {
            shortcutRecording.active = false
        }
    })
</script>

<div class="shortcuts column" {style}>
    <input bind:this={inputRef} class="input-preview" />
    {#each Array.from($shortcutsStore.entries()).sort((a, b) => a[1].id - b[1].id) as entry (entry[1].id)}
        <div class="row input-row">
            <div>
                {entry[1].description}
            </div>
            <div class="row" style="gap:0.3rem">
                <Button
                    active={entry[1].id === selectedId}
                    cssVar="secondary"
                    onClick={() => {
                        selectedId = entry[1].id
                    }}
                >
                    {shortcutLabel(entry[1].id !== selectedId ? entry[0] : currentShortcut)}
                </Button>
                {#if entry[1].id === selectedId}
                    <Button
                        hasIcon
                        style="min-height: 2.2rem"
                        onClick={() => {
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
                        onClick={() => shortcutsStore.updateKey(entry[0], entry[1].defaultValue)}
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

<style lang="scss">
    .shortcuts {
        display: flex;
        padding: 0.8rem;
        flex-direction: column;
        padding-top: 0;
        gap: 0.4rem;
        overflow-y: auto;
        font-family: 'Fira Code', monospace;
    }
    .input-row {
        justify-content: space-between;
        padding-bottom: 0.4rem;
        align-items: center;
        padding-left: 0.4rem;
        border-bottom: 1px solid var(--wb-line, var(--secondary));
    }
    .input-preview {
        padding: 0 1rem;
        padding-top: 0.8rem;
        color: var(--secondary-text);
        background-color: transparent;
        pointer-events: none;
    }
</style>
