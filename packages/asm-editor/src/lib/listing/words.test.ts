import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { X86_ASSEMBLER_REGISTERS } from '../languages/X86/generated/x86Tokens'
import { X86_MNEMONICS } from '../languages/X86/generated/x86Mnemonics'
import { X86Directives, X86Prefixes, X86SizeSpecifiers } from '../languages/X86/X86-keywords'
import { ADJECTIVES_V1, ANIMALS_V1 } from './words-v1'

/**
 * The rules of ADR 0045 for the frozen word lists. They cannot say a word is not offensive in some
 * pairing; that, and whether a word reads as a finding beyond the list below, is the owner's
 * review.
 */

/** Words that read as something an analysis found, which an invented name must never suggest. */
const FINDINGS = [
    'check',
    'key',
    'secret',
    'flag',
    'crypt',
    'init',
    'main',
    'exit',
    'error',
    'password',
    'hash',
    'token',
    'admin',
    'pass',
    'fail',
    'win',
    'crack',
    'hack',
    'debug',
    'bug',
    'patch',
    'leak',
    'vuln',
    'exploit',
    'root',
    'shell',
    'payload',
    'cipher',
    'decode',
    'encode',
    'verify',
    'valid',
    'correct',
    'wrong',
    'good',
    'bad',
    'success',
    'true',
    'false',
    'null',
    'void',
    'dead',
    'kill',
    'free',
    'alloc',
    'buffer',
    'stack',
    'heap',
    'string',
    'data',
    'code',
    'func',
    'start',
    'end',
    'stop',
    'done',
    'loop',
    'test',
    'call',
    'jump',
    'push',
    'pop',
    'read',
    'write',
    'open',
    'close',
    'input',
    'output',
    'print',
    'trace',
    'dump',
    'magic',
    'random',
    'hidden',
    'fake',
    'safe',
    'secure',
    'canary',
    'cookie',
    'guard',
    'user',
    'login',
    'auth',
    'serial',
    'license',
    'trial',
    'xor',
    'worm',
    'virus',
    'trojan',
    'malware',
    'spy',
    'mole',
    'rat',
    'lock',
    'salt',
    'nonce',
    'seed',
    'hook',
    'packed',
    'stripped',
    'signed',
    'masked',
    'lazy',
    'static',
    'dynamic',
    'global',
    'local',
    'final',
    'cache',
    'hot',
    'cold',
    'fast',
    'slow',
    'ready',
    'busy',
    'idle',
    'sleep',
    'wait',
    'crash',
    'panic',
    'abort',
    'halt',
    'trap',
    'fault',
    'warn'
]
/** Findings a word must not even contain, as `turkey` contains `key`. */
const CONTAINED = [
    'check',
    'key',
    'secret',
    'flag',
    'crypt',
    'init',
    'main',
    'exit',
    'error',
    'hash',
    'token',
    'admin',
    'bug',
    'hack',
    'crack'
]

/** Every word Zydis can print: its mnemonics, registers, prefixes and decorators. */
function zydisWords(): Set<string> {
    const source = readFileSync(
        new URL('../../../../x86/third_party/zydis/Zydis.c', import.meta.url),
        'latin1'
    )
    const words = new Set<string>()
    for (const [, text] of source.matchAll(/ZYDIS_MAKE_SHORTSTRING\("([^"]*)"\)/g))
        for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) if (word) words.add(word)
    return words
}

/**
 * Every word the Core's decoder prints in place of Zydis's: NASM's mnemonics for its aliases
 * (`je`, `retfq`, `pushfw`, `iretw`), size keywords, segments, `rel`, `to`, `{vex}` and `db`,
 * read from the string literals of its formatter hooks.
 */
function decoderWords(): Set<string> {
    const source = readFileSync(
        new URL('../../../../x86/blink-js/src/disassembler/wrapper.c', import.meta.url),
        'latin1'
    )
    const words = new Set<string>()
    for (const line of source.split('\n')) {
        if (/^\s*(?:#include|_Static_assert)\b/.test(line)) continue
        for (const [, text] of line.matchAll(/"([^"]*)"/g))
            for (const word of text
                .replace(/%\w+/g, ' ')
                .toLowerCase()
                .split(/[^a-z]+/))
                if (word) words.add(word)
    }
    return words
}

describe('the v1 word lists', () => {
    const lists = { adjectives: ADJECTIVES_V1, animals: ANIMALS_V1 }

    it('hold 256 sorted, distinct words of 3 to 9 lower-case letters each', () => {
        for (const [name, words] of Object.entries(lists)) {
            expect(words, name).toHaveLength(256)
            expect(new Set(words).size, name).toBe(256)
            expect([...words].sort(), name).toEqual(words)
            for (const word of words) expect(word, name).toMatch(/^[a-z]{3,9}$/)
        }
        const shared = ADJECTIVES_V1.filter((word) => ANIMALS_V1.includes(word))
        expect(shared).toEqual([])
    })

    it('hold nothing that reads as a finding, an instruction, a register or a NASM keyword', () => {
        const zydis = zydisWords()
        const decoder = decoderWords()
        // A broken path would make every check below pass.
        expect(zydis.has('vpbroadcastb')).toBe(true)
        expect(zydis.has('rax')).toBe(true)
        for (const word of ['to', 'retfq', 'retfw', 'pushfw', 'popfw', 'iretw', 'vex', 'rel'])
            expect(decoder.has(word), word).toBe(true)
        const nasm = new Set(
            [
                ...X86_MNEMONICS,
                ...X86_ASSEMBLER_REGISTERS,
                ...X86Directives,
                ...X86SizeSpecifiers,
                ...X86Prefixes
            ].map((word) => word.replace(/^%/, '').toLowerCase())
        )
        for (const word of [...ADJECTIVES_V1, ...ANIMALS_V1]) {
            expect(FINDINGS, word).not.toContain(word)
            expect(zydis.has(word), `${word} is something Zydis prints`).toBe(false)
            expect(decoder.has(word), `${word} is something the decoder prints`).toBe(false)
            expect(nasm.has(word), `${word} is an x86 word NASM knows`).toBe(false)
            for (const finding of CONTAINED) expect(word, word).not.toContain(finding)
        }
    })
})
