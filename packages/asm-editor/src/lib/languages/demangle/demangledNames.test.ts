/**
 * The forms of C++ names ([cpp-demangling.md](../../../../../../docs/design/cpp-demangling.md),
 * decisions 3 to 8), with the real demangler module in Node, on names from the document's
 * FactCheck-like program, the x86 Core's `libstdc++.so.6` and its `cpp` fixture.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import {
    CLOSE,
    demangledName,
    listForms,
    OPEN,
    pseudocodeText,
    SEPARATOR,
    shortenTemplates,
    splitLabel,
    splitScope,
    unmark,
    type DemangledName,
    type Describe
} from './demangledNames'
import { loadDemangler, LONGEST_MANGLED_NAME, needsDemangler } from './loadDemangler'

let read: Describe
beforeAll(async () => {
    read = (await loadDemangler()).describe
})

const forms = (label: string) => demangledName(label, read)
const formsOf = (label: string): DemangledName => {
    const name = forms(label)
    if (!name) throw new Error(`${label} does not demangle`)
    return name
}
/** A text with `<`, `>` and `, ` as the module marks them; for texts without operator names. */
const marked = (text: string) =>
    text.replaceAll('<', OPEN).replaceAll('>', CLOSE).replaceAll(', ', SEPARATOR)
const shortened = (text: string) => unmark(shortenTemplates(marked(text)))

const STRING = 'NSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEE'

describe('the demangler module', () => {
    it("reads a name's parts, with template argument lists marked apart from operator names", () => {
        // `std::operator<` with template arguments prints as `operator<<char, …>`.
        const description = read(
            '_ZStltIcSt11char_traitsIcESaIcEEbRKNSt7__cxx1112basic_stringIT_T0_T1_EESA_'
        )!
        expect(description.kind).toBe('function')
        expect(description.text).toBe(
            'bool std::operator<<char, std::char_traits<char>, std::allocator<char>>(std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>> const&, std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>> const&)'
        )
        expect(description.name).toBe(
            `std::operator<${OPEN}char${SEPARATOR}std::char_traits${OPEN}char${CLOSE}${SEPARATOR}std::allocator${OPEN}char${CLOSE}${CLOSE}`
        )
        expect(unmark(description.returns)).toBe('bool')
        expect(
            formsOf('_ZStltIcSt11char_traitsIcESaIcEEbRKNSt7__cxx1112basic_stringIT_T0_T1_EESA_')
                .signature
        ).toBe(
            'std::operator<<char, std::char_traits<char>, std::allocator<char>>(std::string const&, std::string const&)'
        )
    })

    it('gives the qualifiers, the variant and the clone suffix apart', () => {
        expect(read('_ZNKSt3_V214error_category10_M_messageB5cxx11Ei')).toEqual({
            kind: 'function',
            text: 'std::_V2::error_category::_M_message[abi:cxx11](int) const',
            special: '',
            name: 'std::_V2::error_category::_M_message',
            parameters: '(int)',
            returns: '',
            qualifiers: ' const',
            variant: '',
            clone: ''
        })
        expect(read('_ZN4game4BossD0Ev.cold')).toMatchObject({ variant: 'D0', clone: '.cold' })
        expect(read('_ZThn16_N4game4BossD1Ev')).toMatchObject({
            kind: 'function',
            special: 'non-virtual thunk to ',
            name: 'game::Boss::~Boss',
            variant: 'D1'
        })
        expect(read('_ZTVN4game4BossE')).toMatchObject({
            kind: 'data',
            special: 'vtable for ',
            name: 'game::Boss'
        })
    })

    it('tells inheriting constructors, which the tree forgets, from the others', () => {
        expect(read(`_ZN4game4BossCI1NS_6PlayerEE${STRING}`)?.variant).toBe('CI1')
        expect(read(`_ZN4game4BossCI2NS_6PlayerEE${STRING}`)?.variant).toBe('CI2')
        expect(read(`_ZN4game6PlayerC1E${STRING}`)?.variant).toBe('C1')
    })

    it('spells an expanded std::string substitution as its template, so it shortens', () => {
        expect(read('_ZNSsC1ERKSs')?.text).toBe(
            'std::basic_string<char, std::char_traits<char>, std::allocator<char>>::basic_string(std::string const&)'
        )
        expect(formsOf('_ZNSsC1ERKSs').signature).toBe(
            'std::string::basic_string(std::string const&)'
        )
    })

    it('reads only _Z names, as a type would read otherwise', () => {
        expect(read('i')).toBeUndefined()
        expect(read('main')).toBeUndefined()
        expect(read('_ZNSaIcEC1Ev@plt')).toBeUndefined()
    })

    // A name nested deeper than the module's stack: `loadDemangler.test.ts`.
    it('leaves very long names', () => {
        expect(read(`_Z1f${'P'.repeat(LONGEST_MANGLED_NAME)}i`)).toBeUndefined()
        expect(read('_ZNSaIcEC1Ev')?.text).toBe('std::allocator<char>::allocator()')
    })
})

