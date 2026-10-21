/**
 * What an embed (`/embed`) tells the page framing it. A frame has a fixed height the embed cannot
 * change from inside, so an embed whose panels wait for a Build (`hideUntilBuilt`) says when its
 * program is built and when it is no longer, and the page may size the frame to what it shows.
 * Only a boolean travels, so it is posted to any origin: a site embedding the editor can listen
 * for it as well as a lecture.
 */
export const EMBED_BUILT_MESSAGE = 'asm-editor:embed-built'

export type EmbedBuiltMessage = { type: typeof EMBED_BUILT_MESSAGE; built: boolean }

export function isEmbedBuiltMessage(data: unknown): data is EmbedBuiltMessage {
    return (
        typeof data === 'object' &&
        data !== null &&
        (data as EmbedBuiltMessage).type === EMBED_BUILT_MESSAGE &&
        typeof (data as EmbedBuiltMessage).built === 'boolean'
    )
}
