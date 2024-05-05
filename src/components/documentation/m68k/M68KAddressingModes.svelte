<script lang="ts">
	import DocsOperand from '$cmp/documentation/DocsOperand.svelte'
	import {
		AddressingMode,
		addressingModeToString,
	} from '$lib/languages/M68K-documentation'
</script>


<div class="column sub-section">
    <div class="column gap-03">
        <div class="sub-title">Direct</div>
        <div class="sub-description">
            Gets the content in the register directly. (the SP register is an alias of the a7)
        </div>
        <div class="example">Ex| d0, a0, sp</div>
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
            Gets the value contained in memory with address being the content of the address register
            specified. Specifiying an offset by writing a number before the (), the addressing mode
            becomes indirect with displacement and the final address to read the memory will be
            (address + offset).
        </div>
        <div class="example">Ex| (a0), 4(sp)</div>
        <div class="row">
            <DocsOperand name={addressingModeToString(AddressingMode.Indirect)} content="Indirect" />
        </div>
    </div>
    <div class="column gap-03">
        <div class="sub-title">Indirect Post/Pre increment</div>
        <div class="sub-description">
            Gets the value contained in memory with address being the content of the address register
            specified. If it's the post increment, the address register will be incremented after
            reading the memory. If it's the pre increment, the address register will be incremented
            before reading the memory. The amount of increment is specified by the size of the
            instruction. In the documentation, wherever there is {addressingModeToString(
                AddressingMode.Indirect
            )}, this addressing mode is valid too
        </div>
        <div class="example">Ex| (a0)+, -(sp)</div>
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
            assembled, the labels will be converted to the address of the label. Immediate values can
            be represented in many bases. (replace {`<num>`} with the actual number). Note, a string will
            be represented as a list of bytes.
        </div>
        <div class="example">Ex| #1000, #$FF, #@14, #%10010, #'a', #'hey', #label</div>
        <div class="row gap-03 wrap">
            <DocsOperand
                name={addressingModeToString(AddressingMode.Immediate)}
                content="Immediate"
            />
            <DocsOperand name="#<num>" content="Decimal" />
            <DocsOperand name="#$<num>" content="Hexadecimal" />
            <DocsOperand name="#@<num>" content="Octal" />
            <DocsOperand name="#%<num>" content="Binary" />
            <DocsOperand name="#'<char/string>" content="Text" />
        </div>
    </div>
    <div class="column gap-03">
        <div class="sub-title">Effective address</div>
        <div class="sub-description">
            Represents the address of the memory where the data is stored. It can be a label or a
            number. When the program is assembled, the labels will be converted to the address of the
            label.
        </div>
        <div class="example">Ex| $1000, some_label, 140, %101010, @22, 'e'</div>
        <div class="row gap-03 wrap">
            <DocsOperand
                name={addressingModeToString(AddressingMode.EffectiveAddress)}
                content="Effective address"
            />
            <DocsOperand name="<ea>" content="Effective address" />
        </div>
    </div>
    <div class="column gap-03">
        <div class="sub-title">Base displacement indirect</div>
        <div class="sub-description">
            Gets the value contained in memory with address being the sum of (address + offset +
            base), where the first register (address) will be the base address, the second register
            (base) and offset being the number before the ().
            <br />
            In the documentation, wherever there is {addressingModeToString(AddressingMode.Indirect)},
            this addressing mode is valid too
        </div>
        <div class="example">Ex| 4(a0, d2), (sp, a0)</div>
        <div class="row gap-03 wrap">
            <DocsOperand
                name={addressingModeToString(AddressingMode.IndirectWithDisplacement)}
                content="Base displacement indirect"
            />
        </div>
    </div>
</div>


<style lang="scss">
	@import './style.scss'	
</style>
