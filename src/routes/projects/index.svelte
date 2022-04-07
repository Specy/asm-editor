<script lang="ts">
	import { ProjectStore } from '$stores/projectsStore'
    import ProjectCard from '$cmp/ProjectCard.svelte'
    import { onMount } from 'svelte';
	const { projects } = ProjectStore
    onMount(() => {
        ProjectStore.load()
    })
</script>

<title>
    Projects
</title>
<div class="project-display">
    <div class="content">
        <div class="top-row">
            <h1>
                Your projects
            </h1>
            <a href="/projects/create" class="create-button">
                Create
            </a>

        </div>
        {#if $projects.length === 0}
            <h3 style="margin-top: 4rem; margin-left: 2rem; font-weight:unset">
                You seem to have no projects, create one!
            </h3>
        {/if}
        <div class="project-grid">
            {#each $projects as project (project.id)}
                <ProjectCard project={project} />
            {/each}
        </div>

    </div>
</div>

<style lang="scss">
    .top-row{
        display: flex;
        justify-content: space-between;
        margin-top: 4rem;
        margin-bottom: 2rem;
    }
    .project-display{
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        overflow-y: auto;
        padding: 2rem;
    }
    .project-grid{
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
        justify-content: space-between;
    }
	.create-button {
		padding: 0.5rem 1rem;
		border-radius: 0.4rem;
		color: var(--accent-text);
        background-color: var(--accent);
		display: flex;
		transition: all 0.2s;
		font-size: 1rem;
		justify-content: center;
        align-items: center;
		border: none;
		width: fit-content;
		cursor: pointer;
	}
	.create-button:hover {
		filter: brightness(1.2);
	}
    .content{
        display: flex;
        flex-direction: column;
        max-width: 40rem;
        width: 100%;
    }
    @media screen and (max-width:700px){
        .top-row{
            margin-top: 1rem;
        }
        .project-display{
            padding: 1rem;
        }
        .project-grid{
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>
