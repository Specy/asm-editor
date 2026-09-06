<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        M68K_COLORS,
        M68K_KEY_CODE_DOCS,
        M68K_KEY_CODE_RULES,
        M68K_REJECTED_TRAP_TASKS,
        M68K_TRAP_DOCS,
        M68K_TRAP_GROUP_DOCS,
        type M68KTrapGroup
    } from '$lib/languages/M68K/M68K-traps'

    interface Props {
        disableLinks?: boolean
    }

    let { disableLinks = false }: Props = $props()

    function tasksOf(group: M68KTrapGroup) {
        return M68K_TRAP_DOCS.filter((task) => task.group === group)
    }

    function rangeOf(group: M68KTrapGroup): string {
        const tasks = tasksOf(group).map((task) => task.task)
        return tasks.length === 0 ? '' : `tasks ${Math.min(...tasks)} to ${Math.max(...tasks)}`
    }

    function toHexByte(code: number): string {
        return `$${code.toString(16).padStart(2, '0').toUpperCase()}`
    }

    // The equates are written the way a program writes them, $00BBGGRR, so the swatch has to put
    // the channels back in the order CSS wants them.
    function swatch(color: number): string {
        return `rgb(${color & 0xff}, ${(color >> 8) & 0xff}, ${(color >> 16) & 0xff})`
    }

    const colors = Object.entries(M68K_COLORS)
</script>

