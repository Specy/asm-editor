<script lang="ts">
    import DocsOperand from '$cmp/documentation/DocsOperand.svelte'
    import { AddressingMode, addressingModeToString } from '$lib/languages/M68K/M68K-documentation'
</script>

<div class="column sub-section">
    <div class="column gap-03">
        <div class="sub-title">Direct</div>
        <div class="sub-description">
            Gets the content in the register directly. (the SP register is an alias of the a7)
        </div>
        <div class="example">d0, a0, sp</div>
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
            Gets the value in memory at the address held by the specified address register.
        </div>
        <div class="example">(a0), (sp)</div>
        <div class="row">
            <DocsOperand
                name={addressingModeToString(AddressingMode.Indirect)}
                content="Indirect"
            />
        </div>
    </div>
    <div class="column gap-03">
        <div class="sub-title">Address-register displacement</div>
        <div class="sub-description">
            Adds an expression known at assembly time to the address register. Parentheses may also
            surround the whole operand, as in <code>(4,a0)</code>.
        </div>
        <div class="example">4(a0), label-base(sp), (8,a1)</div>
        <div class="row">
            <DocsOperand
                name={addressingModeToString(AddressingMode.IndirectWithDisplacement)}
                content="Address-register displacement"
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
        </div>
        <div class="example">(a0)+, -(sp)</div>
        <div class="row gap-03 wrap">
            <DocsOperand
                name={addressingModeToString(AddressingMode.PostIndirect)}
                content="Post increment"
            />
            <DocsOperand
                name={addressingModeToString(AddressingMode.PreIndirect)}
                content="Post increment"
            />
        </div>
    </div>
    <div class="column gap-03">
        <div class="sub-title">Immediate</div>
        <div class="sub-description">
            Represents a numerical value, it can be a number or a label. When the program is
            assembled, the labels will be converted to the address of the label. Immediate values
            can be represented in many bases. (replace &lt;num&gt; with the actual number). Note, a
            string will be represented as a list of bytes.
        </div>
        <div class="example">#1000, #$FF, #@14, #%10010, #'a', #'hey', #label</div>
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
            number. A <code>.w</code> or <code>.l</code> suffix selects the address width; both name the
            same address, and the word form is range checked.
        </div>
        <div class="example">$1000, some_label, some_label.w, some_label.l</div>
        <div class="row gap-03 wrap">
            <DocsOperand
                name={addressingModeToString(AddressingMode.Absolute)}
                content="Effective address"
            />
            <DocsOperand name="<ea>" content="Effective address" />
        </div>
    </div>
    <div class="column gap-03">
        <div class="sub-title">Address-register indexed</div>
        <div class="sub-description">
            Adds an address register, a data or address index register, and an optional 8-bit
            displacement. The index may carry a <code>.w</code> or <code>.l</code> size.
        </div>
        <div class="example">4(a0, d2), (sp, a0), (8,a1,d3.w)</div>
        <div class="row gap-03 wrap">
            <DocsOperand
                name={addressingModeToString(AddressingMode.IndirectIndex)}
                content="Address-register indexed"
            />
        </div>
    </div>
    <div class="column gap-03">
        <div class="sub-title">Program-counter relative</div>
        <div class="sub-description">
            Adds a displacement to the address of the current instruction, optionally with a data or
            address index register. These modes can be read but not written.
        </div>
        <div class="example">label(pc), 4(pc,d0.w), (label,pc,a1)</div>
        <div class="row gap-03 wrap">
            <DocsOperand
                name={addressingModeToString(AddressingMode.PcDisplacement)}
                content="PC displacement"
            />
            <DocsOperand
                name={addressingModeToString(AddressingMode.PcIndex)}
                content="PC displacement with index"
            />
        </div>
    </div>
    <div class="column gap-03">
        <div class="sub-title">Status registers</div>
        <div class="sub-description">
            <code>sr</code> is the 16-bit status register and <code>ccr</code> is its low
            condition-code byte. Only <code>move</code>, <code>andi</code>, <code>ori</code> and
            <code>eori</code> accept these operands.
        </div>
        <div class="example">move.w sr,d0</div>
        <div class="row gap-03 wrap">
            <DocsOperand name="sr" content="Status register" />
            <DocsOperand name="ccr" content="Condition-code register" />
        </div>
    </div>
</div>

<style lang="scss">
    @use './style.scss' as *;
</style>
