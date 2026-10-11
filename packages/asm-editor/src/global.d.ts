// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }
    export const launchQueue: {
        setConsumer: (consumer: (task: () => void) => void) => void
    }
    export const showOpenFilePicker: (options: { multiple: boolean }) => Promise<File[]>
}

export {}
