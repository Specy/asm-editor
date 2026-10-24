/**
 * The Explorer's icon for a File: by its bytes when they name a kind, whatever the File is
 * called, and by its name otherwise.
 */
import { describe, expect, it } from 'vite-plus/test'
import { encodeBase64, type ProjectFile } from '#lib/projectFiles.ts'
import { fileIconKind } from './fileIconKind'

const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0))
const byteFile = (...values: (number | string)[]): ProjectFile => ({
    encoding: 'base64',
    content: encodeBase64(
        Uint8Array.from(
            values.flatMap((value) => (typeof value === 'string' ? ascii(value) : value))
        )
    )
})
const textFile = (content: string): ProjectFile => ({ encoding: 'plain', content })

const png = byteFile(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 'IHDR')
const elf = byteFile(0x7f, 'ELF', 1, 1, 1, 0)

describe('fileIconKind', () => {
    it('names byte Files by their signature, not their name', () => {
        expect(fileIconKind('logo.png', 'X86', png)).toBe('image')
        expect(fileIconKind('logo', 'X86', png)).toBe('image')
        expect(fileIconKind('notes.txt', 'X86', png)).toBe('image')
        expect(fileIconKind('crackme', 'X86', elf)).toBe('executable')
        //an ELF is one in any Target, though only an x86 Build runs it
        expect(fileIconKind('crackme', 'MIPS', elf)).toBe('executable')
        expect(fileIconKind('doc.bin', 'MIPS', byteFile('%PDF-1.7'))).toBe('pdf')
        expect(fileIconKind('song', 'MIPS', byteFile('ID3', 4, 0, 0, 0, 0, 0, 0))).toBe('audio')
        expect(fileIconKind('clip', 'MIPS', byteFile(0x1a, 0x45, 0xdf, 0xa3))).toBe('video')
    })

    it('calls other bytes binary, whatever their name', () => {
        expect(fileIconKind('data.bin', 'X86', byteFile(1, 2, 3, 4))).toBe('binary')
        expect(fileIconKind('main.c', 'X86', byteFile(1, 2, 3, 4))).toBe('binary')
    })

    it('reads a Build output from its bytes', () => {
        expect(fileIconKind('main', 'X86', Uint8Array.of(0x7f, ...ascii('ELF'), 2))).toBe(
            'executable'
        )
    })

    it('names text Files by their extension', () => {
        expect(fileIconKind('main.c', 'X86', textFile('int main;'))).toBe('c')
        expect(fileIconKind('main.cpp', 'X86', textFile(''))).toBe('cpp')
        expect(fileIconKind('lib.h', 'X86', textFile(''))).toBe('header')
        expect(fileIconKind('main.asm', 'MIPS', textFile(''))).toBe('assembly')
        expect(fileIconKind('main.z80', 'MIPS', textFile(''))).toBe('assembly')
        expect(fileIconKind('README.md', 'MIPS', textFile('# Hi'))).toBe('markdown')
        expect(fileIconKind('solve.py', 'MIPS', textFile(''))).toBe('python')
        expect(fileIconKind('data.csv', 'MIPS', textFile(''))).toBe('table')
        expect(fileIconKind('config.json', 'MIPS', textFile('{}'))).toBe('code')
        expect(fileIconKind('notes.txt', 'MIPS', textFile(''))).toBe('text')
        expect(fileIconKind('.gitignore', 'MIPS', textFile(''))).toBe('file')
    })

    it('takes a text File that is a PDF for one', () => {
        expect(fileIconKind('paper.txt', 'MIPS', textFile('%PDF-1.4\n'))).toBe('pdf')
    })

    it('names a File still being named by the name alone', () => {
        expect(fileIconKind('solve.py', 'MIPS')).toBe('python')
        expect(fileIconKind('', 'MIPS')).toBe('file')
    })
})
