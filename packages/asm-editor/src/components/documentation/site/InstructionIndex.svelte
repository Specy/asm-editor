<script lang="ts">
    /**
     * A language's instruction index, `/documentation/<language>/instruction`: a link to every
     * instruction's page, under the letter it starts with. The language's own route passes in its
     * instruction names, so no page loads another language's lists.
     */
    import type { Snippet } from 'svelte'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import FaArrowRight from '~icons/fa-solid/arrow-right'
    import { capitalize } from '#lib/utils.ts'
    import type { DocumentationLanguage } from '#lib/search/scope.ts'
    import { DOCUMENTATION_SITES } from '#lib/documentation/site.ts'
    import { resolveHref } from '#lib/hrefs.ts'

    interface Props {
        language: DocumentationLanguage
        /** The mnemonics that have a page under `/documentation/<language>/instruction`. */
        names: string[]
        description: string
        /** Shows the names as code, as written and in the editor's font, rather than capitalized. */
        code?: boolean
        /** What comes between the heading and the letters, styled by the page that writes it. */
        children?: Snippet
    }

    let { language, names, description, code = false, children }: Props = $props()

    const label = $derived(DOCUMENTATION_SITES[language].label)
    // A group per first letter, in alphabetical order, each keeping the order of `names`.
    const letterOf = (name: string) => name[0].toUpperCase()
    const groups = $derived(
        [...new Set(names.map(letterOf))].sort().map((letter) => ({
            letter,
            names: names.filter((name) => letterOf(name) === letter)
        }))
    )
</script>

<PageMeta title={`${label} Instructions - ASM Editor`} {description} />
<!-- the 70rem column every documentation index has, so the titles start at one x (D8) -->
<Page cropped="70rem" contentStyle="gap: 1rem; padding: 1rem">
    <Header>{label} Instructions</Header>
    {@render children?.()}
    {#each groups as group (group.letter)}
        <a href="#{group.letter}" style="width: min-content; margin-top: 2rem;">
            <h2 class="letter-group" id={group.letter}>
                <div>
                    {group.letter}
                </div>
            </h2>
        </a>
        <div class="instructions">
            {#each group.names as name (name)}
                <Card
                    class={['instruction', code && 'code']}
                    href={resolveHref(`/documentation/${language}/instruction/${name}`)}
                >
                    <div>
                        {code ? name : capitalize(name)}
                    </div>
                    <div class="arrow">
                        <FaArrowRight />
                    </div>
                </Card>
            {/each}
        </div>
    {/each}
</Page>

<style lang="scss">
    .instructions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .letter-group {
        background-color: var(--accent);
        color: var(--accent-text);
        width: 2.5rem;
        height: 2.5rem;
        border-radius: var(--r-pill);
        display: flex;
        justify-content: center;
        align-items: center;
    }

    /* a link Card each, laid out in a row (as specific as it must be to win over Card's column) */
    .instructions > :global(a.card.instruction) {
        flex-direction: row;
        padding: 1rem 1rem 1rem 2rem;
        align-items: center;
        width: 15rem;
        gap: 1rem;
        text-align: center;
        font-size: var(--fs-lead);
        justify-content: space-between;
    }

    .instructions > :global(.code) {
        font-family: var(--font-mono);
    }

    @media (max-width: 600px) {
        .instructions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .instructions > :global(a.card.instruction) {
            min-width: 0;
            width: 100%;
            justify-content: center;
            padding: 1rem 0.5rem;
            overflow-wrap: anywhere;
        }
        .arrow {
            display: none;
        }
    }

    .arrow {
        opacity: 0;
        height: 1.5rem;
        transition:
            opacity var(--dur-fast),
            transform var(--dur-fast);
        transform: translateX(-1rem);
    }

    :global(.instruction:hover) .arrow {
        opacity: 1;
        transform: translateX(0);
    }
</style>