describe("the names of the document's table", () => {
    it.each([
        [
            '_ZNSaIcEC1Ev@plt',
            'std::allocator<char>::allocator@plt',
            'std::allocator<char>::allocator()@plt',
            'std::allocator<char>::allocator()'
        ],
        [
            '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_',
            'std::string::operator+=',
            'std::string::operator+=(std::string const&)',
            'std::string::operator+=(std::string const&)'
        ],
        [
            '_ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE9push_backERKS5_',
            'std::vector<std::string>::push_back',
            'std::vector<std::string>::push_back(std::string const&)',
            'std::vector<std::string>::push_back(std::string const&)'
        ],
        [
            '_ZNSt3mapINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEiSt4lessIS5_ESaISt4pairIKS5_iEEEixERS9_',
            'std::map<std::string, int>::operator[]',
            'std::map<std::string, int>::operator[](std::string const&)',
            'std::map<std::string, int>::operator[](std::string const&)'
        ],
        [
            '_ZNSolsEi@plt',
            'std::ostream::operator<<@plt',
            'std::ostream::operator<<(int)@plt',
            'std::ostream::operator<<(int)'
        ],
        [
            '_ZStlsIcSt11char_traitsIcESaIcEERSt13basic_ostreamIT_T0_ES7_RKNSt7__cxx1112basic_stringIS4_S5_T1_EE@plt',
            'std::operator<<<char, std::char_traits<char>, std::allocator<char>>@plt',
            'std::operator<<<char, std::char_traits<char>, std::allocator<char>>(std::ostream&, std::string const&)@plt',
            // 101 characters in whole: decision 9's limit.
            'std::operator<<<char, std::char_traits<char>, std::allocator<char>>(…)'
        ],
        [
            '_Znwm@plt',
            'operator new@plt',
            'operator new(unsigned long)@plt',
            'operator new(unsigned long)'
        ],
        [
            '_ZNSs4_Rep10_M_destroyERKSaIcE@GLIBCXX_3.4',
            'std::string::_Rep::_M_destroy@GLIBCXX_3.4',
            'std::string::_Rep::_M_destroy(std::allocator<char> const&)@GLIBCXX_3.4',
            'std::string::_Rep::_M_destroy(std::allocator<char> const&)'
        ],
        [
            '_ZSt4endlIcSt11char_traitsIcEERSt13basic_ostreamIT_T0_ES6_.isra.0.cold',
            'std::endl<char, std::char_traits<char>> [clone .isra.0.cold]',
            'std::endl<char, std::char_traits<char>>(std::ostream&) [clone .isra.0.cold]',
            'std::endl<char, std::char_traits<char>>(std::ostream&) [clone .isra.0.cold]'
        ],
        [
            '_ZN4game6PlayerD0Ev',
            'game::Player::~Player',
            'game::Player::~Player() [deleting]',
            'game::Player::~Player() [deleting]'
        ],
        [
            `_ZN4game6PlayerC1E${STRING}`,
            'game::Player::Player',
            'game::Player::Player(std::string)',
            'game::Player::Player(std::string)'
        ],
        [
            '_ZZ4mainENKUliE_clEi',
            "main::'lambda'(int)::operator()",
            "main::'lambda'(int)::operator()(int) const",
            "main::'lambda'(int)::operator()(int) const"
        ],
        [
            '_ZNKSt3_V214error_category10_M_messageB5cxx11Ei',
            'std::_V2::error_category::_M_message',
            'std::_V2::error_category::_M_message(int) const',
            'std::_V2::error_category::_M_message(int) const'
        ],
        ['_ZZL8greetingvE4text', 'greeting()::text', 'greeting()::text', 'greeting()::text'],
        [
            '_ZGVZL8greetingvE4text',
            'guard variable for greeting()::text',
            'guard variable for greeting()::text',
            'guard variable for greeting()::text'
        ],
        [
            '_ZTVN4game4BossE',
            'vtable for game::Boss',
            'vtable for game::Boss',
            'vtable for game::Boss'
        ],
        [
            '_ZTIN4game4BossE',
            'typeinfo for game::Boss',
            'typeinfo for game::Boss',
            'typeinfo for game::Boss'
        ],
        [
            '_ZTSN4game4BossE',
            'typeinfo name for game::Boss',
            'typeinfo name for game::Boss',
            'typeinfo name for game::Boss'
        ],
        [
            '_ZThn16_N4game4BossD1Ev',
            'non-virtual thunk to game::Boss::~Boss',
            'non-virtual thunk to game::Boss::~Boss()',
            'non-virtual thunk to game::Boss::~Boss()'
        ],
        [
            '_ZGTtNSt11range_errorD1Ev@plt_resolver',
            'transaction clone for std::range_error::~range_error@plt_resolver',
            'transaction clone for std::range_error::~range_error()@plt_resolver',
            'transaction clone for std::range_error::~range_error()'
        ],
        [
            '_ZTISt13runtime_error@GLIBCXX_3.4',
            'typeinfo for std::runtime_error@GLIBCXX_3.4',
            'typeinfo for std::runtime_error@GLIBCXX_3.4',
            'typeinfo for std::runtime_error'
        ],
        ['_ZSt4cout@GLIBCXX_3.4', 'std::cout@GLIBCXX_3.4', 'std::cout@GLIBCXX_3.4', 'std::cout'],
        [
            '_ZN4game7clampToIiEET_S1_S1_S1_',
            'game::clampTo<int>',
            'game::clampTo<int>(int, int, int)',
            'game::clampTo<int>(int, int, int)'
        ],
        [
            '_ZN4core3fmt5write17h1b2c3d4e5f607182E',
            'core::fmt::write::h1b2c3d4e5f607182',
            'core::fmt::write::h1b2c3d4e5f607182',
            'core::fmt::write::h1b2c3d4e5f607182'
        ]
    ])('%s', (label, short, signature, comment) => {
        const name = formsOf(label)
        expect({ short: name.short, signature: name.signature, comment: name.comment }).toEqual({
            short,
            signature,
            comment
        })
        expect(name.list).toBe(short)
    })

    it('keeps the demangler’s exact text, without the Listing’s suffix', () => {
        expect(formsOf('_ZNSaIcEC1Ev@plt').text).toBe('std::allocator<char>::allocator()')
        expect(
            formsOf(
                '_ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE9push_backERKS5_'
            ).text
        ).toBe(
            'std::vector<std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>>, std::allocator<std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>>>>::push_back(std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>> const&)'
        )
        expect(
            formsOf('_ZSt4endlIcSt11char_traitsIcEERSt13basic_ostreamIT_T0_ES6_.isra.0.cold').text
        ).toBe(
            'std::basic_ostream<char, std::char_traits<char>>& std::endl<char, std::char_traits<char>>(std::basic_ostream<char, std::char_traits<char>>&) (.isra.0.cold)'
        )
        expect(formsOf('_ZGTtNSt11range_errorD1Ev@plt_resolver').text).toBe(
            'transaction clone for std::range_error::~range_error()'
        )
    })

    it('says what a name is and what special name it has', () => {
        expect(formsOf('_ZNSolsEi@plt')).toMatchObject({
            kind: 'function',
            mangled: '_ZNSolsEi',
            suffix: '@plt'
        })
        expect(formsOf('_ZNSolsEi@plt').special).toBeUndefined()
        expect(formsOf('_ZTVN4game4BossE')).toMatchObject({ kind: 'data', special: 'vtable for' })
        expect(formsOf('_ZThn16_N4game4BossD1Ev')).toMatchObject({
            kind: 'function',
            special: 'non-virtual thunk to'
        })
        expect(formsOf('_ZTWN4game1xE')).toMatchObject({
            kind: 'function',
            special: 'thread-local wrapper routine for',
            short: 'thread-local wrapper routine for game::x'
        })
        expect(formsOf('_ZSt4cout@GLIBCXX_3.4').kind).toBe('data')
    })
})

