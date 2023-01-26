<script lang="ts">
	export let accept = '*'
	type inputTypes = 'text' | 'buffer' | 'dataUrl'
	export let as: inputTypes = 'text'
	import { createEventDispatcher } from 'svelte'

	type FileResult = {
			
		data: string | ArrayBuffer | null
		file: File
	}
	const dispatch = createEventDispatcher<{import: FileResult}>()
	let input: HTMLInputElement | null = null
	function onChange(event: any) {
		if (event.target.files.length === 0) return
		const file = event.target.files[0]
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

<input type="file" bind:this={input} {accept} style="display: none;" on:change={onChange} />
<div on:click={() => input?.click()} style='cursor:pointer; width:fit-content'>
	<slot />
</div>
