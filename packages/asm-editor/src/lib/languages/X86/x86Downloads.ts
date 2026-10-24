import { RESOURCE_STALL_TIMEOUT_MS, type ResourceDownloadError } from '@specy/x86'

/**
 * Why the x86 Core could not download something, as the editor's messages say it in brackets
 * ([message-wording-review.md](../../../../../../docs/design/message-wording-review.md), B9): the
 * server's status ("404 Not Found"), or the browser's own message, without the final period the
 * bracket would follow ("NetworkError when attempting to fetch resource"). A download that stalled
 * is the one failure the Core gives neither a status nor a cause, and says how long nothing came.
 */
export function downloadReason(error: ResourceDownloadError): string {
    if (error.status === undefined && error.cause === undefined)
        return `no response for ${RESOURCE_STALL_TIMEOUT_MS / 1000} seconds`
    return error.reason.trim().replace(/\.+$/, '')
}
