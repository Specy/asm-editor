<script lang="ts">
    /**
     * The EmulatorLoader's place in a test of the page hosting it: it loads no Core, so it never
     * draws its children, which need an Emulator, and shows what it was asked to load instead.
     */
    import type { Snippet } from 'svelte'

    let {
        language,
        code = $bindable(),
        loading
    }: { language: string; code: string; loading?: Snippet } = $props()
</script>

<pre class="emulator-source" data-language={language}>{code}</pre>
{@render loading?.()}
