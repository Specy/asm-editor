<script lang="ts">
	import FloatingContainer from './FloatingContainer.svelte'
	import {
		AddressingMode,
		addressingModeToString,
		branchConditions,
		branchConditionsDescriptions,
		directions,
		directionsDescriptions,
		fromSizesToString,
		getAddressingModeNames,
		instructionsDocumentationList
	} from '$lib/languages/M68K-documentation'
	import Input from './inputs/Input.svelte'
	import DocsOperand from './DocsOperand.svelte'
	import DocsSection from './DocsSection.svelte'
	export let visible: boolean
	let wrapper: HTMLDivElement
	let searchValue = ''

	function includesText(nodes: NodeListOf<Element>, text: string) {
		return Array.from(nodes).find((el) => el.innerHTML.toLowerCase().includes(text))
	}
	$: {
		if (visible && wrapper) {
			const els = wrapper.querySelectorAll('.sub-title')
			const el = includesText(els, searchValue.toLowerCase())
			if (el) {
				el.scrollIntoView({ inline: 'nearest' })
			} else {
				const descr = wrapper.querySelectorAll('.sub-description')
				const el = includesText(descr, searchValue.toLowerCase())
				if (el) {
					el.scrollIntoView({ inline: 'nearest' })
				} else {
					const titles = wrapper.querySelectorAll('.section-title')
					const el = includesText(titles, searchValue.toLowerCase())
					el.scrollIntoView({ inline: 'nearest' })
				}
			}
		}
	}
</script>

