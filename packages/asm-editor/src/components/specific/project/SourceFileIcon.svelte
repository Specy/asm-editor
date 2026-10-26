<script lang="ts">
    import type { Component } from 'svelte'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import { languageAccent } from '#lib/languages/languageColors.ts'
    import type { ProjectFile } from '#lib/projectFiles.ts'
    import FaLinux from '~icons/fa-brands/linux'
    import FaMarkdown from '~icons/fa-brands/markdown'
    import FaPython from '~icons/fa-brands/python'
    import FaFile from '~icons/fa-solid/file'
    import FaFileAlt from '~icons/fa-solid/file-alt'
    import FaFileAudio from '~icons/fa-solid/file-audio'
    import FaFileCode from '~icons/fa-solid/file-code'
    import FaFileCsv from '~icons/fa-solid/file-csv'
    import FaFileImage from '~icons/fa-solid/file-image'
    import FaFilePdf from '~icons/fa-solid/file-pdf'
    import FaFileVideo from '~icons/fa-solid/file-video'
    import FaMicrochip from '~icons/fa-solid/microchip'
    import OctFileBinary from '~icons/octicon/file-binary-16'
    import { assemblyLanguageOf, fileIconKind, type FileIconKind } from './fileIconKind'

    let {
        path,
        language,
        file
    }: {
        path: string
        language: AvailableLanguages
        /** The File's content, by which its bytes name its kind; none for a name being typed. */
        file?: ProjectFile | Uint8Array
    } = $props()

    const kind = $derived(fileIconKind(path, language, file))
    const assemblyLanguage = $derived(
        kind === 'assembly' ? assemblyLanguageOf(path, language) : undefined
    )
    /** Each kind's icon and title; C and C++ have a mark of their own, drawn below. */
    const KINDS: Record<Exclude<FileIconKind, 'c' | 'cpp'>, { icon: Component; label: string }> = {
        executable: { icon: FaLinux, label: 'ELF executable' },
        image: { icon: FaFileImage, label: 'Image' },
        pdf: { icon: FaFilePdf, label: 'PDF document' },
        audio: { icon: FaFileAudio, label: 'Audio file' },
        video: { icon: FaFileVideo, label: 'Video file' },
        binary: { icon: OctFileBinary, label: 'Binary file' },
        header: { icon: FaFileCode, label: 'C++ header file' },
        assembly: { icon: FaMicrochip, label: 'Assembly file' },
        markdown: { icon: FaMarkdown, label: 'Markdown file' },
        python: { icon: FaPython, label: 'Python file' },
        table: { icon: FaFileCsv, label: 'Table file' },
        code: { icon: FaFileCode, label: 'Code file' },
        text: { icon: FaFileAlt, label: 'Text file' },
        file: { icon: FaFile, label: 'File' }
    }
    const label = $derived.by(() => {
        if (kind === 'c') return 'C source file'
        if (kind === 'cpp') return 'C++ source file'
        if (kind === 'header' && /\.h$/i.test(path)) return 'C header file'
        if (assemblyLanguage) return `${assemblyLanguage} assembly file`
        return KINDS[kind].label
    })
</script>

<span
    class="source-file-icon {kind}"
    style:color={assemblyLanguage ? languageAccent(assemblyLanguage) : undefined}
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
    {:else}
        {@const Icon = KINDS[kind].icon}
        <Icon />
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

        &.executable {
            color: #e3be5a;
        }

        &.image {
            color: #6cc08e;
        }

        &.pdf {
            color: #e57373;
        }

        &.audio {
            color: #e09a56;
        }

        &.video {
            color: #d483c4;
        }
    }
</style>
