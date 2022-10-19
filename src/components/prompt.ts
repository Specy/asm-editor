import { writable } from "svelte/store"
import type { Writable } from "svelte/store"

type PromptType = 'text' | 'confirm'
export class PromptClass{
    //TODO convert this into a single store
    promise: Writable<Promise<string | boolean> | null>
    private resolve: (value: string | boolean) => void | null
    question: Writable<string>
    placeholder: Writable<string>
    cancellable: Writable<boolean>
    type: Writable<PromptType>
    constructor(){
        this.promise = writable(null)
        this.question = writable("")
        this.placeholder = writable("")
        this.cancellable = writable(true)
        this.type = writable("text")
    }

    askText(question: string,type: PromptType, cancellable = true, placeholder = ""): Promise<string | boolean>{
        this.resolve?.(null)
        const promise = new Promise<string | boolean>((resolve) => {
            this.resolve = resolve
            this.question.set(question)
            this.placeholder.set(placeholder)
            this.cancellable.set(cancellable)
            this.type.set(type)
        })
        this.promise.set(promise)
        return promise
    }
    answer = (value: string | boolean):void => {
        this.resolve?.(value)
        this.promise.set(null)
        this.reset()
    }
    cancel = (): void => {
        this.resolve?.(null)
        this.promise.set(null)
        this.reset()
    }
    reset = (): void => {
        this.question.set("")
        this.placeholder.set("")
        this.cancellable.set(true)
    }
}


export const Prompt = new PromptClass()