import type { ProjectFileKind } from '#lib/fileKinds.ts'

const PREVIEW_LABELS = { image: 'an image', pdf: 'a PDF', audio: 'audio', video: 'a video' }

/** What a File is, as the notices over its views name it. */
export function fileKindLabel(kind: ProjectFileKind): string {
    if (kind === 'text') return 'text'
    if (kind === 'executable') return 'an Executable'
    if (kind === 'bytes') return 'bytes'
    return `${PREVIEW_LABELS[kind.preview]} (${kind.mime})`
}
