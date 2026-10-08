/** Verification data, imported by tests only; it never initializes an example's machine. */
export type InstructionExampleExpectation = {
    registers?: Record<string, string>
    /** Raw bit patterns of the values exposed by the adapter's Register files. */
    registerFiles?: Record<string, Record<string, string>>
    flags?: Record<string, Record<string, string>>
    memory?: { address: string; bytes: number[] }[]
    output?: string
    /** A stop caused by the named instruction itself, rather than an incidental fault. */
    stop?: 'breakpoint' | 'exception'
    error?: string
}