describe('splitLabel', () => {
    it.each([
        ['_ZNSolsEi@plt', '_ZNSolsEi', '@plt'],
        ['_ZNSolsEi@plt_resolver', '_ZNSolsEi', '@plt_resolver'],
        ['_ZNSolsEi@got', '_ZNSolsEi', '@got'],
        ['_ZNSolsEi@plt_2', '_ZNSolsEi', '@plt_2'],
        ['_ZSt4cout@GLIBCXX_3.4', '_ZSt4cout', '@GLIBCXX_3.4'],
        ['_ZSt4cout@@GLIBCXX_3.4', '_ZSt4cout', '@@GLIBCXX_3.4'],
        [
            '_ZNSt8__detail15_List_node_base7_M_hookEPS0_@GLIBCXX_3.4.15',
            '_ZNSt8__detail15_List_node_base7_M_hookEPS0_',
            '@GLIBCXX_3.4.15'
        ],
        // The Listing's numbering of a duplicate, which the demangler cannot read.
        ['_Z3sumRKSt6vectorIiSaIiEE_2', '_Z3sumRKSt6vectorIiSaIiEE', '_2'],
        ['_Z3foo_12', '_Z3foo', '_12'],
        // After a clone suffix the demangler would read it as part of the clone.
        ['_ZN4game4BossD0Ev.cold_2', '_ZN4game4BossD0Ev.cold', '_2'],
        // A local name's discriminator is the name's own.
        ['_ZZ4mainE1x_0', '_ZZ4mainE1x_0', ''],
        ['_ZNSolsEi', '_ZNSolsEi', ''],
        ['main', 'main', ''],
        ['memcpy_2', 'memcpy_2', '']
    ])('%s', (label, mangled, suffix) => {
        expect(splitLabel(label, read)).toEqual({ mangled, suffix })
    })

    it('puts the suffix back after each form, and the numbering too', () => {
        expect(formsOf('_Z3sumRKSt6vectorIiSaIiEE_2')).toMatchObject({
            short: 'sum_2',
            signature: 'sum(std::vector<int> const&)_2',
            comment: 'sum(std::vector<int> const&)'
        })
        expect(formsOf('_ZN4game4BossD0Ev.cold_2')).toMatchObject({
            short: 'game::Boss::~Boss [clone .cold]_2',
            signature: 'game::Boss::~Boss() [clone .cold]_2 [deleting]',
            comment: 'game::Boss::~Boss() [clone .cold] [deleting]'
        })
        expect(formsOf('_ZSt4cout@@GLIBCXX_3.4').short).toBe('std::cout@@GLIBCXX_3.4')
    })

    it('takes the numbering the Listing says it added, which a local name reads with too', () => {
        // The demangler reads the `_2` as a discriminator, so the guess keeps it in the name.
        expect(splitLabel('_ZZL8greetingvE4text_2', read)).toEqual({
            mangled: '_ZZL8greetingvE4text_2',
            suffix: ''
        })
        expect(splitLabel('_ZZL8greetingvE4text_2', read, '_2')).toEqual({
            mangled: '_ZZL8greetingvE4text',
            suffix: '_2'
        })
        expect(splitLabel('_ZZ4mainE1x_0', read, '')).toEqual({
            mangled: '_ZZ4mainE1x_0',
            suffix: ''
        })
        expect(splitLabel('_ZNSolsEi@plt_2', read, '_2')).toEqual({
            mangled: '_ZNSolsEi',
            suffix: '@plt_2'
        })
        expect(splitLabel('_Z3sumRKSt6vectorIiSaIiEE_2', read, '')).toEqual({
            mangled: '_Z3sumRKSt6vectorIiSaIiEE_2',
            suffix: ''
        })
        expect(demangledName('_ZZL8greetingvE4text', read, '')).toMatchObject({
            short: 'greeting()::text',
            pseudocode: { name: 'text', symbol: '_ZZL8greetingvE4text' }
        })
        expect(demangledName('_ZZL8greetingvE4text_2', read, '_2')).toMatchObject({
            short: 'greeting()::text_2',
            comment: 'greeting()::text',
            pseudocode: { name: 'text', symbol: '_ZZL8greetingvE4text' }
        })
    })
})

