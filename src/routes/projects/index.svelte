<script lang="ts">
	import Button from '$cmp/buttons/Button.svelte'
	import { ProjectStore } from '$stores/projectsStore'

	const { projects } = ProjectStore
</script>

<a href="/projects/create">
    Create project
</a>

{#each $projects as project}
    <a href={`/projects/${project.id}`}>
         <h1>{project.name}</h1>
        <p>{project.description}</p>
    </a>
{/each}

<style lang="scss">
</style>
