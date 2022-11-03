<script lang="ts">
	import { page } from '$app/stores'
	import type { Project } from '$lib/Project'
	import { ProjectStore } from '$stores/projectsStore'
	import { onDestroy } from 'svelte'
	import { toast } from '$stores/toast'
	import ProjectEdit from '$cmp/project/ProjectEditor.svelte'
	import { Monaco } from '$lib/Monaco'
	import { onMount } from 'svelte'
	let ID = $page.params.project
	let project: Project = ProjectStore.getProject(ID)
	let unsubscribe = ProjectStore.projects.subscribe(() => {
		project = ProjectStore.getProject(ID)
	})
	onDestroy(unsubscribe)

	onMount(() => {
		Monaco.load()
		return Monaco.dispose
	})
</script>

<title>
	{project?.name || 'Unnamed'}
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
				toast.logPill('Project saved')
			}}
		/>
	{:else}
		<h1 class="loading">
			Loading...
		</h1>
	{/if}
</div>

<style lang="scss">
	.project {
		padding: 0.8rem;
		display: flex;
		flex-direction: column;
		height: 100%;
		max-height: 100%;
	}
	.loading{
		width:100%;
		height: 100%;
		display:flex;
		font-size: 3rem;
		justify-content:center;
		align-items: center;
	}
</style>
