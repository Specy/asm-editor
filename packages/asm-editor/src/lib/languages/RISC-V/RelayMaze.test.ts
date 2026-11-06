import { readFileSync, readdirSync, statSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'
import { RISCVEmulator } from './RISC-VEmulator.svelte.ts'
import { makeProjectFromArchive } from '#lib/projectArchive.ts'
import { fileBytes } from '#lib/projectFiles.ts'
import { programBuildSources } from '#lib/buildSources.ts'
import { compilationStatus } from '#lib/sourceCompilation/records.ts'
import { Keyboard } from '#lib/languages/peripherals/Keyboard.ts'
import { ProgramClock } from '#lib/languages/peripherals/ProgramClock.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { Audio } from '#lib/languages/peripherals/audio/Audio.ts'
import { RecordingAudioOutput } from '#lib/languages/peripherals/audio/AudioOutput.ts'
import type { Project } from '#lib/Project.svelte.ts'

const folder = new URL('../../../../../examples/risc-v/relay-maze/', import.meta.url)
const maze = readFileSync(new URL('assets/maze.txt', folder), 'utf8').trimEnd().split('\n')
const dotCount = maze
    .join('')
    .split('')
    .filter((c) => c === '.' || c === 'o').length
let project: Project
let current: ReturnType<typeof RISCVEmulator> | undefined
beforeAll(async () => {
    ;({ project } = await makeProjectFromArchive(
        readFileSync(
            new URL('../../../../../examples/dist/risc-v/relay-maze.asmproj', import.meta.url)
        )
    ))
})
afterEach(() => {
    current?.dispose()
    current = undefined
})

it('ships all editable files and the current C compilation', () => {
    const names = (readdirSync(folder, { recursive: true }) as string[])
        .filter(
            (name) =>
                !['example.json', 'compilations.json'].includes(name) &&
                statSync(new URL(name, folder)).isFile()
        )
        .sort()
    expect(Object.keys(project.files).sort()).toEqual(names)
    expect(
        names.filter(
            (name) =>
                !Buffer.from(fileBytes(project.files[name]!)).equals(
                    readFileSync(new URL(name, folder))
                )
        )
    ).toEqual([])
    expect(Object.keys(project.programs).sort()).toEqual(['assembly/main.s', 'c/relay.c.riscv'])
    expect(compilationStatus(project.compilations[0]!, project.files, 'RISC-V').stale).toBe(false)
})

it('connects every dot and power-up to the starting position, including the side tunnels', () => {
    expect(maze).toHaveLength(31)
    expect(maze.every((row) => row.length === 28)).toBe(true)
    expect(maze.join('').split('o')).toHaveLength(5)
    expect(dotCount).toBeGreaterThan(200)
    const reached = new Set(['13,23']),
        queue = [[13, 23]]
    while (queue.length) {
        const [x, y] = queue.shift()!
        for (const [rawX, ny] of [
            [x! + 1, y!],
            [x! - 1, y!],
            [x!, y! + 1],
            [x!, y! - 1]
        ]) {
            const nx = ny === 14 ? (rawX! + 28) % 28 : rawX!
            if (
                nx < 0 ||
                nx >= 28 ||
                ny! < 0 ||
                ny! >= 31 ||
                !' .o'.includes(maze[ny!]![nx]!) ||
                reached.has(`${nx},${ny}`)
            )
                continue
            reached.add(`${nx},${ny}`)
            queue.push([nx, ny!])
        }
    }
    for (let y = 0; y < 31; y++)
        for (let x = 0; x < 28; x++)
            if ('.o'.includes(maze[y]![x]!))
                expect(reached.has(`${x},${y}`), `${x},${y}`).toBe(true)
    expect(maze[14]![0]).toBe(' ')
    expect(maze[14]![27]).toBe(' ')
})

for (const entry of ['assembly/main.s', 'c/relay.c.riscv'])
    describe(entry, () => {
        const enemyStride = entry === 'assembly/main.s' ? 64 : 44
        async function game() {
            const keyboard = new Keyboard(),
                clock = new ProgramClock({ mode: 'virtual' }),
                output = new RecordingAudioOutput()
            const sources = programBuildSources(project, entry)
            const emulator = RISCVEmulator(sources, {
                peripherals: {
                    keyboard,
                    clock,
                    fileSystem: new FileSystem(project.files),
                    audio: new Audio({ clock, output })
                }
            })
            current = emulator
            await emulator.check()
            await emulator.compile(0, sources)
            expect(emulator.errors).toEqual([])
            expect([emulator.peripherals.screen.width, emulator.peripherals.screen.height]).toEqual(
                [224, 288]
            )
            const address = (label: string, offset = 0) => {
                const found = emulator.resolveMemoryLabel(label)
                expect(found, label).toBeDefined()
                return found! + BigInt(offset)
            }
            const value = (label: string, offset = 0) =>
                new DataView(emulator.readMemoryBytes(address(label, offset), 4).buffer).getInt32(
                    0,
                    true
                )
            const set = (label: string, n: number, offset = 0) => {
                const bytes = new Uint8Array(4)
                new DataView(bytes.buffer).setInt32(0, n, true)
                emulator.pokeMemory(address(label, offset), bytes)
            }
            const until = async (done: () => boolean) => {
                for (let n = 0; !done(); n++) {
                    expect(n).toBeLessThan(2000)
                    await emulator.run(50_000)
                    expect(emulator.errors).toEqual([])
                }
            }
            const wait = async (ms: number) => {
                const end = clock.now() + ms
                await until(() => clock.now() >= end)
            }
            const start = async () => {
                keyboard.typeText(' ')
                await until(() => value('game_state') === 2)
            }
            const pause = async () => {
                keyboard.typeText('p')
                await until(() => value('paused') === 1)
                await wait(40)
            }
            const resume = async () => {
                keyboard.typeText('p')
                await until(() => value('paused') === 0)
            }
            const placePlayer = (column: number, row: number) => {
                set('player_x', column * 8 + 3)
                set('player_y', (row + 3) * 8 + 3)
                set('player_dir', 1)
                set('player_want', 1)
                set('player_acc', 0)
                set('player_stall', 0)
            }
            const placeEnemy = (i: number, x: number, y: number, state = 2) => {
                set('enemies', x, enemyStride * i)
                set('enemies', y, enemyStride * i + 4)
                set('enemies', 0, enemyStride * i + 8)
                set('enemies', state, enemyStride * i + 12)
                set('enemies', 0, enemyStride * i + 16)
            }
            await until(() => clock.now() >= 16)
            return {
                emulator,
                keyboard,
                clock,
                output,
                value,
                set,
                until,
                wait,
                start,
                pause,
                resume,
                placePlayer,
                placeEnemy,
                address
            }
        }

        it('starts a maze chase, scores dots and pauses without moving the actors', async () => {
            const { keyboard, value, until, wait, start, pause, resume, output } = await game()
            expect(value('dots_left')).toBe(dotCount)
            expect(value('game_state')).toBe(0)
            await start()
            await until(() => value('score') >= 10 && value('dots_left') < dotCount)
            expect(value('dots_left')).toBeLessThan(dotCount)
            expect(value('lives')).toBe(2)
            await pause()
            const x = value('player_x'),
                y = value('player_y'),
                frame = value('frame_count')
            await wait(300)
            expect(value('player_x')).toBe(x)
            expect(value('player_y')).toBe(y)
            expect(value('frame_count')).toBe(frame)
            await resume()
            keyboard.typeText('d')
            await until(() => value('player_x') !== x)
            expect(output.commands.some((c) => c.type === 'synth')).toBe(true)
        }, 60_000)

        it('keeps its facing direction through a complete walking cycle', async () => {
            const { emulator, clock, value, set, start, pause } = await game()
            await start()
            await pause()
            // Inspect a finished frame, rather than a run stopped halfway through drawing.
            const drawFrame = async () => {
                const wait = clock.wait
                clock.wait = async (ms, signal) => {
                    await wait.call(clock, ms, signal)
                    emulator.pause()
                }
                try {
                    await emulator.run(1_000_000)
                } finally {
                    clock.wait = wait
                }
            }
            await drawFrame()
            const screen = emulator.peripherals.screen
            const crop = (x: number, y: number, width: number, height: number) => {
                const bytes: number[] = []
                for (let row = y; row < y + height; row++)
                    bytes.push(
                        ...screen.visiblePixels.slice(
                            (row * 224 + x) * 4,
                            (row * 224 + x + width) * 4
                        )
                    )
                return Buffer.from(bytes).toString('base64')
            }
            const faces = new Set<string>()
            set('player_moving', 1)
            for (let direction = 0; direction < 4; direction++) {
                set('player_dir', direction)
                const eyes: string[] = [],
                    poses = new Set<string>()
                for (let animation = 0; animation < 16; animation += 2) {
                    set('player_anim', animation)
                    await drawFrame()
                    const x = value('player_x') - 7,
                        y = value('player_y') - 7
                    eyes.push(crop(x + 3, y + 4, 10, 5))
                    poses.add(crop(x, y, 16, 16))
                }
                expect(
                    eyes.every((eye) => eye === eyes[0]),
                    `direction ${direction} stays consistent`
                ).toBe(true)
                expect(poses.size).toBeGreaterThan(1)
                faces.add(eyes[0]!)
            }
            expect(faces.size).toBe(4)
        }, 60_000)

        it('settles into its idle pose when a wall stops movement', async () => {
            const { value, set, until, start, pause, resume, placePlayer } = await game()
            await start()
            await pause()
            placePlayer(1, 1)
            set('player_moving', 1)
            set('player_anim', 6)
            await resume()
            await until(() => value('player_moving') === 0 && value('player_anim') === 0)
            expect(value('player_x')).toBe(11)
            expect(value('player_y')).toBe(35)
            expect(value('player_dir')).toBe(1)
        }, 60_000)

        it('turns a power-up into a chance to catch enemies and score points', async () => {
            const { value, set, until, wait, start, pause, resume, placePlayer, placeEnemy } =
                await game()
            await start()
            await pause()
            const score = value('score')
            const row = maze.findIndex((line) => line.includes('o'))
            const column = maze[row]!.indexOf('o')
            placePlayer(column, row)
            placeEnemy(0, column * 8 + 3, (row + 3) * 8 + 3)
            await resume()
            await until(() => value('game_state') === 3)
            expect(value('score')).toBe(score + 250)
            expect(value('fright_timer')).toBeGreaterThan(0)
            expect(value('enemies', 12)).toBe(3)
            expect(value('enemies_eaten')).toBe(1)
            await until(() => value('game_state') === 2)
            await pause()
            set('fright_timer', 1)
            await resume()
            await wait(40)
            expect(value('fright_timer')).toBe(0)
            expect(value('enemies', 16)).toBe(0)
        }, 60_000)

        it('loops background music, switches for power-ups and freezes the music on pause', async () => {
            const { output, value, set, until, wait, start, pause, resume, placePlayer } =
                await game()
            const notes = (from: number, channel: number) => {
                const result: number[] = []
                for (const command of output.commands.slice(from)) {
                    if (command.type !== 'synth') continue
                    for (let i = 0; i < command.writes.length; i += 2) {
                        const register = command.writes[i]!,
                            hz = command.writes[i + 1]!
                        if (register === channel * 32 && hz > 0 && result.at(-1) !== hz)
                            result.push(hz)
                    }
                }
                return result
            }
            const volumes = () => {
                const result = [0, 0, 0]
                for (const command of output.commands) {
                    if (command.type !== 'synth') continue
                    for (let i = 0; i < command.writes.length; i += 2) {
                        const register = command.writes[i]!
                        if ([0x12, 0x32, 0x52].includes(register))
                            result[register >> 5] = command.writes[i + 1]!
                    }
                }
                return result
            }
            const sounded = (from: number, channel: number) =>
                output.commands
                    .slice(from)
                    .some(
                        (command) =>
                            command.type === 'synth' &&
                            command.writes.some(
                                (register, i) =>
                                    i % 2 === 0 &&
                                    register === channel * 32 + 0x12 &&
                                    command.writes[i + 1]! > 0
                            )
                    )
            await start()
            await pause()
            placePlayer(1, 1)
            let from = output.commands.length
            await resume()
            await wait(750)
            expect(value('background_mode')).toBe(1)
            expect(new Set(notes(from, 1)).size).toBeGreaterThan(2)
            expect(sounded(from, 0)).toBe(true)
            expect(sounded(from, 1)).toBe(true)

            await pause()
            const step = value('background_step'),
                frames = value('background_frames')
            await wait(350)
            expect(volumes()).toEqual([0, 0, 0])
            expect(value('background_step')).toBe(step)
            expect(value('background_frames')).toBe(frames)

            const row = maze.findIndex((line) => line.includes('o'))
            placePlayer(maze[row]!.indexOf('o'), row)
            from = output.commands.length
            await resume()
            await until(() => notes(from, 1).length >= 19)
            expect(value('background_mode')).toBe(2)
            const powered = notes(from, 1)
            expect(new Set(powered).size).toBeGreaterThan(4)
            expect(powered.slice(16, 19)).toEqual(powered.slice(0, 3))
            expect(sounded(from, 2)).toBe(true)

            await pause()
            set('fright_timer', 1)
            from = output.commands.length
            await resume()
            await wait(50)
            expect(value('background_mode')).toBe(1)
            expect(notes(from, 1)).toContain(392)
        }, 60_000)

        it('advances automatically when the last dot is collected and refills the next level', async () => {
            const {
                emulator,
                value,
                set,
                until,
                start,
                pause,
                resume,
                placePlayer,
                placeEnemy,
                address
            } = await game()
            await start()
            await pause()
            // Prepare the last-dot situation through the public debugger memory API.
            const tiles = maze.join('').replace(/[.o]/g, ' ').split('')
            tiles[29] = '.'
            emulator.pokeMemory(address('tiles'), new TextEncoder().encode(tiles.join('')))
            set('dots_left', 1)
            placePlayer(1, 1)
            for (let i = 0; i < 4; i++) placeEnemy(i, 111, 139, 0)
            const score = value('score'),
                lives = value('lives')
            await resume()
            await until(() => value('game_state') === 5)
            expect(value('score')).toBe(score + 10)
            await until(() => value('level') === 2 && value('game_state') === 1)
            expect(value('dots_left')).toBe(dotCount)
            expect(value('lives')).toBe(lives)
        }, 60_000)

        it('uses spare lives after a collision and ends when no spare life remains', async () => {
            const { value, set, until, start, pause, resume, placePlayer, placeEnemy } =
                await game()
            await start()
            await pause()
            placePlayer(1, 1)
            placeEnemy(0, 11, 35)
            await resume()
            await until(() => value('game_state') === 4)
            await until(() => value('game_state') === 1 && value('lives') === 1)
            await until(() => value('game_state') === 2)
            await pause()
            set('lives', 0)
            placePlayer(1, 1)
            placeEnemy(0, 11, 35)
            await resume()
            await until(() => value('game_state') === 6)
            expect(value('lives')).toBe(0)
        }, 60_000)
    })
