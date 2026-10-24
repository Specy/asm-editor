export function runtimeFunctionDocumentation(name: string, documentation: string): string {
    switch (name) {
        case 'malloc':
            return `${documentation} Returned memory meets the compiler's \`max_align_t\` alignment.`
        case 'clock':
            return `${documentation} Waiting time is excluded, and Undo rewinds the instruction counter.`
        case 'time':
            return `${documentation} Testcases use 2000-01-01 UTC plus virtual elapsed time.`
        case 'setvbuf':
            return 'Sets output buffering (`_IOFBF`, `_IOLBF` or `_IONBF`). Requests to buffer input fail; input remains unbuffered. Returns 0, or nonzero on failure.'
        case 'getenv':
            return 'Always returns NULL; the editor Runtime library does not expose environment variables through this function.'
        case 'exit':
            return 'Runs atexit handlers and static destructors, flushes output streams, then ends the program with the given status.'
        default:
            return documentation
    }
}
