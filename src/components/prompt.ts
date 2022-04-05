import { writable, Writable } from "svelte/store"


export class PromptClass{
    promise: Writable<Promise<string> | null>
    private resolve: (value: string) => void | null
    question: Writable<string>
    placeholder: Writable<string>
    cancellable: Writable<boolean>
    constructor(){
        this.promise = writable(null)
        this.question = writable("")
    }

    askText(question: string,cancellable = true, placeholder = ""): Promise<string>{
        this.resolve?.(null)
        const promise = new Promise<string>((resolve) => {
            this.resolve = resolve
            this.question.set(question)
            this.placeholder.set(placeholder)
            this.cancellable.set(cancellable)
        })
        this.promise.set(promise)
        return promise
    }
    answer(value: string): void{
        this.resolve?.(value)
        this.promise.set(null)
        this.reset()
    }
    cancel(): void{
        this.resolve?.(null)
        this.promise.set(null)
        this.reset()
    }
    reset(): void{
        this.question.set("")
        this.placeholder.set("")
        this.cancellable.set(true)
    }
}


export const Prompt = new PromptClass()