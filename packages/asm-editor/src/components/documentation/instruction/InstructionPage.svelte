<script lang="ts">
    /**
     * Every language's instruction page, `/documentation/<language>/instruction/<name>`. Its `<head>`
     * has the title readers search for, and the long name and summary of
     * [the shared header](../../../../../../docs/design/instruction-layout.md) (decision 6) as its
     * meta and schema.org description. Its example is in the prerendered HTML as highlighted
     * source, which the Interactive editor replaces once it loads.
     */
    import { page } from '$app/state'
    import { toMetaDescription, jsonLdScriptTag, instructionLd, breadcrumbLd } from '#lib/seo.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import type { InstructionDocument } from '#lib/documentation/instructions/document.ts'
    import type { InstructionExample as Example } from '#lib/documentation/instructions/content.ts'
    import type { InstructionLesson } from '#lib/content/lectureInstructions.ts'
    import { documentationLanguageOf } from '#lib/search/scope.ts'
    import { DOCUMENTATION_SITES } from '#lib/documentation/site.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import InstructionExample from '../site/InstructionExample.svelte'
    import InstructionDocumentView from './InstructionDocumentView.svelte'

    interface Props {
        /** The language whose documentation it is in, and that its forms are highlighted as. */
        language: AvailableLanguages
        /** What the page's load returned. */
        data: {
            props: {
                document: InstructionDocument
                /** None for the instructions there is no program to show for. */
                example?: Example
                aliases?: string[]
                lessons: readonly InstructionLesson[]
            }
        }
    }

    let { language, data }: Props = $props()

    let document = $derived(data.props.document)
    // As the title writes it: "x86-64", "MIPS".
    let architecture = $derived(DOCUMENTATION_SITES[documentationLanguageOf(language)].label)
    // The language's documentation root, for the breadcrumb: `/documentation/x86`.
    let root = $derived(`/documentation/${documentationLanguageOf(language)}`)
    // "Docs - move" matched no query anyone types; "MOVE - M68K instruction reference" matches how
    // these are actually searched for.
    let pageTitle = $derived(
        `${document.name.toUpperCase()} - ${architecture} instruction reference`
    )
    let description = $derived(`${document.name}: ${document.longName}. ${document.summary}`)
    let metaDescription = $derived(toMetaDescription(description))
    let structuredData = $derived(
        instructionLd({
            name: document.name,
            architecture,
            description,
            pathname: page.url.pathname
        })
    )
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={metaDescription} />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={metaDescription} />
    <meta property="og:type" content="article" />
    <!-- The page's schema.org description. {@html} is the only way to emit a <script> from a
         component: <svelte:element this="script"> renders nothing in Svelte, and a literal script
         tag here is taken as the component's own instance script. Safe because the payload is
         machine generated and serializeJsonLd escapes < > and &, so nothing interpolated can close
         the tag. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html jsonLdScriptTag(structuredData)}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html jsonLdScriptTag(
        breadcrumbLd([
            { name: 'Documentation', pathname: '/documentation' },
            { name: architecture, pathname: root },
            { name: document.name.toUpperCase(), pathname: page.url.pathname }
        ])
    )}
</svelte:head>

<Page contentStyle="padding: 1rem; gap: 1rem;">
    <InstructionDocumentView
        {document}
        {language}
        aliases={data.props.aliases}
        lessons={data.props.lessons}
    >
        {#snippet example()}
            {#if data.props.example}
                <InstructionExample instructionKey={document.name} example={data.props.example} />
            {/if}
        {/snippet}
    </InstructionDocumentView>
</Page>
