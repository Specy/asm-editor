/** Props a test can change after mounting: a `$state` object, which the component tracks. */
export function reactiveProps<T extends object>(props: T): T {
    const state = $state(props)
    return state
}
