<script lang="ts">
	import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import Title from '$cmp/layout/Title.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import Card from '$cmp/layout/Card.svelte';
	import { toast } from '$cmp/toast';

	let counter = 0
	function handleClick(event){
		counter++
		if(counter % 5 === 0){
			toast.success("Woohoo clicked 5 times")
		}
	}

</script>

<title>
	Template
</title>

<div>
	<Title>
		{counter}
	</Title>
	<Card>
		<Button on:click={handleClick} style='width:8rem;'> 
			Click me 
			<Icon style='margin-left: 0.5rem'>
				<FaPlus />
			</Icon>
		</Button>
	</Card>
</div>


<style lang="scss">
	@import '../variables.scss';

</style>
