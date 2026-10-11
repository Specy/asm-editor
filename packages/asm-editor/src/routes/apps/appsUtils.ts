export async function isClipboardReadSupported() {
    if (!navigator.permissions) {
        return false // Permissions API not supported
    }

    try {
        // @ts-ignore -- clipboard-read is absent from some PermissionName definitions
        const result = await navigator.permissions.query({ name: 'clipboard-read' })
        return result.state === 'granted' || result.state === 'prompt'
    } catch {
        // `clipboard-read` permission not recognized
        return false
    }
}
