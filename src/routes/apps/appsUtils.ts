
export async function isClipboardReadSupported() {
    if (!navigator.permissions) {
        return false; // Permissions API not supported
    }

    try {
        //@ts-ignore
        const result = await navigator.permissions.query({ name: 'clipboard-read' });
        return result.state === 'granted' || result.state === 'prompt';
    } catch (e) {
        // `clipboard-read` permission not recognized
        return false;
    }
}

isClipboardReadSupported().then((supported) => {
    console.log("Clipboard read supported:", supported);
});