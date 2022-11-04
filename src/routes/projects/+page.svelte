<script lang="ts">
	import { ProjectStore } from '$stores/projectsStore'
	import ProjectCard from '$cmp/project/Card.svelte'
	import { onMount } from 'svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import Title from '$cmp/layout/Title.svelte'
	import ButtonLink from '$cmp/buttons/ButtonLink.svelte'
	const { projects } = ProjectStore
	onMount(() => {
		ProjectStore.load()
	})
</script>

<title> Projects </title>
<div class="project-display">
	<div class="content">
		<div class="top-row">
			<div class="row" style="align-items: center;">
				<a href="/" class="go-back">
					<Button hasIcon cssVar="primary" style="padding: 0.4rem">
						<Icon size={2}>
							<FaAngleLeft />
						</Icon>
					</Button>
				</a>
				<Title style="margin: 0">Your projects</Title>
			</div>
			<ButtonLink href="/projects/create"> Create </ButtonLink>
		</div>
		{#if $projects.length === 0}
			<h3 style="margin-top: 4rem; margin-left: 2rem; font-weight:unset">
				You seem to have no projects, create one!
			</h3>
		{/if}
		<div class="project-grid">
			{#each $projects as project (project.id)}
				<ProjectCard {project} />
			{/each}
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
	.project-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
	}
	@media screen and (min-width: 400px) {
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
	@media screen and (max-width: 700px) {
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
