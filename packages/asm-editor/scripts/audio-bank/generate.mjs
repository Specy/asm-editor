#!/usr/bin/env node
/**
 * Writes the Audio Peripheral's sound bank, `src/lib/languages/peripherals/audio/assets/soundbank-emg.sf2`:
 * the Emergency GM sound set that OpenJDK's `EmergencySoundbank` generates, on the JDK 21 that the
 * repository's `mise.toml` pins ([ADR 0058](../../../../docs/adr/0058-notes-play-on-the-bank-mars-plays-on-jdk-21.md)).
 * `SaveEmergencySoundbank.java` seeds the one random source the generator leaves unseeded, so the same
 * JDK writes the same bytes. The file is committed so that building the editor never needs a JDK;
 * run this after changing the JDK, and update `NOTICE.md` beside the bank with the version it prints.
 *
 *   node scripts/audio-bank/generate.mjs [--check]
 *
 * `--check` writes nothing and fails when a fresh generation differs from the committed file.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const editor = join(here, '..', '..')
const bank = join(editor, 'src/lib/languages/peripherals/audio/assets/soundbank-emg.sf2')
const check = process.argv.includes('--check')

const temporary = mkdtempSync(join(tmpdir(), 'audio-bank-'))
try {
    const output = join(temporary, 'soundbank-emg.sf2')
    const java = spawnSync(
        'mise',
        [
            'exec',
            '--',
            'java',
            // EmergencySoundbank is internal to java.desktop.
            '--add-exports',
            'java.desktop/com.sun.media.sound=ALL-UNNAMED',
            // For seeding the generator behind Math.random(), which the bank's phases come from.
            '--add-opens',
            'java.base/java.lang=ALL-UNNAMED',
            join(here, 'SaveEmergencySoundbank.java'),
            output
        ],
        { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
    )
    if (java.error) throw java.error
    if (java.status !== 0) {
        console.error(`audio bank: java exited with ${java.status}`)
        process.exit(1)
    }
    const jdk = java.stdout.trim()
    const bytes = readFileSync(output)
    const name = relative(editor, bank)
    if (check) {
        if (!existsSync(bank) || !readFileSync(bank).equals(bytes)) {
            console.error(`${name} differs from what ${jdk} generates`)
            console.error('Run node scripts/audio-bank/generate.mjs to regenerate it.')
            process.exit(1)
        }
        console.log(`${name} matches what ${jdk} generates`)
    } else {
        writeFileSync(bank, bytes)
        console.log(`wrote ${name} (${bytes.length} bytes) with ${jdk}`)
    }
} finally {
    rmSync(temporary, { recursive: true, force: true })
}
