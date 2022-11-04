<script lang="ts">
	import { page } from '$app/stores'
	import type { Project } from '$lib/Project'
	import { ProjectStore } from '$stores/projectsStore'
	import { onDestroy } from 'svelte'
	import { toast } from '$stores/toastStore'
	import ProjectEdit from '$cmp/project/ProjectEditor.svelte'
	import { Monaco } from '$lib/Monaco'
	import { onMount } from 'svelte'
	import { Prompt } from '$stores/promptStore'
	import { goto } from '$app/navigation'
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
	async function changePage(page: string) {
		const stored = await ProjectStore.getProjectFromDb(project.id)
		if (!stored) {
			const save = await Prompt.confirm(
				'This project has not been created. Would you like to create and save it?'
			)
			if (save) {
				ProjectStore.addProject(project)
				toast.logPill('Project created')
			}
			goto(page)
		}
		if (stored.code === project.code) return goto(page)
		const wantsToSave = await Prompt.confirm('You have unsaved changes. Do you want to save them?')
		if (wantsToSave) {
			ProjectStore.save(project)
			toast.logPill('Project saved')
		}
		goto(page)
	}
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
			on:wantsToLeave={() => {
				changePage('/projects')
			}}
			on:save={({ detail }) => {
				ProjectStore.save(detail)
				toast.logPill('Project saved')
			}}
		/>
	{:else}
		<h1 class="loading">Loading...</h1>
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
	.loading {
		width: 100%;
		height: 100%;
		display: flex;
		font-size: 3rem;
		justify-content: center;
		align-items: center;
	}
</style>
