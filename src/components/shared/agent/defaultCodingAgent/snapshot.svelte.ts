export function snapshotToolResult<T>(value: T): T {
    return $state.snapshot(value) as T
}