/**
 * The chatbot embed's tool registration: what the SDK's protocol is asked, and what happens when
 * the chatbot leaves an ask unanswered.
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import { z } from 'zod'
import { connectToDiscernsChatbot, type RegisteredTool } from '@discerns/sdk'
import AiAgent from './AiAgent.svelte'

const protocol = vi.hoisted(() => ({
    registerTool: vi.fn(async (_tool: RegisteredTool) => ({ success: true })),
    unregisterTool: vi.fn(async (_name: string) => ({ success: true })),
    setAvatarContext: vi.fn(),
    dispose: vi.fn()
}))

vi.mock('@discerns/sdk', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@discerns/sdk')>()),
    connectToDiscernsChatbot: vi.fn(async () => protocol)
}))

const disposers: (() => void)[] = []
afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose()
    vi.clearAllMocks()
    vi.restoreAllMocks()
})

function namedTool(name: string): RegisteredTool {
    return { name, description: name, schema: z.object({}), execute: () => ({}) }
}

async function mountAgent(tools: RegisteredTool[]) {
    const component = mount(AiAgent, { target: document.body, props: { tools } })
    disposers.push(() => unmount(component))
    //the connection resolves, then the tools effect runs on the protocol it set
    await tick()
    flushSync()
    await tick()
}

describe('AiAgent', () => {
    it('registers each tool once the chatbot is connected', async () => {
        await mountAgent([namedTool('view_file'), namedTool('step')])
        expect(protocol.registerTool.mock.calls.map(([tool]) => tool.name)).toEqual([
            'view_file',
            'step'
        ])
    })

    //the SDK rejects an ask the chatbot leaves unanswered for 30 s, which was an unhandled
    //rejection
    it('reports a registration the chatbot never answers', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        protocol.registerTool.mockRejectedValueOnce(
            new Error('Ask "chatbot:register-tool" timed out')
        )
        await mountAgent([namedTool('view_file')])
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(error).toHaveBeenCalledWith(
            'Could not register tool "view_file"',
            expect.objectContaining({ message: 'Ask "chatbot:register-tool" timed out' })
        )
    })

    //a connection that failed was an unhandled rejection too
    it('reports a chatbot it could not connect to, and registers nothing', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.mocked(connectToDiscernsChatbot).mockRejectedValueOnce(new Error('No content window'))
        await mountAgent([namedTool('view_file')])
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(error).toHaveBeenCalledWith(
            'Could not connect to the chatbot',
            expect.objectContaining({ message: 'No content window' })
        )
        expect(protocol.registerTool).not.toHaveBeenCalled()
    })
})
