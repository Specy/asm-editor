<script lang="ts">
	import type { Project } from '$lib/Project'
	import { TimeFormat } from '$lib/dateFormatter'
	import { ProjectStore } from '$stores/projectsStore'
	import FaTrashAlt from 'svelte-icons/fa/FaTrashAlt.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import { Prompt } from '$cmp/prompt'
	import ButtonLink from '$cmp/buttons/ButtonLink.svelte'
	export let project: Project
	let textContent = project.name || 'Unnamed'
	let descriptionContent = project.description || ''
	function save() {
		project.name = textContent
		project.description = descriptionContent
		ProjectStore.save(project)
	}
	async function deleteProject() {
		const result = await Prompt.askText(
			`Are you sure you want to delete "${project.name}"?`,
			'confirm'
		)
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
			{TimeFormat.format(project.createdAt, 'mini')} ago
		</div>
		<div>Edited</div>
		<div>
			{TimeFormat.format(project.updatedAt, 'mini')} ago
		</div>
	</div>
	<div class="project-footer">
		<div style="margin-left: 0.4rem">
			{project.language.toUpperCase()}
		</div>
		<div style="display: flex;">
			<button class="trash-icon" on:click={deleteProject}>
				<Icon>
					<FaTrashAlt />
				</Icon>
			</button>

			<ButtonLink bg="var(--accent2)" color="var(--accent2-text)" href={`/projects/${project.id}`}>
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
			filter: brightness(1.2);
		}
	}
	.project-dates {
		color: var(--hint);
		font-size: 0.8rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		width: fit-content;
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
		height: 2.2rem;
		margin-right: 0.5rem;
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
			filter: brightness(1.2);
		}
	}
</style>
