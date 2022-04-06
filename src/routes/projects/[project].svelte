<script lang="ts">
	import { page } from '$app/stores'
	import type { Project } from '$lib/Project'
	import { ProjectStore } from '$stores/projectsStore'
	import { onDestroy } from 'svelte'
	import { toast } from '$cmp/toast'
	import { M68KEmulator } from '$lib/M68KEmulator'
    import ProjectEdit from '$cmp/ProjectEdit.svelte'
	let ID = $page.params.project
	let project: Project = ProjectStore.getProject(ID)
	const emulator = M68KEmulator(project?.code || '')
	let unsubscribe = ProjectStore.projects.subscribe(() => {
		project = ProjectStore.getProject(ID)
	})

	onDestroy(unsubscribe)
</script>

<div class="project">
    {#if project}
        <ProjectEdit 
            bind:project={project} 
            id={ID} 
            on:save={({detail}) => {
                ProjectStore.save(detail)
                toast.success('Project saved')
            }}
        />
    {:else}
        <h1>
            Loading...
        </h1>
    {/if}
</div>

<style lang="scss">
    .project{
        padding: 1rem;
        display: flex;
        flex-direction: column;
        height: 100vh;
    }
</style>
