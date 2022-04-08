<script lang="ts">
	import { page } from '$app/stores'
	import type { Project } from '$lib/Project'
	import { ProjectStore } from '$stores/projectsStore'
	import { onDestroy } from 'svelte'
	import { toast } from '$cmp/toast'
	import ProjectEdit from '$cmp/ProjectEdit.svelte'
	let ID = $page.params.project
	let project: Project = ProjectStore.getProject(ID)
	let unsubscribe = ProjectStore.projects.subscribe(() => {
		project = ProjectStore.getProject(ID)
	})
	onDestroy(unsubscribe)
</script>

<title>
	{project?.name}
</title>
<svelte:window
	on:beforeunload={(e) => {
		if (!$page.url.hostname.includes('localhost')) {
			e.preventDefault()
			e.returnValue = 'You have unsaved changes'
		}
	}}
/>
<div class="project">
	{#if project}
		<ProjectEdit
			bind:project
			on:save={({ detail }) => {
				ProjectStore.save(detail)
				toast.success('Project saved')
			}}
		/>
	{:else}
		<h1>Loading...</h1>
	{/if}
</div>

<style lang="scss">
	.project {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		height: 100%;
		max-height: 100%;
	}
</style>