<Column gap="1rem" style="width: 100%;">
    <p class="note">
        The M68K has one system call: <code>trap #15</code>. The task number goes in
        <code>D0.B</code>, its arguments in the other registers, and the answer comes back in the
        registers the task names. The interface is EASy68K's, so a program written for that
        simulator runs here unchanged as far as its I/O goes.
    </p>
    <p class="note">
        Text and graphics share one image, as they do in EASy68K's output window: what a program
        prints is drawn on the screen at the text cursor <em>and</em> appended to the terminal transcript,
        which is what testcases assert on. Click the screen panel to give the program the keyboard; the
        ring around it says the editor's own shortcuts are off while it has focus.
    </p>

    {#each M68K_TRAP_GROUP_DOCS as group (group.group)}
        <section class="group">
            <h2 class="group-title" id={group.group}>
                {group.title}
                <span class="group-range">{rangeOf(group.group)}</span>
            </h2>
            <p class="note">
                <MarkdownRenderer source={group.description} {disableLinks} simpleCode />
            </p>

            {#if group.group === 'graphics'}
                <Card gap="0.8rem" padding="1rem" background="secondary" style="width: 100%;">
                    <h3 class="sub-title">Colors</h3>
                    <p class="note">
                        A color is a long written <code>$00BBGGRR</code>: blue in bits 23-16, green
                        in bits 15-8 and red in bits 7-0. These are EASy68K's own equates, and a
                        program that defines them by name needs no change.
                    </p>
                    <div class="colors">
                        {#each colors as [name, color] (name)}
                            <div class="color">
                                <span class="chip" style:background-color={swatch(color)}></span>
                                <code>${color.toString(16).padStart(8, '0').toUpperCase()}</code>
                                <span class="muted">{name.toLowerCase()}</span>
                            </div>
                        {/each}
                    </div>
                </Card>
            {/if}

            {#if group.group === 'input'}
                <Card gap="0.8rem" padding="1rem" background="secondary" style="width: 100%;">
                    <h3 class="sub-title">Key codes</h3>
                    <ul class="rules">
                        {#each M68K_KEY_CODE_RULES as rule (rule)}
                            <li><MarkdownRenderer source={rule} {disableLinks} simpleCode /></li>
                        {/each}
                    </ul>
                    <div class="keys">
                        {#each M68K_KEY_CODE_DOCS as key (key.name)}
                            <div class="key">
                                <code>{toHexByte(key.code)}</code>
                                <span class="muted">{key.name}</span>
                            </div>
                        {/each}
                    </div>
                </Card>
            {/if}

            {#each tasksOf(group.group) as task (task.task)}
                <Card gap="0.8rem" padding="1rem" background="secondary" style="width: 100%;">
                    <h3 class="sub-title" id={`task-${task.task}`}>
                        {task.task}
                        <span class="task-name">{task.title}</span>
                    </h3>
                    {#if task.input}
                        <div class="row">
                            <span class="tag">in</span>
                            <span class="sub-description">{task.input}</span>
                        </div>
                    {/if}
                    {#if task.output}
                        <div class="row">
                            <span class="tag">out</span>
                            <span class="sub-description">{task.output}</span>
                        </div>
                    {/if}
                    <p class="note">
                        <MarkdownRenderer source={task.description} {disableLinks} simpleCode />
                    </p>
                    {#if task.deviation}
                        <div class="row">
                            <span class="tag warn">note</span>
                            <span class="sub-description">
                                <MarkdownRenderer
                                    source={task.deviation}
                                    {disableLinks}
                                    simpleCode
                                />
                            </span>
                        </div>
                    {/if}
                </Card>
            {/each}
        </section>
    {/each}

    <section class="group">
        <h2 class="group-title" id="unsupported">Tasks that are not supported</h2>
        <p class="note">
            These stop the program with an error naming the task, rather than doing something the
            program did not ask for. Everything they configure is either hardware this editor does
            not have or a decision the editor makes for itself.
        </p>
        <Card gap="0.4rem" padding="1rem" background="secondary" style="width: 100%;">
            {#each M68K_REJECTED_TRAP_TASKS as task (task.task)}
                <div class="row">
                    <span class="tag">{task.task}</span>
                    <span class="sub-description">{task.title} — {task.reason}</span>
                </div>
            {/each}
        </Card>
    </section>

    <section class="group">
        <h2 class="group-title" id="differences">Differences from EASy68K</h2>
        <ul class="rules">
            <li>
                Everything printed also reaches the terminal transcript, which EASy68K does not
                have. It is what keeps testcases and the non-graphical view working.
            </li>
            <li>
                The screen draws text in one fixed 8 by 16 cell font, so task 21 (font properties)
                is not supported and the text screen cannot be read back (task 22) or scrolled (task
                25).
            </li>
            <li>
                Task 92's bitwise drawing modes (0, 1, 3 and 5 to 15) stop the program with an error
                naming the mode. Double buffering, modes 17 and 94, covers the sprite erasing the
                XOR mode is usually used for.
            </li>
            <li>
                Task 8 counts from the start of the run rather than from midnight, and task 23
                completes immediately during a testcase, which runs on a virtual clock.
            </li>
            <li>
                Rectangles and ellipses exclude their right and bottom edges. That is what EASy68K
                does too, because it draws through the Windows GDI, but it surprises people often
                enough to be worth saying twice.
            </li>
        </ul>
    </section>
</Column>

<style lang="scss">
    .note {
        line-height: 1.5;
    }
    code {
        font-family: FiraCode;
        color: var(--accent);
    }
    .group {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
    }
    .group-title {
        font-size: 1.5rem;
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
        flex-wrap: wrap;
    }
    .group-range {
        font-family: FiraCode;
        font-size: 0.9rem;
        opacity: 0.7;
    }
    .sub-title {
        font-family: FiraCode;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
    }
    .task-name {
        font-family: Rubik;
        font-size: 0.9rem;
        opacity: 0.8;
    }
    .row {
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
        line-height: 1.5;
    }
    .tag {
        font-family: FiraCode;
        font-size: 0.8rem;
        padding: 0.1rem 0.4rem;
        border-radius: 0.3rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        flex-shrink: 0;
        min-width: 2.2rem;
        text-align: center;
    }
    .warn {
        background-color: var(--accent);
        color: var(--accent-text);
    }
    .rules {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding-left: 1.2rem;
        line-height: 1.5;
        list-style: disc;
    }
    .colors,
    .keys {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem 1.2rem;
    }
    .color,
    .key {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }
    .chip {
        width: 1rem;
        height: 1rem;
        border-radius: 0.2rem;
        border: 1px solid var(--tertiary);
    }
    .muted {
        font-size: 0.9rem;
        opacity: 0.8;
    }
</style>
