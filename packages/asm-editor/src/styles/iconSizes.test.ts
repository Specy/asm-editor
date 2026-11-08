import { describe, expect, it } from 'vite-plus/test'
import { token } from './tokens.testing'
import { ICON_STEPS, iconLength } from './iconSizes'

describe('the icon sizes', () => {
    it('are the type scale steps tokens.css declares on :root', () => {
        for (const [step, length] of Object.entries(ICON_STEPS)) {
            expect(token(`--fs-${step}`), step).toBe(length)
        }
    })

    it('draw an em icon at the size of the text round it', () => {
        expect(iconLength('em')).toBe('1em')
        expect(iconLength('small')).toBe('0.85rem')
    })
})
