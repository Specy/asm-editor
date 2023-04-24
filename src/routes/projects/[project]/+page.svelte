<script lang="ts">
	import { page } from '$app/stores'
	import type { Project } from '$lib/Project'
	import { ProjectStore } from '$stores/projectsStore'
	import { onDestroy } from 'svelte'
	import { toast } from '$stores/toastStore'
	import ProjectEditor from '$cmp/project/ProjectEditor.svelte'
	import { Monaco } from '$lib/Monaco'
	import { onMount } from 'svelte'
	import { Prompt } from '$stores/promptStore'
	import { goto } from '$app/navigation'
	import Page from '$cmp/layout/Page.svelte'
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

<svelte:head>
	<title>
		{project?.name || 'Unnamed'}
	</title>
	
	<meta
		name="description"
		content="Use the editor to write code and run it to debug. Built in documentation and useful tools to learn and develop more easily"
	/>
</svelte:head>

<svelte:window
	on:beforeunload={(e) => {
		if (!$page.url.hostname.includes('localhost')) {
			e.preventDefault()
			e.returnValue = 'You have unsaved changes'
		}
	}}
/>
<Page contentStyle="padding: 0.8rem;">
	{#if project}
		<ProjectEditor
			bind:project
			on:wantsToLeave={() => {
				changePage('/projects')
			}}
			on:save={({ detail }) => {
				ProjectStore.save(detail.data)
				console.log('Saved')
				if (!detail.silent) toast.logPill('Project saved')
			}}
		/>
	{:else}
		<h1 class="loading">Loading...</h1>
	{/if}
</Page>

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
