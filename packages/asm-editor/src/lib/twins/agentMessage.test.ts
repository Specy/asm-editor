import { describe, expect, it } from 'vite-plus/test'
import { AGENT_MESSAGE } from './agentMessage'
import { LLMS_FULL_FILE, LLMS_PATHNAME, twinPathname } from './urls'

describe('AGENT_MESSAGE', () => {
    it('only points at the agents files and at real twins', () => {
        const urls = [
            ...AGENT_MESSAGE.matchAll(/https:\/\/asm-editor\.specy\.app(\/\S*?)(?=[,.]?(\s|$))/g)
        ]
        expect(urls.length).toBeGreaterThan(0)
        for (const [, path] of urls) {
            if (path === LLMS_PATHNAME || path.endsWith(`/${LLMS_FULL_FILE}`)) continue
            expect(twinPathname(path.replace(/\.md$/, '')), path).toBe(path)
        }
    })
})
