<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import DocsOperand from '../DocsOperand.svelte'
    import {
        X86_COMMON_SYSCALLS,
        X86_SYSCALLS,
        describeX86Syscall,
        x86SyscallArgs,
        x86SyscallMap
    } from '$lib/languages/X86/X86-documentation'

    interface Props {
        disableLinks?: boolean
    }

    let { disableLinks = false }: Props = $props()

    /** The argument registers, in the order the kernel reads them. */
    const ARGUMENT_REGISTERS = ['rdi', 'rsi', 'rdx', 'r10', 'r8', 'r9']

    const common = X86_COMMON_SYSCALLS.map((name) => x86SyscallMap.get(name)).filter(
        (syscall) => syscall !== undefined
    )
    const rest = X86_SYSCALLS.filter((syscall) => !X86_COMMON_SYSCALLS.includes(syscall.name))
</script>

<Column gap="1rem" style="width: 100%;">
    <p class="note">
        A program here runs as a Linux program, so everything outside its own memory happens through
        <code>syscall</code>. Put the call number in <code>rax</code>, the arguments in
        <code>rdi</code>, <code>rsi</code>, <code>rdx</code>, <code>r10</code>, <code>r8</code> and
        <code>r9</code>, and read the result from <code>rax</code>. A result between -1 and -4095 is
        an error code. <code>rcx</code> and <code>r11</code> do not survive the call.
    </p>

    <h2 class="section-title" id="common">The ones to start with</h2>
    {#each common as syscall (syscall.number)}
        <Card gap="0.8rem" padding="1rem" background="secondary" style="width: 100%;">
            <h3 class="sub-title">
                {syscall.number} - {syscall.name}
                {#if syscall.blocking}
                    <span class="badge" title="This call can wait for the outside world">waits</span
                    >
                {/if}
            </h3>
            <span class="sub-description">
                <MarkdownRenderer source={describeX86Syscall(syscall.name)} {disableLinks} />
            </span>
            {#if x86SyscallArgs(syscall).length}
                <Column gap="0.4rem">
                    {#each x86SyscallArgs(syscall) as argument, index (argument)}
                        <DocsOperand
                            name={ARGUMENT_REGISTERS[index] ?? `arg${index + 1}`}
                            content={argument}
                            style="width: fit-content"
                        />
                    {/each}
                </Column>
            {/if}
        </Card>
    {/each}

    <h2 class="section-title" id="all">Everything this emulator implements</h2>
    <p class="note">
        Those syscalls are what the emulator implements, anything
        missing returns <code>-ENOSYS</code>.
    </p>
    <div class="table-scroll">
        <table>
            <thead>
                <tr>
                    <th>rax</th>
                    <th>Call</th>
                    <th>Arguments</th>
                </tr>
            </thead>
            <tbody>
                {#each rest as syscall (syscall.number)}
                    <tr>
                        <td class="mono numeric">{syscall.number}</td>
                        <td class="mono">{syscall.name}</td>
                        <td>
                            {#each x86SyscallArgs(syscall) as argument, index (argument + index)}
                                <span class="argument">
                                    <span class="register">{ARGUMENT_REGISTERS[index]}</span>
                                    {argument}
                                </span>
                            {/each}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</Column>

<style lang="scss">
    @use '../m68k/style.scss' as *;
    .note {
        line-height: 1.5;
        max-width: 60rem;
    }
    code {
        font-family: FiraCode;
        color: var(--accent);
    }
    .badge {
        display: inline-block;
        margin-left: 0.4rem;
        padding: 0 0.35rem;
        border-radius: 0.3rem;
        font-size: 0.7rem;
        font-family: Rubik;
        background-color: var(--accent2);
        color: var(--accent2-text);
    }
    .table-scroll {
        width: 100%;
        overflow-x: auto;
    }
    table {
        border-collapse: collapse;
        width: 100%;
        border: solid 0.1rem var(--tertiary);
        border-radius: 0.5rem;
        overflow: hidden;
        font-size: 0.9rem;
    }
    thead {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        text-align: left;
    }
    th {
        padding: 0.5rem;
    }
    td {
        padding: 0.4rem 0.5rem;
        border-top: 0.1rem solid var(--tertiary);
        vertical-align: top;
    }
    tbody {
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    tbody tr:nth-child(odd) {
        background-color: color-mix(in srgb, var(--secondary), var(--tertiary) 20%);
    }
    .mono {
        font-family: FiraCode;
        white-space: nowrap;
    }
    .numeric {
        text-align: right;
    }
    .argument {
        display: inline-block;
        margin-right: 0.6rem;
        font-size: 0.85rem;
    }
    .register {
        font-family: FiraCode;
        color: var(--accent);
    }
</style>
