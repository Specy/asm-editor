<script lang="ts">
	import { afterNavigate, beforeNavigate } from '$app/navigation'
	import RgbLine from '$cmp/misc/RgbLine.svelte'
	import type { Timer } from '$lib/utils'
	import { fly } from 'svelte/transition'
	export let refresh = ''

	let status = ''
	let timeout: Timer
	let timeout2: Timer
	let goingBack = false
	function handleProgress(s: string) {
		if (s === 'started') {
			status = 'progress-70'
			clearTimeout(timeout2)
			timeout2 = setTimeout(() => {
				status = ''
			}, 5000)
		}
		if (s === 'ended') {
			status = 'progress-finish'
			clearTimeout(timeout)
			timeout = setTimeout(() => {
				status = ''
			}, 200)
		}
	}

	function removeRoot(url: string) {
		return url.replace(/^\/+/, '')
	}

	beforeNavigate((n) => {
		try {
			const params = n.to.url.searchParams
			const back = params?.get('b')
			if (back) {
				goingBack = back === '1' ?? false
			} else {
				const from = removeRoot(n.from.url.pathname)
				const to = removeRoot(n.to.url.pathname)
				goingBack = from.split('/').length >= to.split('/').length && from !== ''
			}
		} catch (e) {
			console.error(e)
		}
		handleProgress('started')
	})
	afterNavigate(() => {
		handleProgress('ended')
	})
</script>

{#key refresh}
	<div class={`progress`}>
		<div class={status}>
			<RgbLine height="0.3rem" />
		</div>
	</div>

	<div in:fly={{ x: goingBack ? 30 : -30, duration: 500 }} class="page">
		<slot />
	</div>
{/key}

<style lang="scss">
	.page {
		display: flex;
		flex-direction: column;
		flex: 1;
	}
	.progress {
		height: 4px;
		width: 100%;
		position: absolute;
		z-index: 1000;
		overflow: hidden;
		> div {
			border-radius: 1rem;
			transform: translateX(-110%);
		}
		.progress-70 {
			animation: progressTo70 1s ease-out;
			animation-fill-mode: forwards;
		}
		.progress-finish {
			animation: progressToFinish 0.2s ease-out;
			animation-fill-mode: forwards;
		}
		@keyframes progressTo70 {
			from {
				transform: translateX(-100%);
				opacity: 0.5;
			}
			to {
				opacity: 1;
				transform: translateX(-30%);
			}
		}
		@keyframes progressToFinish {
			from {
				transform: translateX(-30%);
			}
			to {
				transform: translateX(0%);
				opacity: 0.4;
			}
		}
	}
</style>
