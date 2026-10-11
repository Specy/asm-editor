<script lang="ts">
    type inputTypes = 'text' | 'buffer' | 'dataUrl'
    import { createEventDispatcher } from 'svelte'
    interface Props {
        accept?: string
        as?: inputTypes
        children?: import('svelte').Snippet
    }

    let { accept = '*', as = 'text', children }: Props = $props()

    type FileResult = {
        data: string | ArrayBuffer | null
        file: File
    }
    const dispatch = createEventDispatcher<{ import: FileResult }>()
    let input: HTMLInputElement | null = $state(null)
    function onChange(event: Event) {
        const file = (event.currentTarget as HTMLInputElement).files?.[0]
        if (!file) return
        const fileReader = new FileReader()
        fileReader.onloadend = () => {
            const result = {
                data: fileReader.result,
                file: file
            }
            dispatch('import', result)
            if (input) input.value = ''
        }
        fileReader.onerror = () => {
            console.error(fileReader.error)
            if (input) input.value = ''
        }
        if (as === 'text') fileReader.readAsText(file)
        if (as === 'buffer') fileReader.readAsArrayBuffer(file)
        if (as === 'dataUrl') fileReader.readAsDataURL(file)
    }
</script>

<input type="file" bind:this={input} {accept} style="display: none;" onchange={onChange} />
<!-- the control is whatever the caller puts inside, a button, whose click (or Enter) bubbles here -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div onclick={() => input?.click()} style="cursor:pointer; width:fit-content">
    {@render children?.()}
</div>
