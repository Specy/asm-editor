<script lang="ts">
	import type { Project } from '$lib/Project'
	import timeAgo from 's-ago'
	import { ProjectStore } from '$stores/projectsStore'
	import FaTrashAlt from 'svelte-icons/fa/FaTrashAlt.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import { Prompt, PromptType } from '$stores/promptStore'
	import ButtonLink from '$cmp/buttons/ButtonLink.svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import FaDownload from 'svelte-icons/fa/FaDownload.svelte'
	import { createEventDispatcher } from 'svelte'
	export let project: Project
	let textContent = project.name || 'Unnamed'
	let descriptionContent = project.description || ''
	const dispatcher = createEventDispatcher<{download: Project}>()
	function save() {
		project.name = textContent
		project.description = descriptionContent
		ProjectStore.save(project)
	}
	async function deleteProject() {
		const result = await Prompt.confirm(`Are you sure you want to delete "${project.name}"?`)
		if (!result) return
		ProjectStore.delete(project)
	}
</script>

<article class="project-card">
	<div class="project-title" contenteditable bind:textContent spellcheck="false" on:blur={save} />
	<div
		class="description"
		contenteditable
		bind:textContent={descriptionContent}
		spellcheck="false"
		on:blur={save}
	/>
	<div class="project-dates">
		<div>Created</div>
		<div>
			{timeAgo(new Date(project.createdAt))}
		</div>
		<div>Edited</div>
		<div>
			{timeAgo(new Date(project.updatedAt))}
		</div>
	</div>
	<div class="project-footer">
		<div style="margin-left: 0.4rem">
			{project.language.toUpperCase()}
		</div>
		<div style="display: flex; gap: 0.4rem">
			<Button
				cssVar="secondary"
				style="width: 2.2rem; height: 2.2rem;"
				title="Download this project"
				on:click={() => dispatcher('download', project)}
			>
				<Icon>
					<FaDownload />
				</Icon>
			</Button>
			<button class="trash-icon" on:click={deleteProject} title="Delete this project">
				<Icon>
					<FaTrashAlt />
				</Icon>
			</button>

			<ButtonLink bg="var(--accent2)" color="var(--accent2-text)" href={`/projects/${project.id}`} title="Open this project">
				Open
			</ButtonLink>
		</div>
	</div>
</article>

<style lang="scss">
	.description {
		padding: 0.5rem;
		margin: 0.5rem 0;
		background-color: transparent;
		transition: all 0.2s;
		border-radius: 0.4rem;
		&:hover,
		&:focus {
			background-color: var(--secondary);
			color: var(--secondary-text);
			filter: brightness(1.2);
		}
	}
	
	.project-dates {
		color: var(--hint);
		font-size: 0.8rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		margin-left: 0.4rem;
		column-gap: 0.5rem;
		row-gap: 0.3rem;
		margin-bottom: 0.5rem;
	}
	.trash-icon {
		border-radius: 0.4rem;
		background-color: var(--secondary);
		color: var(--red);
		width: 2.2rem;
		cursor: pointer;
		height: 2.2rem;
		display: flex;
		justify-content: center;
		align-items: center;
		transition: all 0.2s;
		&:hover {
			background-color: var(--red);
			color: var(--red-text);
		}
	}
	.project-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.project-card {
		width: 100%;
		background-color: rgba(var(--RGB-secondary), 0.9);
		color: var(--secondary-text);
		box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
		padding: 0.6rem;
		border-radius: 0.6rem;
		height: fit-content;
	}
	.project-title {
		font-size: 1.3rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: center;
		padding: 0.4rem;
		justify-content: center;
		border-radius: 0.4rem;
		background-color: transparent;
		transition: all 0.2s;
		&:hover,
		&:focus {
			background-color: var(--secondary);
			color: var(--secondary-text);
			filter: brightness(1.2);
		}
	}
</style>
