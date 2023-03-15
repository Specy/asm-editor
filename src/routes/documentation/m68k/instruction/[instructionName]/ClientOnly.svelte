<script lang="ts">
    export let code: string = ""
	import ExampleBar from './ExampleBar.svelte'

</script>


<ExampleBar bind:code={code} />