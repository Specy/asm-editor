<script lang="ts">
    import '#cmp/content/contentPages.css'

    let { children }: { children: import('svelte').Snippet } = $props()
</script>

<div class="content-pages learn-pages">
    {@render children()}
</div>
