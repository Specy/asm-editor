import { SHARE_ID } from '$stores/projectsStore.svelte'
import lzstring from 'lz-string'
import type { Project } from '$lib/Project.svelte'
import { serializer } from '$lib/json'
import type { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

export function minBigInt(a: bigint, b: bigint): bigint {
    return a < b ? a : b
}
export function maxBigInt(a: bigint, b: bigint): bigint {
    return a > b ? a : b
}
export function clampBigInt(value: bigint, min: bigint, max: bigint): bigint {
    return maxBigInt(min, minBigInt(value, max))
}

export function unsignedBigIntToSigned(unsignedBigInt: bigint, numBytes: number) {
    const bitLength = numBytes * 8
    const signBitMask = 1n << (BigInt(bitLength) - 1n)

    if ((unsignedBigInt & signBitMask) !== 0n) {
        const twoComplementMask = (1n << BigInt(bitLength)) - 1n
        return unsignedBigInt - (twoComplementMask + 1n)
    }

    return unsignedBigInt
}

export function bigIntOfSize(number: bigint, bytes: RegisterSize) {
    const mask = 1n << BigInt(bytes * 8)
    return number & mask
}

export type Timer = NodeJS.Timeout | number

export function createDebouncer(delay: number): [(callback: () => void) => void, () => void] {
    let timeoutId: Timer
    function clear() {
        clearTimeout(timeoutId)
    }
    function debounce(callback: () => void) {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(callback, delay)
    }
    return [debounce, clear]
}
export function blobDownloader(blob: Blob, fileName: string) {
    const a = document.createElement('a')
    a.style.display = 'none'
    document.body.appendChild(a)
    a.href = URL.createObjectURL(blob)
    a.download = fileName
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
}
export function textDownloader(text: string, fileName: string) {
    blobDownloader(new Blob([text], { type: 'text/json' }), fileName)
}

export function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
export function formatTime(s: number) {
    //format in seconds, milliseconds
    const seconds = Math.floor(s / 1000)
    const milliseconds = Math.floor(s % 1000)
    if (seconds === 0) {
        return `${milliseconds}ms`
    }
    return `${seconds}.${`${milliseconds}`.padStart(3, '0')}s`
}

export function capitalize(word: string) {
    return word[0].toUpperCase() + word.slice(1)
}

export function createShareLink(project: Project, mode: 'exam' | 'project' = 'project'): string {
    const p = project.toObject()
    p.id = SHARE_ID
    const code = lzstring.compressToEncodedURIComponent(serializer.stringify(p))
    if (mode === 'exam') {
        return `${window.location.origin}/projects/exam?project=${code}`
    } else {
        return `${window.location.origin}/projects/share?project=${code}`

    }
}


export function getEnumKeys<T extends Record<string, string | number>>(enumObj: T): (keyof T)[] {
    return Object.keys(enumObj).filter(key => isNaN(Number(key))) as (keyof T)[]
}


function hexDigest(buffer) {
    let digest = ''
    const view = new DataView(buffer)
    for (let i = 0; i < view.byteLength; i += 4) {
        const value = view.getUint32(i)
        const stringValue = value.toString(16)
        const padding = '00000000'
        const paddedValue = (padding + stringValue).slice(-padding.length)
        digest += paddedValue
    }

    return digest
}

export async function makeHash(data: string) {
    const encoder = new TextEncoder()
    const password = encoder.encode(data)
    const hash = await window.crypto.subtle.digest('SHA-256', password)
    return hexDigest(hash)
}


export async function encryptData(data: string, key: string): Promise<string> {
    const password = (await makeHash(key)).slice(0, 128 / 8)
    const encoder = new TextEncoder()
    const iv = window.crypto.getRandomValues(new Uint8Array(12)) // AES-GCM requires a 12-byte IV
    const keyBuffer = await window.crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    )
    const encrypted = await window.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        keyBuffer,
        encoder.encode(data)
    )
    const encryptedArray = new Uint8Array(encrypted)
    const encryptedBase64 = btoa(String.fromCharCode(...encryptedArray))
    const ivBase64 = btoa(String.fromCharCode(...iv))
    return `${ivBase64}:${encryptedBase64}`
}

export async function decryptData(encryptedData: string, key: string): Promise<string> {
     const password = (await makeHash(key)).slice(0, 128 / 8)
    const encoder = new TextEncoder()
    const [ivBase64, encryptedBase64] = encryptedData.split(':')
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0))
    const encryptedArray = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
    const keyBuffer = await window.crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    )
    const decrypted = await window.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        keyBuffer,
        encryptedArray
    )
    const decoder = new TextDecoder()
    return decoder.decode(decrypted)
}