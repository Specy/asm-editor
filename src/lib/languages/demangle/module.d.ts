export type DemangleModule = {
    ccall(name: 'demangle', result: 'number', types: ['string'], arguments_: [string]): number
    UTF8ToString(pointer: number): string
    _free(pointer: number): void
}
export default function createModule(): Promise<DemangleModule>
