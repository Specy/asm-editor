/**
 * The coding agent's tools over the Files of the host that mounts it, through the hooks
 * DefaultCodingAgent gives them: a Project's FileSystem, whose refusals the tools report.
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import type { RegisteredTool } from '@discerns/sdk'
import DefaultCodingAgent from './DefaultCodingAgent.svelte'
import { makeProject, type Project } from '#lib/Project.svelte.ts'

/** The tools the agent gave the chatbot, by name. */
const registered = vi.hoisted(() => new Map<string, RegisteredTool>())

vi.mock('@discerns/sdk', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@discerns/sdk')>()),
    connectToDiscernsChatbot: vi.fn(async () => ({
        registerTool: vi.fn(async (tool: RegisteredTool) => {
            registered.set(tool.name, tool)
            return { success: true }
        }),
        unregisterTool: vi.fn(async () => ({ success: true })),
        setAvatarContext: vi.fn(),
        dispose: vi.fn()
    }))
}))

const disposers: (() => void)[] = []
afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose()
    registered.clear()
})

/** Mounts the agent beside `project`, as the chat page does, and runs its tools by name. */
async function agentOver(project: Project) {
    const component = mount(DefaultCodingAgent, {
        target: document.body,
        props: { project, editorLanguage: project.language, emulatorInstance: null }
    })
    disposers.push(() => unmount(component))
    await tick()
    flushSync()
    await tick()
    return (name: string, args: Record<string, unknown> = {}) => {
        const tool = registered.get(name)
        if (!tool) throw new Error(`No tool ${name}`)
        return tool.execute(args) as Promise<Record<string, unknown>>
    }
}

describe('DefaultCodingAgent', () => {
    it('reports a deletion the FileSystem refused while a Debug session holds the Files', async () => {
        const project = makeProject({ language: 'RISC-V', code: 'li a0, 1' })
        project.fileSystem.writeText('helper.riscv', 'nop')
        const run = await agentOver(project)
        project.fileSystem.beginSession()
        try {
            expect(await run('delete_file', { path: 'helper.riscv' })).toMatchObject({
                success: false,
                error: 'Stop the Debug session before changing Files'
            })
        } finally {
            project.fileSystem.stop()
        }
        expect(Object.keys(project.files)).toContain('helper.riscv')
    })
})
