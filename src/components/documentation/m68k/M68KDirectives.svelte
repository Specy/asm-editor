<script lang="ts">
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        M68KDirectiveDocumentationList,
        fromSizesToString
    } from '$lib/languages/M68K-documentation'
    interface Props {
        openLinksInNewTab?: boolean
    }

    let { openLinksInNewTab = true }: Props = $props()
</script>

<div class="column sub-section">
    {#each M68KDirectiveDocumentationList as dir}
        <div class="instruction">
            <div class="row align-center">
                <div class="sub-title">
                    {dir.name}
                </div>
                {#if dir.sizes.length}
                    <span style="font-size: 0.9rem;">
                        ({fromSizesToString(dir.sizes)})
                    </span>
                {/if}
            </div>
            {#if dir.description}
                <span class="sub-description">
                    <MarkdownRenderer source={dir.description} linksInNewTab={openLinksInNewTab} />
                </span>
            {/if}
            {#if dir.example}
                <span class="example">
                    {dir.example}
                </span>
            {/if}
        </div>
    {/each}
</div>

<style lang="scss">
    @use './style.scss' as *;;
</style>
