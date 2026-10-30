/**
 * The Call stack's frames: a C++ function by its short name, with its signature and raw name as
 * the tooltip ([cpp-demangling.md](../../../../../../../docs/design/cpp-demangling.md), decision 11).
 */
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import CallStack from './CallStack.svelte'
import type { StackFrame } from '#lib/languages/commonLanguageFeatures.svelte.ts'

let dispose = () => {}
afterEach(() => dispose())

it('gives a frame the tooltip its name shortens, and none to one it does not', () => {
    const frame = (name: string, detail?: string): StackFrame => ({
        name,
        ...(detail ? { detail } : {}),
        address: 0x1000n,
        destination: 0x2000n,
        sp: 0x7000n,
        line: 3,
        color: 'red'
    })
    const target = document.createElement('div')
    document.body.append(target)
    const app = mount(CallStack, {
        target,
        props: {
            stack: [
                frame('main'),
                frame(
                    'std::string::operator+=',
                    'std::string::operator+=(std::string const&)\n_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_'
                )
            ],
            onGoToLabel: vi.fn(),
            onGoToInstruction: vi.fn()
        }
    })
    flushSync()
    dispose = () => {
        void unmount(app)
        target.remove()
    }
    // the innermost frame first
    const names = [...target.querySelectorAll<HTMLButtonElement>('.label-name')]
    expect(names.map((button) => button.textContent?.trim())).toEqual([
        'std::string::operator+=',
        'main'
    ])
    expect(names.map((button) => button.getAttribute('title'))).toEqual([
        'std::string::operator+=(std::string const&)\n_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_',
        null
    ])
})

//an exception frame is named for its vector and its handler, and says where `rte` returns
//([m68k-machine.md](../../../../../../../docs/design/m68k-machine.md), decision 28)
it('names an exception frame by its vector and handler, above the call it interrupted', () => {
    const target = document.createElement('div')
    document.body.append(target)
    const app = mount(CallStack, {
        target,
        props: {
            stack: [
                {
                    name: 'compute',
                    address: 0x1100n,
                    destination: 0x1008n,
                    sp: 0xfffffcn,
                    line: 9,
                    color: 'red'
                },
                {
                    name: 'TRAP #3 → trap3_handler',
                    detail: 'An exception, taken through vector 35 at $00008C: `rte` returns to $1104',
                    address: 0x1200n,
                    destination: 0x1104n,
                    sp: 0xfffff6n,
                    line: 14,
                    color: 'blue'
                }
            ],
            onGoToLabel: vi.fn(),
            onGoToInstruction: vi.fn()
        }
    })
    flushSync()
    dispose = () => {
        void unmount(app)
        target.remove()
    }
    const names = [...target.querySelectorAll<HTMLButtonElement>('.label-name')]
    expect(names.map((button) => button.textContent?.trim())).toEqual([
        'TRAP #3 → trap3_handler',
        'compute'
    ])
    expect(names[0].getAttribute('title')).toContain('vector 35')
    const returns = [...target.querySelectorAll<HTMLButtonElement>('.return-address')]
    expect(returns.map((button) => button.textContent?.trim())).toEqual(['0x1104', '0x1008'])
})