describe('shortening', () => {
    it.each([
        // Strings, string views and streams of each character type.
        [`_Z3useI${STRING}EiRT_`, 'use<std::string>(std::string&)'],
        [
            '_Z3useINSt7__cxx1112basic_stringIwSt11char_traitsIwESaIwEEEEiRT_',
            'use<std::wstring>(std::wstring&)'
        ],
        [
            '_Z3useINSt7__cxx1112basic_stringIDuSt11char_traitsIDuESaIDuEEEEiRT_',
            'use<std::u8string>(std::u8string&)'
        ],
        [
            '_Z3useINSt7__cxx1112basic_stringIDiSt11char_traitsIDiESaIDiEEEEiRT_',
            'use<std::u32string>(std::u32string&)'
        ],
        [
            '_Z3useISt17basic_string_viewIcSt11char_traitsIcEEEiRT_',
            'use<std::string_view>(std::string_view&)'
        ],
        [
            '_Z3useISt17basic_string_viewIwSt11char_traitsIwEEEiRT_',
            'use<std::wstring_view>(std::wstring_view&)'
        ],
        ['_Z3useISt13basic_fstreamIcSt11char_traitsIcEEEiRT_', 'use<std::fstream>(std::fstream&)'],
        [
            '_Z3useISt14basic_ofstreamIwSt11char_traitsIwEEEiRT_',
            'use<std::wofstream>(std::wofstream&)'
        ],
        [
            '_Z3useISt13basic_filebufIwSt11char_traitsIwEEEiRT_',
            'use<std::wfilebuf>(std::wfilebuf&)'
        ],
        [
            '_Z3useINSt7__cxx1119basic_istringstreamIcSt11char_traitsIcESaIcEEEEiRT_',
            'use<std::istringstream>(std::istringstream&)'
        ],
        [
            '_Z3useINSt7__cxx1118basic_stringstreamIwSt11char_traitsIwESaIwEEEEiRT_',
            'use<std::wstringstream>(std::wstringstream&)'
        ],
        [
            '_Z3useINSt7__cxx1115basic_stringbufIcSt11char_traitsIcESaIcEEEEiRT_',
            'use<std::stringbuf>(std::stringbuf&)'
        ],
        // Containers', unique_ptr's and the adaptors' default arguments.
        ['_Z3useISt6vectorIiSaIiEEEiRT_', 'use<std::vector<int>>(std::vector<int>&)'],
        ['_Z3useISt5dequeIiSaIiEEEiRT_', 'use<std::deque<int>>(std::deque<int>&)'],
        ['_Z3useINSt7__cxx114listIlSaIlEEEEiRT_', 'use<std::list<long>>(std::list<long>&)'],
        [
            '_Z3useISt12forward_listIcSaIcEEEiRT_',
            'use<std::forward_list<char>>(std::forward_list<char>&)'
        ],
        [
            '_Z3useISt3setINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESt4lessIS6_ESaIS6_EEEiRT_',
            'use<std::set<std::string>>(std::set<std::string>&)'
        ],
        [
            '_Z3useISt8multisetIiSt4lessIiESaIiEEEiRT_',
            'use<std::multiset<int>>(std::multiset<int>&)'
        ],
        [
            '_Z3useISt3mapINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESt6vectorIiSaIiEESt4lessIS6_ESaISt4pairIKS6_S9_EEEEiRT_',
            'use<std::map<std::string, std::vector<int>>>(std::map<std::string, std::vector<int>>&)'
        ],
        [
            '_Z3useISt8multimapIiiSt4lessIiESaISt4pairIKiiEEEEiRT_',
            'use<std::multimap<int, int>>(std::multimap<int, int>&)'
        ],
        [
            '_Z3useISt13unordered_setIiSt4hashIiESt8equal_toIiESaIiEEEiRT_',
            'use<std::unordered_set<int>>(std::unordered_set<int>&)'
        ],
        [
            '_Z3useISt13unordered_mapINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEiSt4hashIS6_ESt8equal_toIS6_ESaISt4pairIKS6_iEEEEiRT_',
            'use<std::unordered_map<std::string, int>>(std::unordered_map<std::string, int>&)'
        ],
        [
            '_Z3useISt18unordered_multimapIilSt4hashIiESt8equal_toIiESaISt4pairIKilEEEEiRT_',
            'use<std::unordered_multimap<int, long>>(std::unordered_multimap<int, long>&)'
        ],
        [
            '_Z3useISt10unique_ptrIiSt14default_deleteIiEEEiRT_',
            'use<std::unique_ptr<int>>(std::unique_ptr<int>&)'
        ],
        [
            '_Z3useISt10unique_ptrIA_iSt14default_deleteIS1_EEEiRT_',
            'use<std::unique_ptr<int []>>(std::unique_ptr<int []>&)'
        ],
        ['_Z3useISt5stackIiSt5dequeIiSaIiEEEEiRT_', 'use<std::stack<int>>(std::stack<int>&)'],
        [
            '_Z3useISt5queueINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESt5dequeIS6_SaIS6_EEEEiRT_',
            'use<std::queue<std::string>>(std::queue<std::string>&)'
        ],
        [
            '_Z3useISt14priority_queueIlSt6vectorIlSaIlEESt4lessIlEEEiRT_',
            'use<std::priority_queue<long>>(std::priority_queue<long>&)'
        ],
        // An argument that is not the default stops the dropping.
        ['_Z3useISt3setIi4LessSaIiEEEiRT_', 'use<std::set<int, Less>>(std::set<int, Less>&)'],
        [
            '_Z3useISt3mapIii4LessSaISt4pairIKiiEEEEiRT_',
            'use<std::map<int, int, Less>>(std::map<int, int, Less>&)'
        ],
        [
            '_Z3useISt5stackIiSt6vectorIiSaIiEEEEiRT_',
            'use<std::stack<int, std::vector<int>>>(std::stack<int, std::vector<int>>&)'
        ],
        [
            '_Z3useISt14priority_queueIiSt6vectorIiSaIiEESt7greaterIiEEEiRT_',
            'use<std::priority_queue<int, std::vector<int>, std::greater<int>>>(std::priority_queue<int, std::vector<int>, std::greater<int>>&)'
        ]
    ])('%s', (label, signature) => {
        expect(formsOf(label).signature).toBe(signature)
    })

    it('leaves other templates and namespaces as the demangler wrote them', () => {
        expect(
            shortened('__gnu_cxx::__normal_iterator<int*, std::vector<int, std::allocator<int>>>')
        ).toBe('__gnu_cxx::__normal_iterator<int*, std::vector<int>>')
        expect(shortened('std::__new_allocator<char>')).toBe('std::__new_allocator<char>')
        expect(
            shortened(
                'std::_Rb_tree<int, std::pair<int const, int>, std::_Select1st<std::pair<int const, int>>, std::less<int>, std::allocator<std::pair<int const, int>>>'
            )
        ).toBe(
            'std::_Rb_tree<int, std::pair<int const, int>, std::_Select1st<std::pair<int const, int>>, std::less<int>, std::allocator<std::pair<int const, int>>>'
        )
        // A template named like a standard one, but in another namespace or a class, stays.
        expect(shortened('game::vector<int, std::allocator<int>>')).toBe(
            'game::vector<int, std::allocator<int>>'
        )
        expect(shortened('std::vector<int>::rebind<int, std::allocator<int>>')).toBe(
            'std::vector<int>::rebind<int, std::allocator<int>>'
        )
        // `__cxx11` stays in names that are not template-ids.
        expect(formsOf('_ZNSt7__cxx119to_stringEi').short).toBe('std::__cxx11::to_string')
    })

    it('finds nothing under the names every object has', () => {
        // `__proto__` threw, `constructor` dropped an argument as its default, and a string of
        // `constructor`s read `std::function Object() { [native code] }string`.
        expect(formsOf('_ZNSt9__proto__IiE1xE').short).toBe('std::__proto__<int>::x')
        expect(formsOf('_ZNSt11constructorIiiE1fEv').signature).toBe(
            'std::constructor<int, int>::f()'
        )
        expect(
            formsOf('_ZN2ns1fESt12basic_stringI11constructorSt11char_traitsIS1_ESaIS1_EE').signature
        ).toBe(
            'ns::f(std::basic_string<constructor, std::char_traits<constructor>, std::allocator<constructor>>)'
        )
    })

    it('drops __cxx11 and libc++’s __1 from template-ids directly in std', () => {
        expect(shortened('std::__cxx11::messages<char>')).toBe('std::messages<char>')
        expect(
            shortened(
                'std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char>>'
            )
        ).toBe('std::string')
        expect(shortened('std::__1::vector<int, std::__1::allocator<int>>')).toBe(
            'std::vector<int>'
        )
    })

    it('reads libstdc++’s two string ABIs alike, as the owner accepted', () => {
        expect(formsOf('_ZNKSs4sizeEv').signature).toBe('std::string::size() const')
        expect(
            formsOf('_ZNKSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE4sizeEv').signature
        ).toBe('std::string::size() const')
    })
})

