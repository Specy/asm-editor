export enum PromptType {
    Text,
    Confirm
}
type Prompt = {
    promise: Promise<string | boolean> | null
    id: number
    question: string
    placeholder: string
    type: PromptType
    resolve: ((value: string | boolean) => void) | null
    cancellable: boolean
}
function createPromptStore() {
    const prompt = $state<Prompt>({
        promise: null,
        question: '',
        id: 0,
        placeholder: '',
        type: PromptType.Text,
        resolve: null,
        cancellable: true
    })
    function ask(
        question: string,
        type: PromptType,
        cancellable = true,
        placeholder = ''
    ): Promise<string | boolean> {
        prompt.resolve?.(null)
        const promise = new Promise<string | boolean>((resolve) => {
            prompt.promise = null
            prompt.question = question
            prompt.placeholder = placeholder
            prompt.type = type
            prompt.resolve = resolve
            prompt.cancellable = cancellable
            prompt.id = prompt.id + 1
        })
        prompt.promise = promise
        return promise
    }
    function confirm(question: string, cancellable = true): Promise<boolean> {
        return ask(question, PromptType.Confirm, cancellable) as any as Promise<boolean>
    }
    function askText(question: string, cancellable = true, placeholder = '') {
        return ask(question, PromptType.Text, cancellable, placeholder) as any as Promise<string>
    }
    function answer(value: string | boolean) {
        prompt.resolve?.(value)
        cancel()
    }
    function cancel() {
        prompt.promise = null
        prompt.resolve = null
        reset()
    }
    function reset() {
        prompt.question = ''
        prompt.placeholder = ''
        prompt.cancellable = true
    }
    return {
        get question() {
            return prompt.question
        },
        get placeholder() {
            return prompt.placeholder
        },
        get type() {
            return prompt.type
        },
        get cancellable() {
            return prompt.cancellable
        },
        get id() {
            return prompt.id
        },
        get promise() {
            return prompt.promise
        },
        confirm,
        askText,
        ask,
        answer,
        cancel,
        reset
    }
}

export const Prompt = createPromptStore()
