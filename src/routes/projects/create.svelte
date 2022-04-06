<script>
import { goto } from '$app/navigation';

    import Button from '$cmp/buttons/Button.svelte'
    import Input from '$cmp/inputs/Input.svelte'
import { toast } from '$cmp/toast';
import { Project } from '$lib/Project';
import { ProjectStore } from '$stores/projectsStore';
    let name = ''
    let description = ''
    
    async function create(){
        const project = new Project({
            name,
            description,
            createdAt: new Date().getTime(),
            updatedAt: new Date().getTime(),
        })
        try{
            await ProjectStore.addProject(project)
            toast.success("Project created")
            goto(`./${project.id}`)
        }catch(e){
            console.error(e)
            toast.error("Error creating project")
        }

    }

</script>
    <Input title='name' bind:value={name}/>
    <Input title='description' bind:value={description}/>

    <div>
        <Button on:click={create}>Create new</Button>
    </div>

<style>

</style>