describe('variants', () => {
    it('marks a deleting destructor wherever its signature shows, and names every variant', () => {
        expect(formsOf('_ZN4game4BossD0Ev')).toMatchObject({
            short: 'game::Boss::~Boss',
            signature: 'game::Boss::~Boss() [deleting]',
            comment: 'game::Boss::~Boss() [deleting]',
            variant: 'deleting'
        })
        expect(formsOf('_ZN4game4BossD1Ev')).toMatchObject({
            signature: 'game::Boss::~Boss()',
            variant: 'complete'
        })
        expect(formsOf('_ZN4game4BossD2Ev')).toMatchObject({
            signature: 'game::Boss::~Boss()',
            variant: 'base'
        })
        expect(formsOf('_ZThn16_N4game4BossD0Ev').comment).toBe(
            'non-virtual thunk to game::Boss::~Boss() [deleting]'
        )
        expect(formsOf('_ZN4game4BossD0Ev@plt').signature).toBe(
            'game::Boss::~Boss()@plt [deleting]'
        )
    })

    it('marks allocating and inheriting constructors', () => {
        expect(formsOf('_ZN1AC3Ev')).toMatchObject({
            signature: 'A::A() [allocating]',
            variant: 'allocating'
        })
        expect(formsOf(`_ZN4game4BossCI1NS_6PlayerEE${STRING}`)).toMatchObject({
            short: 'game::Boss::Boss',
            signature: 'game::Boss::Boss(std::string) [inheriting]',
            variant: 'complete inheriting'
        })
        expect(formsOf(`_ZN4game4BossCI2NS_6PlayerEE${STRING}`).variant).toBe('base inheriting')
    })
})

