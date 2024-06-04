<script lang="ts">
    export let code = ""
    export let instructionKey: string
	import InteractiveEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'

</script>


<InteractiveEditor bind:code={code} {instructionKey}/>