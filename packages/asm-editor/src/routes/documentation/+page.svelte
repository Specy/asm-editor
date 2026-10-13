<script lang="ts">
    import Page from '#cmp/shared/layout/Page.svelte'
    import NavigationLinkButton from '#cmp/shared/button/NavigationLinkButton.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { languageAccent } from '#lib/languages/languageColors.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    const langs = ['M68K', 'MIPS', 'RISC-V', 'X86', 'Z80'] satisfies AvailableLanguages[]
</script>

<DefaultNavbar />
<PageMeta
    title="Documentation - M68K, MIPS, RISC-V, x86 and Z80 assembly reference | Asm Editor"
    description="Instruction references, registers, directives, syscalls and runtime library docs for M68K, MIPS, RISC-V, x86-64 and Z80 assembly in the Asm Editor."
/>

<Page cropped hasNavbar contentStyle="padding: 1rem">
    <Header>Languages</Header>
    <div class="langs">
        {#each langs as lang (lang)}
            <NavigationLinkButton
                href="/documentation/{lang.toLowerCase()}"
                color={languageAccent(lang)}
            >
                <div>
                    {lang}
                </div>
            </NavigationLinkButton>
        {/each}
    </div>
</Page>

<style lang="scss">
    .langs {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
        gap: 1rem;
    }
</style>
