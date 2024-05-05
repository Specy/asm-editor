<script lang="ts">
	import {
		fromSizesToString,
		fromSizeToString,
		getAddressingModeNames,
		instructionsDocumentationList
	} from '$lib/languages/M68K-documentation'

	import DocsOperand from '$cmp/documentation/DocsOperand.svelte'
	import stringSimilarity from 'string-similarity'
	import DocsSection from '$cmp/shared/layout/TogglableSection.svelte'
	import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
	import FaArrowRight from 'svelte-icons/fa/FaArrowRight.svelte'
	import Icon from '$cmp/shared/layout/Icon.svelte'
	export let visible: boolean
	let wrapper: HTMLDivElement
	export let style = ''
	export let searchValue: string
	import { createMarkdownWithOptions } from '$lib/markdown'
	import AddressingModes from './M68KAddressingModes.svelte'
	import M68KConditionCodes from './M68KConditionCodes.svelte'
	import M68KShiftRotations from './M68KShiftDirections.svelte'
	import M68KDirectives from './M68KDirectives.svelte'
	import M68KAssemblerFeatures from './M68KAssemblerFeatures.svelte'
	import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
	export let defaultOpen = false
	export let openLinksInNewTab = true
	export let showRedirect = false
	function includesText(nodes: NodeListOf<Element>, text: string) {
		const texts = Array.from(nodes).map((node) => node.textContent)
		const match = stringSimilarity.findBestMatch(text, texts)
		return nodes[match.bestMatchIndex]
	}
	$: {
		if (visible && wrapper && searchValue) {
			const els = wrapper.querySelectorAll('.sub-title')
			const el = includesText(els, searchValue)
			if (el) {
				el.scrollIntoView({ inline: 'nearest' })
			} else {
				const descr = wrapper.querySelectorAll('.sub-description')
				const el = includesText(descr, searchValue)
				if (el) {
					el.scrollIntoView({ inline: 'nearest' })
				} else {
					const titles = wrapper.querySelectorAll('.section-title')
					const el = includesText(titles, searchValue)
					el.scrollIntoView({ inline: 'nearest' })
				}
			}
		}
	}
</script>

<div class="docs-list" bind:this={wrapper} {style}>
	<DocsSection open={defaultOpen}>
		<h4 slot="title">Addressing modes</h4>
		<AddressingModes />
	</DocsSection>
	<DocsSection>
		<h4 slot="title">
			Instructions
		</h4>
		<div class="column sub-section">
			{#each instructionsDocumentationList as ins}
				<div class="instruction">
					<div class="row align-center">
						<h1 class="sub-title" id={ins.name}>
							{#if showRedirect}
								<a href="#{ins.name}" class="sub-hover" title="click to create quick link">
									{ins.name}
								</a>
							{:else}
								{ins.name}
							{/if}
						</h1>

						{#if ins.sizes.length}
							<span style="font-size: 0.9rem;">
								({fromSizesToString(ins.sizes)}) {ins.defaultSize
									? ` {${fromSizeToString(ins.defaultSize)}}`
									: ''}
							</span>
						{/if}
					</div>
					<div class="row instruction-addressing-modes">
						{#if ins.args.length}
							{#each ins.args as arg, i}
								<DocsOperand name={`Op ${i + 1}`} content={getAddressingModeNames(arg)} />
							{/each}
						{/if}
					</div>
					{#if ins.description}
						<span class="sub-description">
							<MarkdownRenderer
								source={createMarkdownWithOptions(ins.description, {
									linksInNewTab: openLinksInNewTab
								})}
							/>
						</span>
					{/if}
					<div class="row" style="gap: 1rem; justify-content: space-between;">
						{#if ins.example}
							<span class="example">
								Ex| {ins.example}
							</span>
						{/if}
						{#if showRedirect}
							<ButtonLink href="/documentation/m68k/instruction/{ins.name}" cssVar="tertiary">
								Try it
								<Icon style="margin-left: 0.5rem" size={0.8}>
									<FaArrowRight />
								</Icon>
							</ButtonLink>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</DocsSection>
	<DocsSection>
		<h4 slot="title">Condition Codes</h4>
		<M68KConditionCodes />
	</DocsSection>
	<DocsSection>
		<h4 slot="title">Shift/Rotate directions</h4>
		<M68KShiftRotations />
	</DocsSection>
	<DocsSection>
		<h4 slot="title">Directives</h4>
		<M68KDirectives {openLinksInNewTab} />
	</DocsSection>
	<DocsSection>
		<h4 slot="title">Assembler features</h4>
		<M68KAssemblerFeatures />
	</DocsSection>
</div>

<style lang="scss">
	@import './style.scss';
</style>
