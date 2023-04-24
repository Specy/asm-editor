<script lang="ts">
	import { ProjectStore } from '$stores/projectsStore'
	import ProjectCard from '$cmp/project/ProjectCard.svelte'
	import { onMount } from 'svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
	import Title from '$cmp/layout/Title.svelte'
	import ButtonLink from '$cmp/buttons/ButtonLink.svelte'
	import { scale } from 'svelte/transition'
	import FileImporter from '$cmp/misc/FileImporter.svelte'
	import { textDownloader } from '$lib/utils'
	import FaUpload from 'svelte-icons/fa/FaUpload.svelte'
	import { toast } from '$stores/toastStore'
	import { Project } from '$lib/Project'
	import { Prompt } from '$stores/promptStore'
	import { goto } from '$app/navigation'
	import Page from '$cmp/layout/Page.svelte'
	const { projects } = ProjectStore

	let hasFileHandleSupport = false
	async function importFromText(text: string) {
		try {
			const project = Project.fromExternal(text)
			const existing = await ProjectStore.getProject(project.id)
			if (existing && existing.code.trim() !== project.code.trim()) {
				const override = await Prompt.confirm(
					'An existing project with this id already exists, do you want to override it?'
				)
				if (!override) {
					toast.success('Cancelled import')
					return undefined
				}
				ProjectStore.save(project)
				toast.logPill('Overriden project!')
				return project
			} else if (existing) {
				ProjectStore.save(project)
				toast.logPill('Updated project!')
				return project
			} else {
				const proj = await ProjectStore.addProject(project)
				toast.success('Imported project!')
				return proj
			}
		} catch (e) {
			console.error(e)
			toast.error('Failed to import project!')
		}
		return undefined
	}

	async function importFromFileHandle(fileHandles: FileSystemFileHandle[]) {
		for (const fileHandle of fileHandles) {
			console.log(fileHandle)
			const blob = await fileHandle.getFile()
			blob.handle = fileHandle
			const text = await blob.text()
			const project = Project.fromExternal(text)
			const id = (await importFromText(text))?.id ?? project.id
			ProjectStore.setFileHandle(id, fileHandle)
			const proj = await ProjectStore.getProject(id)
			ProjectStore.save(proj) //saves the new metadata to the file
		}
	}
	onMount(async () => {
		//hasFileHandleSupport = !!window?.showOpenFilePicker
		await ProjectStore.load()
		try {
			if ('launchQueue' in window) {
				launchQueue.setConsumer(async (launchParams) => {
					let lastId = ''
					for (const file of launchParams.files) {
						try {
							const blob = await file.getFile()
							blob.handle = file
							const text = await blob.text()
							const project = Project.fromExternal(text)
							lastId = (await importFromText(text))?.id ?? project.id
							ProjectStore.setFileHandle(lastId, file)
							const proj = await ProjectStore.getProject(lastId)
							ProjectStore.save(proj) //saves the new metadata to the file
						} catch (e) {
							console.error(e)
							toast.error('Failed to import project!')
						}
					}
					const project = ProjectStore.getProject(lastId)
					if (project && launchParams.files.length === 1) {
						goto(`/projects/${project.id}`)
					}
				})
			} else {
				console.error('File Handling API is not supported!')
			}
		} catch (e) {
			console.error(e)
		}
		return () => {
			launchQueue?.setConsumer(() => {})
		}
	})
</script>

<svelte:head>
	<title>Projects</title>
	<meta name="description" content="Create, edit or delete your projects" />
	<meta name="og:description" content="Create, edit or delete your projects" />
	<meta name="og:title" content="Projects" />
</svelte:head>
<Page>
	<div class="project-display">
		<div class="content">
			<div class="top-row">
				<div class="row" style="align-items: center;">
					<a href="/" class="go-back" title="Go to the main page">
						<Button hasIcon cssVar="primary" style="padding: 0.4rem" title="Go to the main page">
							<Icon size={2}>
								<FaAngleLeft />
							</Icon>
						</Button>
					</a>
					<Title style="margin: 0">Your projects</Title>
				</div>
				<div class="row top-row-buttons">
					{#if hasFileHandleSupport}
						<!-- Ignored for now as browser asks for permission -->
						<Button
							cssVar="secondary"
							on:click={async () => {
								const files = await window.showOpenFilePicker({ multiple: true })
								try {
									importFromFileHandle(files)
								} catch (e) {
									console.error(e)
									toast.error('Failed to import project!')
								}
							}}
						>
							<Icon style="margin-right: 0.4rem" size={1}>
								<FaUpload />
							</Icon>
							Import
						</Button>
					{:else}
						<FileImporter
							on:import={(e) => {
								importFromText(e.detail.data)
							}}
							as="text"
						>
							<Button cssVar="secondary">
								<Icon style="margin-right: 0.4rem" size={1}>
									<FaUpload />
								</Icon>
								Import
							</Button>
						</FileImporter>
					{/if}

					<ButtonLink href="/projects/create" title="Create a new project">
						<Icon style="margin-right: 0.3rem" size={1}>
							<FaPlus />
						</Icon>
						Create
					</ButtonLink>
				</div>
			</div>
			{#if $projects.length === 0}
				<h3 style="margin-top: 4rem; margin-left: 2rem; font-weight:unset">
					You seem to have no projects, create one!
				</h3>
			{/if}
			<div class="project-grid">
				{#each $projects as project, i (project.id)}
					<div
						in:scale={{ duration: 200, delay: i * 50 + 150, start: 0.9 }}
						out:scale|local={{ duration: 300, start: 0.8 }}
					>
						<ProjectCard
							{project}
							on:download={(e) => {
								textDownloader(
									e.detail.toExternal(),
									`${(e.detail.name ?? 'Untitled project').split(' ').join('_')}.s68k`
								)
							}}
						/>
					</div>
				{/each}
				<div class="add-project">
					<Icon size={2.5}>
						<FaPlus />
					</Icon>
					<div>Create project</div>
				</div>
			</div>
		</div>
	</div>
</Page>

<style lang="scss">
	.top-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 4rem;
		margin-bottom: 2rem;
	}
	.top-row-buttons {
		gap: 0.8rem;
	}
	.add-project {
		display: none;
		justify-content: center;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
		height: 100%;
		border-radius: 0.6rem;
		color: var(--accent);
		border: solid 0.1rem var(--accent);
	}
	.project-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
	}
	@media screen and (min-width: 650px) {
		.go-back {
			position: absolute;
			top: 1rem;
			left: 1rem;
		}
	}
	.project-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
		justify-content: space-between;
	}
	.content {
		display: flex;
		flex-direction: column;
		max-width: 40rem;
		width: 100%;
	}
	@media screen and (max-width: 650px) {
		.top-row {
			margin-top: 1rem;
			margin-bottom: 1rem;
			flex-direction: column;
			align-items: unset;
			gap: 1rem;
		}
		.top-row-buttons {
			justify-content: flex-end;
		}
		.project-display {
			padding: 1rem;
		}
		.project-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
