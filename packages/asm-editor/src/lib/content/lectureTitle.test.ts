import { expect, it } from 'vite-plus/test'
import { withoutLeadingTitle } from './lectureTitle.ts'

it('drops the heading a lecture opens with, and the blank lines after it', () => {
    expect(withoutLeadingTitle('# Data and address registers\n\nThe M68K has…')).toBe(
        'The M68K has…'
    )
})

it('keeps a lecture that opens with text, and every later heading', () => {
    const source = 'Some text.\n\n# A later heading\n\n## A section'
    expect(withoutLeadingTitle(source)).toBe(source)
    expect(withoutLeadingTitle('## A section first\n\nText')).toBe('## A section first\n\nText')
})
