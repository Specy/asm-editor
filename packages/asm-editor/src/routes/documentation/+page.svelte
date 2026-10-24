<script lang="ts">
    import { resolve } from '$app/paths'
    import type { ResolvedPathname } from '$app/types'
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import Page from '#cmp/shared/layout/Page.svelte'
    import NavigationLinkButton from '#cmp/shared/button/NavigationLinkButton.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import { languageAccent } from '#lib/languages/languageColors.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    const langs = [
        { lang: 'M68K', href: resolve('/documentation/m68k') },
        { lang: 'MIPS', href: resolve('/documentation/mips') },
        { lang: 'RISC-V', href: resolve('/documentation/risc-v') },
        { lang: 'X86', href: resolve('/documentation/x86') },
        { lang: 'Z80', href: resolve('/documentation/z80') }
    ] satisfies { lang: AvailableLanguages; href: ResolvedPathname }[]
</script>

<DefaultNavbar />
<PageMeta
    title="Documentation - M68K, MIPS, RISC-V, x86-64 and Z80 assembly reference | Asm Editor"
    description="Instruction references, registers, directives, syscalls and runtime library docs for M68K, MIPS, RISC-V, x86-64 and Z80 assembly in the Asm Editor."
/>

<Page cropped hasNavbar contentStyle="padding: 1rem">
    <Header>Instruction Sets</Header>
    <div class="langs">
        {#each langs as { lang, href } (lang)}
            <NavigationLinkButton {href} color={languageAccent(lang)}>
                <div>
                    {languageLabel(lang)}
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
