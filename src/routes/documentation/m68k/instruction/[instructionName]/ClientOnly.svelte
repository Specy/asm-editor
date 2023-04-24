<script lang="ts">
    export let code: string = ""
    export let instructionKey: string
	import ExampleBar from './InteractiveInstructionEditor.svelte'

</script>


<ExampleBar bind:code={code} {instructionKey}/>