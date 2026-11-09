<script lang="ts">
    /**
     * An instruction set's colour (`languageAccent`) as a small square, as the home page's
     * instruction-set bar marks each set: beside the set's name, which says it in words, so the
     * square is hidden from a screen reader. In a row (it does not shrink).
     */
    import { languageAccent } from '#lib/languages/languageColors.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'

    interface Props {
        language: AvailableLanguages
    }

    let { language }: Props = $props()
</script>

<span class="language-square" style:background-color={languageAccent(language)} aria-hidden="true"
></span>

<style>
    .language-square {
        flex: none;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 2px;
    }
</style>
