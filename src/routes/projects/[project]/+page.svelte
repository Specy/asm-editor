<script lang="ts">
	import { page } from '$app/stores'
	import { Project } from '$lib/Project'
	import { ProjectStore, SHARE_ID } from '$stores/projectsStore'
	import { onMount } from 'svelte'
	import { toast } from '$stores/toastStore'
	import ProjectEditor from '$cmp/project/ProjectEditor.svelte'
	import { Monaco } from '$lib/Monaco'
	import { Prompt } from '$stores/promptStore'
	import { goto } from '$app/navigation'
	import Page from '$cmp/layout/Page.svelte'
	import lzstring from 'lz-string'

	let project: Project | null = null

	async function loadProject() {
		const id = $page.params.project
		if (id === 'share') {
			const code = $page.url.searchParams.get('project')
			const parsed = JSON.parse(lzstring.decompressFromEncodedURIComponent(code))
			parsed.id = SHARE_ID
			project = Project.from(parsed)
			return
		}
		project = await ProjectStore.getProject(id)
		if (!project) {
			toast.error('Project not found', 10000)
			return
		}
	}


	onMount(() => {
		loadProject()
		Monaco.load()
		return Monaco.dispose
	})

	async function save(project: Project): Promise<boolean> {
		if (project.id === SHARE_ID) {
			if (!(await Prompt.confirm('Do you want to save this shared project in your projects?')))
				return false
			delete project.id
			const newProject = await ProjectStore.addProject(project)
			project.id = newProject.id
		} else {
			await ProjectStore.save(project)
		}
		return true
	}

	function share(pr: Project) {
		if (!pr) return
		const p = pr.toObject()
		p.id = SHARE_ID
		const code = lzstring.compressToEncodedURIComponent(JSON.stringify(p))
		const url = `${window.location.origin}/projects/share?project=${code}`
		navigator.clipboard.writeText(url)
		toast.logPill('Copied to clipboard')
	}

	async function changePage(page: string) {
		try {
			const stored = await ProjectStore.getProjectFromDb(project.id)
			if (!stored) {
				const save = await Prompt.confirm(
					'This project has not been saved. Would you like to create and save it?'
				)
				if (save) {
					await ProjectStore.addProject(project)
					toast.logPill('Project created')
				}
				return goto(page)
			}
			if (stored.code === project.code) return goto(page)
			const wantsToSave = await Prompt.confirm('You have unsaved changes. Do you want to save them?')
			if (wantsToSave) {
				await ProjectStore.save(project)
				toast.logPill('Project saved')
			}
			goto(page)
		} catch (e) {
			console.error(e)
			toast.error('Error updating project')
		}
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
<Page>
	{#if project}
		<ProjectEditor
			bind:project
			on:wantsToLeave={() => {
				changePage('/projects')
			}}
			on:save={async ({ detail }) => {
				if(!await save(project)) return
				console.log('Saved')
				if (!detail.silent) toast.logPill('Project saved')
			}}
			on:share={({detail}) => {
				share(detail)
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
