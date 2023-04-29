<script lang="ts">

	import { M68KDirectiveDocumentationList, fromSizesToString } from "$lib/languages/M68K-documentation"
	import { createMarkdownWithOptions } from "$lib/markdown"
	import SvelteMarkdown from "svelte-markdown"
    export let openLinksInNewTab = true
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
                    <SvelteMarkdown
                        source={createMarkdownWithOptions(dir.description, {
                            linksInNewTab: openLinksInNewTab
                        })}
                    />
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
	@import './style.scss'	
</style>
