import { byteEditsKey, type ProjectFile } from '#lib/projectFiles.ts'

/** A deterministic 128-bit content fingerprint, for change detection, not authentication. */
export function contentFingerprint(text: string): string {
    let a = 1779033703,
        b = 3144134277,
        c = 1013904242,
        d = 2773480762
    for (let i = 0; i < text.length; i++) {
        const k = text.charCodeAt(i)
        a = b ^ Math.imul(a ^ k, 597399067)
        b = c ^ Math.imul(b ^ k, 2869860233)
        c = d ^ Math.imul(c ^ k, 951274213)
        d = a ^ Math.imul(d ^ k, 2716044179)
    }
    a = Math.imul(c ^ (a >>> 18), 597399067)
    b = Math.imul(d ^ (b >>> 22), 2869860233)
    c = Math.imul(a ^ (c >>> 17), 951274213)
    d = Math.imul(b ^ (d >>> 19), 2716044179)
    return [a ^ b ^ c ^ d, b ^ a, c ^ a, d ^ a]
        .map((value) => (value >>> 0).toString(16).padStart(8, '0'))
        .join('')
}

/**
 * A File's content fingerprint, Byte edits included. A File without edits keeps the fingerprint it
 * had before edits existed, which saved Compilation records still hold.
 */
export function fileFingerprint(file: ProjectFile | undefined): string | undefined {
    if (!file) return undefined
    const edits = byteEditsKey(file)
    return contentFingerprint(`${file.encoding}\0${file.content}${edits ? `\0${edits}` : ''}`)
}
