export enum PromptType {
    Text,
    Confirm,
    /** A message with a single Ok, MARS's and RARS's message dialogs. */
    Alert
}
type Prompt = {
    promise: Promise<PromptResult> | null
    id: number
    question: string
    placeholder: string
    /** The answer a text prompt's input starts with, for a person to keep or change. */
    initial: string
    type: PromptType
    resolve: ((value: PromptResult) => void) | null
    cancellable: boolean
    /**
     * Whether a confirm offers Cancel beside No and Yes, as MARS's confirm dialog does. The app's
     * own confirms are yes-or-no questions and leave it off.
     */
    offersCancel: boolean
}
type PromptResult = string | boolean | null

function createPromptStore() {
    const prompt = $state<Prompt>({
        promise: null,
        question: '',
        id: 0,
        placeholder: '',
        initial: '',
        type: PromptType.Text,
        resolve: null,
        cancellable: true,
        offersCancel: false
    })
    function ask(
        question: string,
        type: PromptType,
        cancellable = true,
        placeholder = '',
        initial = ''
    ): Promise<PromptResult> {
        settle(null)
        prompt.question = question
        prompt.placeholder = placeholder
        prompt.initial = initial
        prompt.type = type
        prompt.cancellable = cancellable
        prompt.offersCancel = false
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

    /**
     * A question answered Yes, No or Cancel, MARS's and RARS's confirm dialog: true, false, or null
     * for Cancel, which is also what a prompt that something else dismissed answers.
     */
    async function confirmOrCancel(question: string): Promise<boolean | null> {
        const pending = ask(question, PromptType.Confirm, true)
        prompt.offersCancel = true
        const result = await pending
        return typeof result === 'boolean' ? result : null
    }

    /** A message dismissed with Ok, awaited until it is, or until another prompt replaces it. */
    async function alert(message: string): Promise<void> {
        await ask(message, PromptType.Alert, true)
    }

    /** A line of text, its input starting empty or with `initial`; null for Cancel. */
    async function askText(
        question: string,
        cancellable = true,
        placeholder = '',
        initial = ''
    ): Promise<string | null> {
        const result = await ask(question, PromptType.Text, cancellable, placeholder, initial)
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

    function answerAlert() {
        if (prompt.type !== PromptType.Alert) return
        settle(true)
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
        prompt.initial = ''
        prompt.cancellable = true
        prompt.offersCancel = false
    }
    return {
        get question() {
            return prompt.question
        },
        get placeholder() {
            return prompt.placeholder
        },
        get initial() {
            return prompt.initial
        },
        get type() {
            return prompt.type
        },
        get cancellable() {
            return prompt.cancellable
        },
        get offersCancel() {
            return prompt.offersCancel
        },
        get id() {
            return prompt.id
        },
        get promise() {
            return prompt.promise
        },
        confirm,
        confirmOrCancel,
        alert,
        askText,
        answerText,
        answerConfirm,
        answerAlert,
        cancel
    }
}

export const Prompt = createPromptStore()