describe('the Pseudocode’s names', () => {
    it.each([
        [
            '_ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE9push_backERKS5_',
            ['std', 'vector<std::string>'],
            'push_back'
        ],
        ['_ZNSolsEi@plt', ['std', 'ostream'], 'operator<<'],
        [
            '_ZStlsIcSt11char_traitsIcESaIcEERSt13basic_ostreamIT_T0_ES7_RKNSt7__cxx1112basic_stringIS4_S5_T1_EE@plt',
            ['std'],
            'operator<<<char, std::char_traits<char>, std::allocator<char>>'
        ],
        [
            '_ZStltIcSt11char_traitsIcESaIcEEbRKNSt7__cxx1112basic_stringIT_T0_T1_EESA_',
            ['std'],
            'operator<<char, std::char_traits<char>, std::allocator<char>>'
        ],
        ['_ZZ4mainENKUliE_clEi', ['main', "'lambda'(int)"], 'operator()'],
        ['_ZN12_GLOBAL__N_1L6hiddenEi', ['(anonymous namespace)'], 'hidden'],
        ['_ZN3FoocvSsEv', ['Foo'], 'operator std::string'],
        ['_Znwm@plt', [], 'operator new'],
        ['_ZZL8greetingvE4text', ['greeting()'], 'text'],
        [
            '_ZSt4endlIcSt11char_traitsIcEERSt13basic_ostreamIT_T0_ES6_.isra.0.cold',
            ['std'],
            'endl<char, std::char_traits<char>> [clone .isra.0.cold]'
        ],
        // Special data read as identifiers, filed under what they are for.
        ['_ZTVN4game4BossE', ['game', 'Boss'], 'vtable'],
        ['_ZTTN4game4BossE', ['game', 'Boss'], 'VTT'],
        ['_ZTIN4game4BossE', ['game', 'Boss'], 'typeinfo'],
        ['_ZTSN4game4BossE', ['game', 'Boss'], 'typeinfo_name'],
        ['_ZTISt13runtime_error@GLIBCXX_3.4', ['std', 'runtime_error'], 'typeinfo'],
        ['_ZGVZL8greetingvE4text', ['greeting()', 'text'], 'guard'],
        ['_ZTCN4game4BossE0_NS_4BaseE', ['game', 'Boss'], 'construction_vtable'],
        // Special functions take the name of what they stand for.
        ['_ZThn16_N4game4BossD1Ev', ['game', 'Boss'], '~Boss'],
        ['_ZTWN4game1xE', ['game'], 'x'],
        ['_ZGTtNSt11range_errorD1Ev@plt_resolver', ['std', 'range_error'], '~range_error'],
        // A special name with no identifier spelling stays as given.
        ['_ZTAXtl3FooLi1EEE', [], 'template parameter object for Foo{1}']
    ])('%s', (label, namespace, name) => {
        const { pseudocode, mangled } = formsOf(label)
        expect(pseudocode).toEqual({ namespace, name, symbol: mangled })
        expect(pseudocodeText(pseudocode)).toBe([...namespace, name].join('::'))
    })

    it('binds by the mangled name without the Listing’s suffix', () => {
        expect(formsOf('_ZNSolsEi@plt').pseudocode.symbol).toBe('_ZNSolsEi')
        expect(formsOf('_ZTISt13runtime_error@GLIBCXX_3.4').pseudocode.symbol).toBe(
            '_ZTISt13runtime_error'
        )
    })

    it('leaves out the return type of the function a local entity is in', () => {
        const guard = formsOf(
            '_ZZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE12_M_constructIPKcEEvT_S8_St20forward_iterator_tagEN6_GuardD1Ev'
        )
        expect(guard.text.startsWith('void ')).toBe(true)
        expect(guard.short).toBe(
            'std::string::_M_construct<char const*>(char const*, char const*, std::forward_iterator_tag)::_Guard::~_Guard'
        )
        expect(guard.pseudocode).toMatchObject({
            namespace: [
                'std',
                'string',
                '_M_construct<char const*>(char const*, char const*, std::forward_iterator_tag)',
                '_Guard'
            ],
            name: '~_Guard'
        })
        expect(formsOf('_ZZNK4game4Boss5bonusEvE1x').pseudocode).toMatchObject({
            namespace: ['game', 'Boss', 'bonus() const'],
            name: 'x'
        })
    })

    it('splits at top-level :: only', () => {
        expect(splitScope(marked('std::map<std::string, std::vector<int>>::operator[]'))).toEqual([
            'std',
            marked('map<std::string, std::vector<int>>'),
            'operator[]'
        ])
        expect(splitScope('decltype(a::b)::c')).toEqual(['decltype(a::b)', 'c'])
        expect(splitScope(marked('Foo::operator std::function<void (int)>::type'))).toEqual([
            'Foo',
            marked('operator std::function<void (int)>::type')
        ])
        expect(splitScope('Foo::operator std::string()::x')).toEqual([
            'Foo',
            'operator std::string()',
            'x'
        ])
    })

    it('reads the brackets and quotes inside a string literal as its text', () => {
        expect(splitScope(marked('ns::S<Fixed{"a(b"}>::f'))).toEqual([
            'ns',
            marked('S<Fixed{"a(b"}>'),
            'f'
        ])
        expect(splitScope(marked('ns::S<Fixed{"x)\\"::"}>::f'))).toEqual([
            'ns',
            marked('S<Fixed{"x)\\"::"}>'),
            'f'
        ])
        expect(splitScope(marked('S<Fixed{"a\\\\"}>::f'))).toEqual([
            marked('S<Fixed{"a\\\\"}>'),
            'f'
        ])
        // `template<Fixed F> int ns::S<F>::f()` and its static `v`, with `Fixed{"a(b"}` and
        // `Fixed{"x)y"}`
        expect(formsOf('_ZN2ns1SIXtl5FixedILi4EEtlA4_cLc97ELc40ELc98EEEEE1fEv').pseudocode).toEqual(
            {
                namespace: ['ns', 'S<Fixed<4>{"a(b"}>'],
                name: 'f',
                symbol: '_ZN2ns1SIXtl5FixedILi4EEtlA4_cLc97ELc40ELc98EEEEE1fEv'
            }
        )
        expect(
            formsOf('_ZN2ns1SIXtl5FixedILi4EEtlA4_cLc120ELc41ELc121EEEEE1fEv').pseudocode
        ).toMatchObject({ namespace: ['ns', 'S<Fixed<4>{"x)y"}>'], name: 'f' })
        expect(
            formsOf('_ZGVN2ns1SIXtl5FixedILi4EEtlA4_cLc97ELc40ELc98EEEEE1vE').pseudocode
        ).toMatchObject({ namespace: ['ns', 'S<Fixed<4>{"a(b"}>', 'v'], name: 'guard' })
    })
})

