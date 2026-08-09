export enum PromptType {
    Text,
    Confirm
}
type Prompt = {
    promise: Promise<PromptResult> | null
    id: number
    question: string
    placeholder: string
    type: PromptType
    resolve: ((value: PromptResult) => void) | null
    cancellable: boolean
}
type PromptResult = string | boolean | null

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
    ): Promise<PromptResult> {
        settle(null)
        prompt.question = question
        prompt.placeholder = placeholder
        prompt.type = type
        prompt.cancellable = cancellable
        prompt.id = prompt.id + 1
        const promise = new Promise<PromptResult>((resolve) => {
            prompt.resolve = resolve
        })
        prompt.promise = promise
        return promise
    }

    async function confirm(question: string, cancellable = true): Promise<boolean | null> {
        const result = await ask(question, PromptType.Confirm, cancellable)
        return typeof result === 'boolean' ? result : null
    }

    async function askText(
        question: string,
        cancellable = true,
        placeholder = ''
    ): Promise<string | null> {
        const result = await ask(question, PromptType.Text, cancellable, placeholder)
        return typeof result === 'string' ? result : null
    }

    function answerText(value: string) {
        if (prompt.type !== PromptType.Text) return
        settle(value)
    }

    function answerConfirm(value: boolean) {
        if (prompt.type !== PromptType.Confirm) return
        settle(value)
    }

    function cancel() {
        settle(null)
    }

    function settle(value: PromptResult) {
        const resolve = prompt.resolve
        prompt.promise = null
        prompt.resolve = null
        reset()
        resolve?.(value)
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
        answerText,
        answerConfirm,
        cancel
    }
}

export const Prompt = createPromptStore()
