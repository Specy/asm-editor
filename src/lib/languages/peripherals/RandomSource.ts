/**
 * The Random source: where a program's random services get their starting state
 * ([ADR 0037](../../../../docs/adr/0037-testcases-run-on-a-seeded-random-source.md)). Chosen with
 * the Input Source and the Time Source for the whole run:
 *
 * - `host`, an interactive run: a seed drawn from the host's randomness (`crypto.getRandomValues`)
 *   when the source is made and on every reset, so each run gets numbers of its own, as the
 *   Reference environments' unseeded generators do.
 * - `seeded`, a Testcase's scripted run: the fixed seed `SCRIPTED_RANDOM_SEED`, so the same
 *   program and Testcase get the same numbers on every run.
 *
 * It serves two kinds of reader:
 *
 * - `seedFor(generator)`: the first seed of a numbered generator, what MARS's and RARS's
 *   `randomSeed(index)` handler answers for a `java.util.Random` stream the program never seeded
 *   (services 40 to 44). A program that seeds one itself (service 40) never asks.
 * - `bytes(length)`: a stream of bytes, what x86's `getrandom`, `AT_RANDOM` and `/dev/urandom`
 *   read. `position` says how far it has been read and `seek` goes back, so that Undo can put a
 *   read back where it was and a Step after it reads the same bytes again.
 *
 * Both are derived from the seed by SplitMix64 (Steele, Lea and Flood, 2014), so a mode only
 * chooses the seed. With `S` the seed, `γ` = 0x9E3779B97F4A7C15 and all arithmetic modulo 2^64:
 *
 *     mix(z)  = z ^= z >> 30; z *= 0xBF58476D1CE4E5B9;
 *               z ^= z >> 27; z *= 0x94D049BB133111EB; z ^ (z >> 31)
 *     word(k) = mix(S + k·γ)
 *
 * `word(k)` is SplitMix64's k-th output from the state `S`, and any one of them can be computed on
 * its own. Generator `n`, taken as a 64-bit two's complement number, starts from the high 48 bits
 * of `word(n)`, as many bits as a `java.util.Random` seed holds. The byte stream is `word(2^63)`,
 * `word(2^63 + 1)`, … each written least significant byte first; it starts at 2^63 so that no
 * generator a 32-bit register can name shares a word with it.
 *
 * Every Testcase saved against a random program records what this produces in a scripted run, so
 * the fixed seed and both derivations are part of the Testcase format: they are pinned by
 * `RandomSource.test.ts` and change only as a breaking change.
 *
 * Plain TypeScript with no Svelte runes, like the other peripherals, so it runs under node.
 */

export type RandomSourceMode = 'host' | 'seeded'

/** The seed of every scripted run: the text `Testcase` in ASCII, read as a big-endian number. */
export const SCRIPTED_RANDOM_SEED = 0x5465737463617365n

/** Where the byte stream starts among the words, above every generator a 32-bit id names. */
export const RANDOM_BYTES_FIRST_WORD = 1n << 63n

/** One more than the largest generator seed: `java.util.Random` keeps 48 bits of state. */
export const GENERATOR_SEED_LIMIT = 2 ** 48

const WORD_MASK = (1n << 64n) - 1n
const GOLDEN_GAMMA = 0x9e3779b97f4a7c15n

/** SplitMix64's output function, a bijection of 64-bit words. */
function mix(value: bigint): bigint {
    let z = value
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & WORD_MASK
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & WORD_MASK
    return z ^ (z >> 31n)
}

/** A seed from the host's randomness. */
export function hostRandomSeed(): bigint {
    const words = new BigUint64Array(1)
    globalThis.crypto.getRandomValues(words)
    return words[0]
}

export type RandomSourceOptions = {
    /** Defaults to `host`; a Testcase run asks for `seeded`. */
    mode?: RandomSourceMode
    /** The host's randomness, injected so tests can pin what an interactive run draws. */
    hostSeed?: () => bigint
}

export class RandomSource {
    private readonly _mode: RandomSourceMode
    private readonly drawHostSeed: () => bigint
    private seed: bigint
    /** How many bytes of the stream have been read. */
    private _position = 0
    /** The word the stream is in, kept so a long read does not mix every word eight times. */
    private cachedWord: { index: bigint; value: bigint } | null = null

    constructor(options: RandomSourceOptions = {}) {
        this._mode = options.mode ?? 'host'
        this.drawHostSeed = options.hostSeed ?? hostRandomSeed
        this.seed = this.startingSeed()
    }

    get mode(): RandomSourceMode {
        return this._mode
    }

    get isSeeded(): boolean {
        return this._mode === 'seeded'
    }

    /** How many bytes of the stream `bytes` has handed out since the run started. */
    get position(): number {
        return this._position
    }

    /**
     * The first seed of generator `generator`, a whole number from 0 to 2^48 - 1. The same
     * generator gets the same seed for the whole run, so a generator that Undo took back to before
     * its first draw starts over from where it did.
     */
    seedFor(generator: number): number {
        if (!Number.isSafeInteger(generator)) {
            throw new RangeError(`A random generator is numbered by an integer, not ${generator}`)
        }
        return Number(this.word(BigInt.asUintN(64, BigInt(generator))) >> 16n)
    }

    /** The next `length` bytes of the stream. */
    bytes(length: number): Uint8Array {
        if (!Number.isSafeInteger(length) || length < 0) {
            throw new RangeError(`Cannot read ${length} random bytes`)
        }
        const bytes = new Uint8Array(length)
        for (let i = 0; i < length; i++) {
            const position = this._position + i
            const word = this.streamWord(BigInt(Math.floor(position / 8)))
            bytes[i] = Number((word >> BigInt((position % 8) * 8)) & 0xffn)
        }
        this._position += length
        return bytes
    }

    /** Goes back, or forward, to a `position` read earlier, for Undo. */
    seek(position: number): void {
        if (!Number.isSafeInteger(position) || position < 0) {
            throw new RangeError(`Cannot seek the random bytes to ${position}`)
        }
        this._position = position
    }

    /**
     * A new run: the stream starts over, and a host source draws a new seed, so the next run gets
     * numbers of its own. A seeded source starts from the same seed again.
     */
    reset(): void {
        this.seed = this.startingSeed()
        this._position = 0
        this.cachedWord = null
    }

    private startingSeed(): bigint {
        return this.isSeeded ? SCRIPTED_RANDOM_SEED : BigInt.asUintN(64, this.drawHostSeed())
    }

    private word(index: bigint): bigint {
        return mix((this.seed + index * GOLDEN_GAMMA) & WORD_MASK)
    }

    private streamWord(offset: bigint): bigint {
        const index = (RANDOM_BYTES_FIRST_WORD + offset) & WORD_MASK
        if (this.cachedWord?.index !== index) {
            this.cachedWord = { index, value: this.word(index) }
        }
        return this.cachedWord.value
    }
}
