<script lang="ts">
    /**
     * The `<head>` of every language's instruction page: the title readers search for, and the
     * long name and summary of [the shared header](../../../../../../docs/design/instruction-layout.md)
     * (decision 6) as its meta and schema.org description.
     */
    import { page } from '$app/state'
    import { toMetaDescription, jsonLdScriptTag, instructionLd, breadcrumbLd } from '#lib/seo.ts'
    import type { InstructionDocument } from '#lib/documentation/instructions/document.ts'

    interface Props {
        document: Pick<InstructionDocument, 'name' | 'longName' | 'summary'>
        /** As the title writes it: "x86-64", "MIPS". */
        architecture: string
        /** The language's documentation root, for the breadcrumb: `/documentation/x86`. */
        root: string
    }

    let { document, architecture, root }: Props = $props()

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
