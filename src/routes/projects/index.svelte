<script lang="ts">
	import Button from '$cmp/buttons/Button.svelte'
	import { ProjectStore } from '$stores/projectsStore'

	const { projects } = ProjectStore
</script>

<Button>Create project</Button>

{#each $projects as project}
    <div>
        <h1>{project.name}</h1>
        <p>{project.description}</p>
    </div>
{/each}

<style lang="scss">
</style>
