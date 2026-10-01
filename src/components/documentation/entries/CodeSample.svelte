<script lang="ts">
    /** A short code sample of an entry: an instruction's forms, a syscall's call. */
    interface Props {
        code: string
        label?: string
    }

    let { code, label }: Props = $props()
</script>

<figure class="code-sample">
    {#if label}
        <figcaption>{label}</figcaption>
    {/if}
    <pre><code>{code}</code></pre>
</figure>

<style>
    .code-sample {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        margin: 0;
        min-width: 0;
    }
    figcaption {
        font-size: 0.8rem;
        color: var(--background-text-muted);
    }
    pre {
        margin: 0;
        padding: 0.4rem 0.6rem;
        border-radius: 0.4rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        overflow-x: auto;
        white-space: pre;
    }
    code {
        font-family: 'Fira Code', monospace;
        font-size: 0.9rem;
    }
</style>
