<script lang="ts">
    /**
     * The documented instructions a Lecture's code uses, after its text, each linked to its page
     * (`lectureInstructions.ts`). A list rather than links inside the code blocks, where they would
     * fight the highlighting and come along with a copied program.
     */
    import type { LectureInstructionGroup } from '#lib/content/lectureInstructions.ts'
    import { resolveHref } from '#lib/hrefs.ts'
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import type { DocumentationLanguage } from '#lib/search/scope.ts'

    interface Props {
        groups: readonly LectureInstructionGroup[]
        /** The Course's language, which goes without saying; none for the General course. */
        language: DocumentationLanguage | null
    }

    let { groups, language }: Props = $props()
</script>

{#if groups.length > 0}
    <section class="lecture-instructions">
        <h2>Instructions in this lesson</h2>
        {#each groups as group (group.language)}
            <p class="group">
                {#if group.language !== language}
                    <span class="language">{languageLabel(group.language.toUpperCase())}</span>
                {/if}
                {#each group.instructions as instruction (instruction.name)}
                    <a href={resolveHref(instruction.pathname)}><code>{instruction.name}</code></a>
                {/each}
            </p>
        {/each}
    </section>
{/if}

<style>
    .lecture-instructions {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        width: min(100%, 46rem);
        margin: 2rem auto 0;
    }
    h2 {
        margin: 0;
    }
    .group {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.5rem;
        margin: 0;
    }
    .language {
        font-weight: bold;
        margin-right: 0.3rem;
    }
    /* the lecture's own inline code, as a link */
    code {
        font-family: 'Fira Code', monospace;
        background: var(--secondary);
        padding: 0.2rem 0.4rem;
        border-radius: 0.3rem;
        color: var(--accent);
        transition: background-color 0.2s;
    }
    a:hover code {
        background: color-mix(in srgb, var(--accent) 18%, var(--secondary));
    }
</style>
