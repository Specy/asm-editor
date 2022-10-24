<script lang="ts">
	import { goto } from '$app/navigation'

	import Button from '$cmp/buttons/Button.svelte'
	import ButtonLink from '$cmp/buttons/ButtonLink.svelte'
	import Input from '$cmp/inputs/Input.svelte'
	import Select from '$cmp/inputs/Select.svelte'
	import Textarea from '$cmp/inputs/Textarea.svelte'
	import Title from '$cmp/layout/Title.svelte'
	import Form from '$cmp/misc/Form.svelte'
	import { toast } from '$cmp/toast'
	import { Project, type AvailableLanguages } from '$lib/Project'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import { ProjectStore } from '$stores/projectsStore'
	import Icon from '$cmp/layout/Icon.svelte'
	let name = ''
	let description = ''
	let language: AvailableLanguages = 'M68K'
	async function create() {
		const project = new Project({
			name,
			description,
			language,
			createdAt: new Date().getTime(),
			updatedAt: new Date().getTime()
		})
		try {
			await ProjectStore.addProject(project)
			toast.logPill('Project created')
			goto(`/projects/${project.id}`)
		} catch (e) {
			console.error(e)
			toast.error('Error creating project')
		}
	}
</script>

<title> Create Project </title>
<div class="create-project">
	<div class="content">
		<div class="row top-title">
			<a href="/projects" class="go-back">
				<Button hasIcon cssVar='primary' style='padding: 0.4rem'>
					<Icon size={2}>
						<FaAngleLeft />
					</Icon>
				</Button>
			</a>
			<Title>Create new project</Title>
		</div>
		<Form style="display: grid; gap: 1.2rem; margin:0.5rem 0" on:submit={create}>
			<Input title="Name" bind:value={name} />
			<Textarea title="Description" bind:value={description} />
			<Select title="Language" options={['M68K']} bind:value={language} />
		</Form>
		<div
			style="display:flex; justify-content: space-between; align-items:center; margin-top: 1rem;"
		>
			<ButtonLink href="/projects" cssVar="primary">Cancel</ButtonLink>
			<Button on:click={create}>Create</Button>
		</div>
	</div>
</div>

<style lang="scss">
	.create-project {
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		padding-top: 2rem;
		.content {
			max-width: 40rem;
		}
		@media screen and (max-width: 400px) {
			padding: 1rem;
			.content {
				width: 100%;
			}
		}
	}
	.top-title {
		align-items: center;
	}
	@media screen and (min-width: 400px) {
		.go-back {
			position: absolute;
			top: 1rem;
			left: 1rem;
		}
	}
</style>
