import { describe, expect, it, vi } from 'vite-plus/test'
import { readShareStart, shareStartQuery, startSharedProject } from './shareStart.ts'

it.each([
    ['', undefined],
    ['build', 'build'],
    ['build=true', 'build'],
    ['buildAndRun', 'buildAndRun'],
    ['buildAndRun=true', 'buildAndRun'],
    ['build=true&buildAndRun=true', 'buildAndRun'],
    ['build=true&buildAndRun=false', 'build'],
    ['build=false&buildAndRun=false', undefined],
    ['build=no&buildAndRun=no', undefined]
])('reads startup flags from %s', (query, action) => {
    expect(readShareStart(new URLSearchParams(query))).toBe(action)
})

it('writes one enabled startup flag or none', () => {
    expect(shareStartQuery()).toBe('')
    expect(shareStartQuery('build')).toBe('&build=true')
    expect(shareStartQuery('buildAndRun')).toBe('&buildAndRun=true')
})

function fixture() {
    const session = {
        debugSession: false,
        build: vi.fn(async () => {
            session.debugSession = true
        }),
        run: vi.fn(async () => {})
    }
    return { session, controller: new AbortController() }
}

describe('starting a shared project', () => {
    it('leaves ordinary shared projects unbuilt', async () => {
        const { session, controller } = fixture()
        await startSharedProject(session, undefined, controller.signal)
        expect(session.build).not.toHaveBeenCalled()
        expect(session.run).not.toHaveBeenCalled()
    })

    it('builds without running for the build flag', async () => {
        const { session, controller } = fixture()
        await startSharedProject(session, 'build', controller.signal)
        expect(session.build).toHaveBeenCalledOnce()
        expect(session.run).not.toHaveBeenCalled()
    })

    it('waits for a successful Build before running', async () => {
        const { session, controller } = fixture()
        let finish!: () => void
        session.build.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finish = () => {
                        session.debugSession = true
                        resolve()
                    }
                })
        )
        const starting = startSharedProject(session, 'buildAndRun', controller.signal)
        expect(session.run).not.toHaveBeenCalled()
        finish()
        await starting
        expect(session.run).toHaveBeenCalledOnce()
    })

    it('does not run when the Build fails or is cancelled', async () => {
        const { session, controller } = fixture()
        session.build.mockImplementation(async () => {})
        await startSharedProject(session, 'buildAndRun', controller.signal)
        expect(session.run).not.toHaveBeenCalled()
    })

    it('does not start an unmounted Workbench', async () => {
        const { session, controller } = fixture()
        controller.abort()
        await startSharedProject(session, 'buildAndRun', controller.signal)
        expect(session.build).not.toHaveBeenCalled()
    })

    it('does not run if the Workbench is removed during its Build', async () => {
        const { session, controller } = fixture()
        session.build.mockImplementation(async () => {
            session.debugSession = true
            controller.abort()
        })
        await startSharedProject(session, 'buildAndRun', controller.signal)
        expect(session.run).not.toHaveBeenCalled()
    })
})
