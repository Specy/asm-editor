<script lang="ts">
    import { jsonLdScriptTag } from '#lib/seo.ts'

    interface Props {
        /** The full <title>, which is also the og and twitter title. */
        title: string
        description: string
        type?: 'website' | 'article'
        /** Each entry becomes its own <script type="application/ld+json">. */
        jsonLd?: object[]
    }

    let { title, description, type = 'website', jsonLd = [] }: Props = $props()
</script>

<!-- The head block the instruction pages already write by hand, factored out so the
     documentation hubs, syscall pages and course pages get the same tags. The layout
     supplies canonical, og:url, og:site_name, twitter:card and the social image. -->
<svelte:head>
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content={type} />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    {#each jsonLd as entry, index (index)}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html jsonLdScriptTag(entry)}
    {/each}
</svelte:head>
