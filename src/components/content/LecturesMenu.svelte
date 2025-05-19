<script lang="ts">

    import Column from '$cmp/shared/layout/Column.svelte'
    import type { Lecture } from '$lib/content/getters'
    interface Props {
        currentLecture?: Lecture
        lectures: Lecture[]
				hrefBase: string,
				onClick?: (e: MouseEvent) => void
				lectureStyle?: string
    }

    let { currentLecture, lectures, hrefBase, onClick, lectureStyle}: Props = $props()
</script>

<Column>
	{#each lectures as lecture}
		<a
			href="{hrefBase}/{lecture.slug}"
			class="lecture-link"
			class:current-lecture={lecture.slug === currentLecture?.slug}
			onclick={onClick}
			style={lectureStyle}
		>
			<div class="lecture-link-inner">
				{lecture.name}
			</div>
		</a>
	{/each}
</Column>

<style lang="scss">
  a {
    padding: 0.4rem 0.6rem;
    border-radius: 0 0.2rem 0.2rem 0;
    border-left: solid 0.2rem transparent;
  }

  a:hover {
    background-color: var(--tertiary);
    color: var(--tertiary-text);
    border-left-color: var(--accent);
  }
  .current-lecture {
    border-left-color: var(--accent2);
    background-color: rgba(var(--RGB-tertiary), 0.5);
  }
  .lecture-link-inner {
		opacity: 0.9;
    transition: transform 0.1s;
		font-size: 1rem;
  }
  a:hover > .lecture-link-inner {
    transform: translateX(0.2rem);
  }
</style>
