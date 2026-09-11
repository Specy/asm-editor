<script lang="ts">
    import SourceEditorHarness from './SourceEditorHarness.svelte'
    interface Props {
        multiFile: boolean
    }
    let { multiFile }: Props = $props()
    let files = $state<Record<string, string>>({
        'a.asm': 'contents of A',
        'b.asm': 'contents of B'
    })
    let path = $state('a.asm')
    const displayedCode = $derived(files[path] ?? '')
    let child: { typeInto: (v: string) => void; shown: () => string | undefined } | undefined =
        $state()

    export function typeInEditor(next: string) {
        child?.typeInto(next)
    }
    export function open(next: string) {
        path = next
    }
    export function files_() {
        return { ...files }
    }
    export function shown() {
        return child?.shown()
    }
    function handleFileChange(changed: string, value: string) {
        if (!(changed in files)) return
        files = { ...files, [changed]: value }
    }
</script>

<SourceEditorHarness
    bind:this={child}
    code={displayedCode}
    source={multiFile
        ? {
              key: `live:${path}`,
              value: displayedCode,
              identity: { sessionId: 'test', sourceKind: 'live', path }
          }
        : undefined}
    onfilechange={handleFileChange}
/>
