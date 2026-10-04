<script lang="ts">
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import { languageAccent } from '$lib/languages/languageColors'
    import FaFile from '~icons/fa-solid/file'
    import FaFileCode from '~icons/fa-solid/file-code'
    import FaFileAlt from '~icons/fa-solid/file-alt'
    import FaMicrochip from '~icons/fa-solid/microchip'
    import OctFileBinary from '~icons/octicon/file-binary-16'

    let {
        path,
        language,
        binary = false
    }: { path: string; language: AvailableLanguages; binary?: boolean } = $props()

    const assemblyExtensions: Record<string, AvailableLanguages> = {
        m68k: 'M68K',
        x68: 'M68K',
        mips: 'MIPS',
        riscv: 'RISC-V',
        x86: 'X86',
        z80: 'Z80'
    }

    const extension = $derived(path.split('/').pop()?.split('.').slice(1).pop()?.toLowerCase())
    const assemblyLanguage = $derived(
        extension && ['asm', 's', 'inc'].includes(extension)
            ? language
            : extension === 'riscv' && language === 'RISC-V-64'
              ? language
              : Object.prototype.hasOwnProperty.call(assemblyExtensions, extension ?? '')
                ? assemblyExtensions[extension!]
                : undefined
    )
    const kind = $derived(
        binary
            ? 'binary'
            : extension === 'c'
              ? 'c'
              : ['cpp', 'cc', 'cxx'].includes(extension ?? '')
                ? 'cpp'
                : ['h', 'hpp', 'hh', 'hxx'].includes(extension ?? '')
                  ? 'header'
                  : assemblyLanguage
                    ? 'assembly'
                    : ['txt', 'md'].includes(extension ?? '')
                      ? 'text'
                      : 'file'
    )
    const label = $derived(
        {
            c: 'C source file',
            cpp: 'C++ source file',
            header: extension === 'h' ? 'C header file' : 'C++ header file',
            assembly: `${assemblyLanguage} assembly file`,
            binary: 'Binary file',
            text: 'Text file',
            file: 'File'
        }[kind]
    )
</script>

<span
    class="source-file-icon {kind}"
    style:color={kind === 'assembly' && assemblyLanguage
        ? languageAccent(assemblyLanguage)
        : undefined}
    title={label}
    aria-hidden="true"
>
    {#if kind === 'c' || kind === 'cpp'}
        <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 1.5 22 7v10l-10 5.5L2 17V7Z" fill="currentColor" />
            <path d="M15 7.8a5 5 0 1 0 0 8.4" stroke="var(--secondary)" stroke-width="2.6" />
            {#if kind === 'cpp'}
                <path
                    d="M15.5 10v4m-2-2h4m2-2v4m-2-2h4"
                    stroke="var(--secondary)"
                    stroke-width="1.2"
                />
            {/if}
        </svg>
    {:else if kind === 'header'}
        <FaFileCode />
    {:else if kind === 'assembly'}
        <FaMicrochip />
    {:else if kind === 'binary'}
        <OctFileBinary />
    {:else if kind === 'text'}
        <FaFileAlt />
    {:else}
        <FaFile />
    {/if}
</span>

<style lang="scss">
    .source-file-icon {
        display: grid;
        flex: 0 0 1rem;
        place-items: center;
        width: 1rem;
        height: 1rem;
        color: var(--hint);

        :global(svg) {
            width: 0.9rem;
            height: 0.9rem;
        }

        &.c {
            color: #78b5e8;
        }

        &.cpp {
            color: #6495e8;
        }

        &.header {
            color: #b48bdb;
        }

        &.binary {
            color: #b48bdb;
        }
    }
</style>
