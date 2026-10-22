/**
 * The names the Call stack, the History and the memory view give an Executable's symbols
 * ([cpp-demangling.md](../../../../../../docs/design/cpp-demangling.md), decisions 11 and 12), with
 * the real demangler module in Node.
 */
import { beforeAll, expect, it } from 'vite-plus/test'
import type { Describe } from './demangledNames'
import { debugName, memoryLabelName } from './debugNames'
import { loadDemangler } from './loadDemangler'

let describe: Describe
beforeAll(async () => {
    describe = (await loadDemangler()).describe
})

it('gives a C++ function its short name, and its signature and raw name for the tooltip', () => {
    expect(debugName('_ZNSolsEi@plt', describe)).toEqual({
        name: 'std::ostream::operator<<@plt',
        detail: 'std::ostream::operator<<(int)@plt\n_ZNSolsEi@plt'
    })
    expect(debugName('_ZN4game6PlayerD0Ev', describe)).toEqual({
        name: 'game::Player::~Player',
        detail: 'game::Player::~Player() [deleting]\n_ZN4game6PlayerD0Ev'
    })
})

it('puts how far into the function a frame is after both names', () => {
    expect(
        debugName(
            '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_',
            describe,
            '+0x1c'
        )
    ).toEqual({
        name: 'std::string::operator+=+0x1c',
        detail: 'std::string::operator+=(std::string const&)\n_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_+0x1c'
    })
})

it('leaves names that are not mangled, or that it cannot read, raw and without a tooltip', () => {
    expect(debugName('main', describe)).toEqual({ name: 'main' })
    expect(debugName('puts@plt', describe, '+0x4')).toEqual({ name: 'puts@plt+0x4' })
    expect(debugName('', describe)).toEqual({ name: '' })
    expect(debugName('_ZTIPKDF64x', describe)).toEqual({ name: '_ZTIPKDF64x' })
    // without the demangler, which did not load
    expect(debugName('_ZNSolsEi@plt', undefined)).toEqual({ name: '_ZNSolsEi@plt' })
})

it('names data labels by their one form, keeping the version the symbol table gives them', () => {
    expect(memoryLabelName('_ZSt4cout@GLIBCXX_3.4', describe)).toBe('std::cout@GLIBCXX_3.4')
    expect(memoryLabelName('_ZTVN4game4BossE', describe)).toBe('vtable for game::Boss')
    expect(memoryLabelName('_ZGVZL8greetingvE4text', describe)).toBe(
        'guard variable for greeting()::text'
    )
    expect(memoryLabelName('completed.0', describe)).toBeUndefined()
    expect(memoryLabelName('_ZSt4cout@GLIBCXX_3.4', undefined)).toBeUndefined()
})

it('gives a name raw when reading it fails, rather than failing the Build or the step', () => {
    expect(memoryLabelName('_ZNSt9__proto__IiE1xE', describe)).toBe('std::__proto__<int>::x')
    expect(debugName('_ZNSt11constructorIiiE1fEv', describe)).toEqual({
        name: 'std::constructor<int, int>::f',
        detail: 'std::constructor<int, int>::f()\n_ZNSt11constructorIiiE1fEv'
    })
    const broken: Describe = () => {
        throw new Error('unreachable')
    }
    expect(debugName('_ZNSolsEi@plt', broken, '+0x4')).toEqual({ name: '_ZNSolsEi@plt+0x4' })
    expect(memoryLabelName('_ZSt4cout@GLIBCXX_3.4', broken)).toBeUndefined()
})
