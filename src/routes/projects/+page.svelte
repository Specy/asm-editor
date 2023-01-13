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
	const { projects } = ProjectStore
	onMount(() => {
		ProjectStore.load()
	})
</script>

<svelte:head>
	<title> Projects </title>
	<meta name="description" content="Create, edit or delete your projects" />
</svelte:head>
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
			<ButtonLink href="/projects/create" title="Create a new project"> Create </ButtonLink>
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
					<ProjectCard {project} />
				</div>
			{/each}
			<div class="add-project">
				<Icon size={2.5}>
					<FaPlus />
				</Icon>
				<div>
					Create project
				</div>
			</div>
		</div>
	</div>
</div>

<style lang="scss">
	.top-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 4rem;
		margin-bottom: 2rem;
	}
	.add-project{
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
		}
		.project-display {
			padding: 1rem;
		}
		.project-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