describe('the comment', () => {
    it('is the signature up to 100 characters, then the name and (…)', () => {
        const long = formsOf(
            '_ZNSt3mapINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESt6vectorIiSaIiEESt4lessIS5_ESaISt4pairIKS5_S8_EEE11try_emplaceIJRKS8_EEES9_ISt17_Rb_tree_iteratorISB_EbERSD_DpOT_'
        )
        expect(long.signature.length).toBeGreaterThan(100)
        expect(long.comment).toBe(
            'std::map<std::string, std::vector<int>>::try_emplace<std::vector<int> const&>(…)'
        )
        expect(formsOf('_ZN4game6PlayerD0Ev').comment.length).toBeLessThanOrEqual(100)
    })

    it('keeps a clone suffix and a mark after (…)', () => {
        const name = formsOf(
            '_ZN4game12VeryLongNameINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEED0Ev.cold'
        )
        expect(name.comment).toBe(
            'game::VeryLongName<std::string>::~VeryLongName() [clone .cold] [deleting]'
        )
        const longer = formsOf(
            '_ZN4game12VeryLongNameINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEE6methodERKS6_S8_S8_S8_.cold'
        )
        expect(longer.comment).toBe('game::VeryLongName<std::string>::method(…) [clone .cold]')
    })

    it('keeps a quote the demangler prints, for the Listing to escape', () => {
        expect(formsOf('_Z1gIXtl5FixedtlA6_cLc104ELc101ELc108ELc108ELc111EEEEEiv')).toMatchObject({
            text: 'int g<Fixed{"hello"}>()',
            comment: 'g<Fixed{"hello"}>()'
        })
    })
})

