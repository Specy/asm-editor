import { describe, expect, it, vi } from 'vite-plus/test'
import { lazyLoad } from './lazyLoad'

describe('lazyLoad', () => {
    it('loads once for every call, while the load lasts and once it has succeeded', async () => {
        let finish!: (value: string) => void
        const load = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)))
        const get = lazyLoad(load)
        const first = get()
        expect(get()).toBe(first)
        finish('module')
        await expect(first).resolves.toBe('module')
        await expect(get()).resolves.toBe('module')
        expect(load).toHaveBeenCalledTimes(1)
    })

    it('loads again after a load that failed', async () => {
        const load = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
            .mockResolvedValue('module')
        const get = lazyLoad(load)
        await expect(get()).rejects.toThrow('Failed to fetch')
        await expect(get()).resolves.toBe('module')
        await expect(get()).resolves.toBe('module')
        expect(load).toHaveBeenCalledTimes(2)
    })
})
