<script lang="ts">
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
    import { assemblyLanguageOf, fileIconKind } from './fileIconKind'

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
    const label = $derived(
        {
            executable: 'ELF executable',
            image: 'Image',
            pdf: 'PDF document',
            audio: 'Audio file',
            video: 'Video file',
            binary: 'Binary file',
            c: 'C source file',
            cpp: 'C++ source file',
            header: /\.h$/i.test(path) ? 'C header file' : 'C++ header file',
            assembly: `${assemblyLanguage} assembly file`,
            markdown: 'Markdown file',
            python: 'Python file',
            table: 'Table file',
            code: 'Code file',
            text: 'Text file',
            file: 'File'
        }[kind]
    )
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
    {:else if kind === 'executable'}
        <FaLinux />
    {:else if kind === 'image'}
        <FaFileImage />
    {:else if kind === 'pdf'}
        <FaFilePdf />
    {:else if kind === 'audio'}
        <FaFileAudio />
    {:else if kind === 'video'}
        <FaFileVideo />
    {:else if kind === 'binary'}
        <OctFileBinary />
    {:else if kind === 'header' || kind === 'code'}
        <FaFileCode />
    {:else if kind === 'assembly'}
        <FaMicrochip />
    {:else if kind === 'markdown'}
        <FaMarkdown />
    {:else if kind === 'python'}
        <FaPython />
    {:else if kind === 'table'}
        <FaFileCsv />
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
