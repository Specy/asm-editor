<script lang="ts">
    import DocumentationHome from '#cmp/documentation/site/DocumentationHome.svelte'
    import { instructionsDocumentationList } from '#lib/languages/M68K/M68K-documentation.ts'
</script>

<DocumentationHome
    language="m68k"
    title="M68K assembly reference - instructions, addressing modes and traps | Asm Editor"
    description="Read the M68K Documentation, including all the instructions with addressing modes and the assembler features"
/>

<svelte:head>
    <meta name="tags" content={instructionsDocumentationList.map((i) => i.name).join(', ')} />
</svelte:head>