describe('libstdc++.so.6', () => {
    it('reads every mangled dynamic symbol but the _Float32x and _Float64x typeinfo', async () => {
        const bytes = new Uint8Array(
            readFileSync(
                new URL(
                    '../../../../../x86/blink-js/src/assets/linux/libstdc++.so.6',
                    import.meta.url
                )
            )
        )
        const { analyze } = await import('@specy/x86/elf')
        const mangled = [
            ...new Set(
                analyze(bytes)
                    .dynamicSymbols.map((symbol) => symbol.name)
                    .filter((name) => name.startsWith('_Z'))
            )
        ]
        expect(mangled.length).toBeGreaterThan(6000)
        const unread = mangled.filter((name) => !forms(name))
        expect(unread.sort()).toEqual([
            '_ZTIDF32x',
            '_ZTIDF64x',
            '_ZTIPDF32x',
            '_ZTIPDF64x',
            '_ZTIPKDF32x',
            '_ZTIPKDF64x'
        ])
        const clones = mangled.filter((name) => name.startsWith('_ZGTt'))
        expect(clones.length).toBeGreaterThan(70)
        for (const name of clones)
            expect(formsOf(name).short.startsWith('transaction clone for ')).toBe(true)
    })
})

describe('names the demangler cannot read', () => {
    it.each([
        // libstdc++'s `_Float64x` typeinfo, which LLVM does not read
        '_ZTIPKDF64x',
        // the FactCheck-like program's `std::swap<int>`, whose `enable_if` holds an `sr` expression
        '_ZSt4swapIiENSt9enable_ifIXsrSt6__and_IJSt6__not_ISt15__is_tuple_likeIT_EESt21is_move_constructibleIS4_ESt18is_move_assignableIS4_EEE5valueEvE4typeERS4_SE_',
        // GCC's conversion operator to a nested type
        '_ZNK3FoocvNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEEv',
        // Rust's v0 mangling
        '_RNvCs1234_7mycrate4main',
        'main',
        'FUN_brave_otter',
        '_start@plt',
        `_Z1f${'P'.repeat(LONGEST_MANGLED_NAME)}i`
    ])('%s', (label) => {
        expect(forms(label)).toBeUndefined()
    })
})

describe('listForms', () => {
    const listed = (...labels: string[]) =>
        listForms(labels.map((name) => ({ name, demangled: forms(name) })))

    it('shows short names, then signatures where they collide, then the variant', () => {
        expect(
            listed(
                '_Z3sumRKSt6vectorIiSaIiEE',
                '_Z3sumRKSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE',
                '_ZN4game6PlayerD0Ev',
                '_ZN4game6PlayerD1Ev',
                `_ZN4game6PlayerC1E${STRING}`,
                `_ZN4game6PlayerC2E${STRING}`,
                '_ZNKSs4sizeEv',
                '_ZNKSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE4sizeEv',
                '_ZNSolsEi@plt',
                'main'
            )
        ).toEqual([
            'sum(std::vector<int> const&)',
            'sum(std::vector<std::string> const&)',
            'game::Player::~Player() [deleting]',
            'game::Player::~Player()',
            'game::Player::Player(std::string) [complete]',
            'game::Player::Player(std::string) [base]',
            // libstdc++'s two string ABIs: only the address tells them apart.
            'std::string::size() const',
            'std::string::size() const',
            'std::ostream::operator<<@plt',
            'main'
        ])
    })

    it('tells a C function from a C++ one it shares a name with', () => {
        expect(listed('sum', '_Z3sumRKSt6vectorIiSaIiEE')).toEqual([
            'sum',
            'sum(std::vector<int> const&)'
        ])
    })

    it('lists every function of the cpp fixture apart', async () => {
        const bytes = new Uint8Array(
            readFileSync(
                new URL('../../../../../x86/blink-js/tests/fixtures/elf/cpp', import.meta.url)
            )
        )
        const listing = generateListing(await loadDecoder(), {
            bytes,
            name: 'cpp',
            base: 0,
            version: 'v1'
        })
        const functions = listing.functions.map(({ name }) => ({ name, demangled: forms(name) }))
        const lists = listForms(functions)
        expect(new Set(lists).size).toBe(lists.length)
        const listOf = (name: string) => lists[functions.findIndex((fn) => fn.name === name)]
        expect(listOf('main')).toBe('main')
        expect(listOf('_ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_PKc@plt')).toBe(
            'std::operator<<<std::char_traits<char>>(std::ostream&, char const*)@plt'
        )
        expect(listOf('_ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_c@plt')).toBe(
            'std::operator<<<std::char_traits<char>>(std::ostream&, char)@plt'
        )
        expect(listOf('_ZNKSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE7_M_dataEv')).toBe(
            'std::string::_M_data() const'
        )
        expect(listOf('_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE7_M_dataEPc')).toBe(
            'std::string::_M_data(char*)'
        )
        // Every mangled label of the fixture reads.
        const unread = listing.labels
            .map((label) => label.name)
            .filter((name) => name.startsWith('_Z') && !forms(name))
        expect(unread).toEqual([])
    })
})

describe('needsDemangler', () => {
    const symbol = (name: string) => ({ name }) as never
    it('asks for the demangler only when a symbol or relocation is mangled', () => {
        const none = {
            symbols: [symbol('main')],
            dynamicSymbols: [symbol('puts')],
            relocations: []
        }
        expect(needsDemangler(none)).toBe(false)
        expect(needsDemangler({ ...none, dynamicSymbols: [symbol('_ZNSolsEi')] })).toBe(true)
        expect(needsDemangler({ ...none, symbols: [symbol('_ZN4game4BossD0Ev')] })).toBe(true)
        expect(needsDemangler({ ...none, relocations: [{ symbol: '_ZSt4cout' } as never] })).toBe(
            true
        )
    })
})