<FloatingContainer bind:visible title="M68K Documentation" style="width: 40rem">
	<div class="search-bar" slot="header">
		<Input
			bind:value={searchValue}
			placeholder="Search"
			style="padding: 0rem; background-color: var(--tertiary);"
		/>
	</div>
	<div class="docs-list" bind:this={wrapper}>
		<DocsSection name="Addressing modes" open={false}>
			<div class="column sub-section">
				<div class="column gap-03">
					<div class="sub-title">Direct</div>
					<div class="sub-description">
						Gets the content in the register directly. (the SP register is an alias of the a7)
						<br /> Ex: d0, a0, sp
					</div>
					<div class="row gap-03 wrap">
						<DocsOperand
							name={addressingModeToString(AddressingMode.DataRegister)}
							content="Data register"
						/>
						<DocsOperand
							name={addressingModeToString(AddressingMode.AddressRegister)}
							content="Address register"
						/>
					</div>
				</div>
				<div class="column gap-03">
					<div class="sub-title">Indirect</div>
					<div class="sub-description">
						Gets the value contained in memory with address being the content of the address
						register specified. Specifiying an offset by writing a number before the (), the
						addressing mode becomes indirect with displacement and the final address to read the
						memory will be (address + offset).
						<br /> Ex: (a0), 4(sp)
					</div>
					<div class="row">
						<DocsOperand
							name={addressingModeToString(AddressingMode.Indirect)}
							content="Indirect"
						/>
					</div>
				</div>
				<div class="column gap-03">
					<div class="sub-title">Indirect Post/Pre increment</div>
					<div class="sub-description">
						Gets the value contained in memory with address being the content of the address
						register specified. If it's the post increment, the address register will be incremented
						after reading the memory. If it's the pre increment, the address register will be
						incremented before reading the memory. The amount of increment is specified by the size
						of the instruction. In the documentation, wherever there is {addressingModeToString(
							AddressingMode.Indirect
						)}, this addressing mode is valid too
						<br /> Ex: (a0)+, -(sp)
					</div>
					<div class="row gap-03 wrap">
						<DocsOperand
							name={addressingModeToString(AddressingMode.IndirectWithPostincrement)}
							content="Post increment"
						/>
						<DocsOperand
							name={addressingModeToString(AddressingMode.IndirectWithPredecrement)}
							content="Post increment"
						/>
					</div>
				</div>
				<div class="column gap-03">
					<div class="sub-title">Immediate</div>
					<div class="sub-description">
						Represents a numerical value, it can be a number or a label. When the program is
						assembled, the labels will be converted to the address of the label. Immediate values
						can be represented in many bases. (replace {`<num>`} with the actual number)
						<br /> Ex: #1000, #$FF, #@14, #%10010, #'a'
					</div>
					<div class="row gap-03 wrap">
						<DocsOperand
							name={addressingModeToString(AddressingMode.Immediate)}
							content="Immediate"
						/>
						<DocsOperand name="#<num>" content="Decimal" />
						<DocsOperand name="#$<num>" content="Hexadecimal" />
						<DocsOperand name="#@<num>" content="Octal" />
						<DocsOperand name="#%<num>" content="Binary" />
						<DocsOperand name="#'<char>" content="Character" />
					</div>
				</div>
				<div class="column gap-03">
					<div class="sub-title">Effective address</div>
					<div class="sub-description">
						Represents the address of the memory where the data is stored. It can be a label or a
						number. When the program is assembled, the labels will be converted to the address of
						the label.
						<br /> Ex: $1000, some_label
					</div>
					<div class="row gap-03 wrap">
						<DocsOperand
							name={addressingModeToString(AddressingMode.EffectiveAddress)}
							content="Effective address"
						/>
						<DocsOperand name="<label>" content="Label effective address" />
					</div>
				</div>
				<div class="column gap-03">
					<div class="sub-title">Base displacement indirect</div>
					<div class="sub-description">
						Gets the value contained in memory with address being the sum of (address + offset +
						base), where the first register (address) will be the base address, the second register
						(base) and offset being the number before the ().
						<br />
						In the documentation, wherever there is {addressingModeToString(
							AddressingMode.Indirect
						)}, this addressing mode is valid too
						<br /> Ex: 4(a0, d2), (sp, a0)
					</div>
					<div class="row gap-03 wrap">
						<DocsOperand
							name={addressingModeToString(AddressingMode.IndirectWithDisplacement)}
							content="Base displacement indirect"
						/>
					</div>
				</div>
			</div>
		</DocsSection>
		<DocsSection name="Instructions">
			<div class="column sub-section">
				{#each instructionsDocumentationList as ins}
					<div class="instruction">
						<div class="row align-center">
							<div class="sub-title">
								{ins.name}
							</div>
							{#if ins.sizes.length}
								<span style="font-size: 0.9rem;">
									({fromSizesToString(ins.sizes)})
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
							<span class="sub-description">{ins.description}</span>
						{/if}
						{#if ins.example}
							<div>Example</div>
							<span class="instruction-example">
								{ins.example}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</DocsSection>
		<DocsSection name="Condition Codes">
			<div class="cc-grid">
				{#each branchConditions as bc}
					<DocsOperand name={bc} content={branchConditionsDescriptions.get(bc)} />
				{/each}
			</div>
		</DocsSection>
		<DocsSection name="Shift/Rotate directions">
			<div class="cc-grid">
				{#each directions as dr}
					<DocsOperand name={dr} content={directionsDescriptions.get(dr)} />
				{/each}
			</div>
		</DocsSection>
	</div>
</FloatingContainer>

<style>
	.docs-list {
		display: flex;
		padding: 0.8rem;
		flex-direction: column;
		height: 75vh;
		gap: 1.4rem;
		overflow-y: auto;
		font-family: FiraCode;
	}
	.cc-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.search-bar {
		max-width: 15rem;
	}
	.instruction {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.gap-03 {
		gap: 0.3rem;
	}
	.sub-title {
		font-size: 1.3rem;
		margin-right: 0.4rem;
	}

	.instruction-addressing-modes {
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.sub-description {
		padding: 0.6rem 0.8rem;
		background-color: rgba(var(--RGB-secondary), 0.7);
		line-height: 1.4rem;
		border-radius: 0.4rem;
	}
	.sub-section {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
</style>
