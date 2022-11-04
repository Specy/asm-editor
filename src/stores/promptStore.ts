import { writable } from "svelte/store"
export enum PromptType{
    Text,
    Confirm
}
type Prompt = {
    promise: Promise<string | boolean> | null
    question: string
    placeholder: string
    type: PromptType
    resolve: ((value: string | boolean) => void) | null
    cancellable: boolean
}
function createPromptStore() {
    const { subscribe, set, update } = writable<Prompt>({
        promise: null,
        question: '',
        placeholder: '',
        type: PromptType.Text,
        resolve: null,
        cancellable: true,
    })
    let current: Prompt
    subscribe(value => current = value)
    function ask(question: string, type: PromptType, cancellable = true, placeholder = ""): Promise<string | boolean> {
        current.resolve?.(null)
        const promise = new Promise<string | boolean>((resolve) => {
            set({ promise: null, question, placeholder, type, resolve, cancellable })
        })
        update(s => {
            s.promise = promise
            return s
        })
        return promise
    }
    function confirm(question: string, cancellable = true){
        return ask(question, PromptType.Confirm, cancellable)
    }
    function askText(question: string, cancellable = true, placeholder = ""){
        return ask(question, PromptType.Text, cancellable, placeholder)
    }
    function answer(value: string | boolean) {
        current.resolve?.(value)
        cancel()
    }
    function cancel() {
        update(s => {
            s.promise = null
            s.resolve = null
            return s
        })
        reset()
    }
    function reset() {
        update(s => {
            s.question = ''
            s.placeholder = ''
            s.cancellable = true
            return s
        })
    }
    return {
        subscribe,
        confirm,
        askText,
        ask,
        answer,
        cancel,
        reset
    }
}

export const Prompt = createPromptStore()