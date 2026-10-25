"""
Writes the BMP fixtures of the Pixel editor's codec tests (src/lib/pixels/fixtures/), each with
the RGBA bytes Pillow decodes it to, top row first, as `<name>.rgba`: the tests check the editor's
decoder against Pillow's. Layouts Pillow saves are saved by Pillow; the rest (4 bits a pixel, rows
stored top-down, 16-bit pixels, a BITMAPCOREHEADER, a BITMAPV4HEADER with alpha) are built here byte
by byte and read back by Pillow.

Run from packages/asm-editor: python3 -I scripts/pixel-fixtures/make.py
"""

import os
import random
import struct
import sys

from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'lib', 'pixels', 'fixtures')
WIDTH, HEIGHT = 7, 5  # odd widths so rows need padding at every depth

rng = random.Random(1)


def colours(count, alpha=False):
    return [
        (rng.randrange(256), rng.randrange(256), rng.randrange(256),
         rng.choice([0, 128, 255]) if alpha else 255)
        for _ in range(count)
    ]


def stride(bits):
    return (WIDTH * bits + 31) // 32 * 4


def file_header(length, pixel_offset):
    return b'BM' + struct.pack('<IHHI', length, 0, 0, pixel_offset)


def info_header(bits, compression, height, used=0, size=40):
    return struct.pack('<IiiHHIIiiII', size, WIDTH, height, 1, bits, compression,
                       stride(bits) * HEIGHT, 2835, 2835, used, 0)


def rows(values, bits, top_down):
    """Packs pixel values, top row first, into stored rows."""
    out = bytearray()
    order = range(HEIGHT) if top_down else range(HEIGHT - 1, -1, -1)
    for y in order:
        row = bytearray(stride(bits))
        for x in range(WIDTH):
            value = values[y * WIDTH + x]
            if bits < 8:
                bit = x * bits
                row[bit // 8] |= value << (8 - bits - bit % 8)
            else:
                row[x * bits // 8:(x + 1) * bits // 8] = value.to_bytes(bits // 8, 'little')
        out += row
    return bytes(out)


def save(name, data):
    path = os.path.join(OUT, name + '.bmp')
    with open(path, 'wb') as handle:
        handle.write(data)
    with Image.open(path) as image:
        rgba = image.convert('RGBA')
        assert rgba.size == (WIDTH, HEIGHT), name
        with open(os.path.join(OUT, name + '.rgba'), 'wb') as handle:
            handle.write(rgba.tobytes())


def by_pillow(name, image):
    path = os.path.join(OUT, name + '.bmp')
    image.save(path)
    with open(path, 'rb') as handle:
        save(name, handle.read())


def palette_bytes(entries, size=4):
    return b''.join(bytes([b, g, r]) + (b'\0' if size == 4 else b'') for r, g, b, _ in entries)


def main():
    os.makedirs(OUT, exist_ok=True)
    pixels = colours(WIDTH * HEIGHT)

    one = Image.new('1', (WIDTH, HEIGHT))
    one.putdata([rng.choice([0, 255]) for _ in range(WIDTH * HEIGHT)])
    by_pillow('pillow-1bit', one)

    indexed = Image.new('P', (WIDTH, HEIGHT))
    indexed.putpalette([channel for colour in colours(256) for channel in colour[:3]])
    indexed.putdata([rng.randrange(256) for _ in range(WIDTH * HEIGHT)])
    by_pillow('pillow-8bit', indexed)

    rgb = Image.new('RGB', (WIDTH, HEIGHT))
    rgb.putdata([colour[:3] for colour in pixels])
    by_pillow('pillow-24bit', rgb)

    # 32 bits under BI_RGB: Pillow reads the fourth byte as padding, as the editor does
    bgrx = rows([(r << 16) | (g << 8) | b | (0xff << 24) for r, g, b, _ in pixels], 32, False)
    save('rgb-32bit', file_header(54 + len(bgrx), 54) + info_header(32, 0, HEIGHT) + bgrx)

    palette16 = colours(16)
    values = [rng.randrange(16) for _ in range(WIDTH * HEIGHT)]
    data = rows(values, 4, False)
    save('indexed-4bit', file_header(54 + 64 + len(data), 54 + 64)
         + info_header(4, 0, HEIGHT, 16) + palette_bytes(palette16) + data)

    # a palette shorter than the bits allow, given by biClrUsed
    palette5 = colours(5)
    values = [rng.randrange(5) for _ in range(WIDTH * HEIGHT)]
    data = rows(values, 8, True)
    save('indexed-8bit-top-down-5-colours', file_header(54 + 20 + len(data), 54 + 20)
         + info_header(8, 0, -HEIGHT, 5) + palette_bytes(palette5) + data)

    data = rows([(r << 16) | (g << 8) | b for r, g, b, _ in pixels], 24, True)
    save('rgb-24bit-top-down', file_header(54 + len(data), 54) + info_header(24, 0, -HEIGHT) + data)

    # 16 bits: 5-5-5 under BI_RGB, 5-6-5 under BI_BITFIELDS with its masks after the header
    data = rows([((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3) for r, g, b, _ in pixels], 16, False)
    save('rgb-16bit-555', file_header(54 + len(data), 54) + info_header(16, 0, HEIGHT) + data)
    masks = struct.pack('<III', 0xf800, 0x07e0, 0x001f)
    data = rows([((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3) for r, g, b, _ in pixels], 16, False)
    save('rgb-16bit-565', file_header(66 + len(data), 66) + info_header(16, 3, HEIGHT) + masks + data)

    # OS/2's BITMAPCOREHEADER: 16-bit sizes and 3-byte palette entries
    palette = colours(256)
    values = [rng.randrange(256) for _ in range(WIDTH * HEIGHT)]
    data = rows(values, 8, False)
    core = struct.pack('<IHHHH', 12, WIDTH, HEIGHT, 1, 8)
    save('core-8bit', file_header(26 + 768 + len(data), 26 + 768) + core
         + palette_bytes(palette, 3) + data)

    # BITMAPV4HEADER with alpha, as the editor writes a picture with transparency
    translucent = colours(WIDTH * HEIGHT, alpha=True)
    data = rows([(a << 24) | (r << 16) | (g << 8) | b for r, g, b, a in translucent], 32, True)
    v4 = (info_header(32, 3, -HEIGHT, size=108)
          + struct.pack('<IIIII', 0xff0000, 0xff00, 0xff, 0xff000000, 0x73524742) + bytes(48))
    save('rgba-32bit-v4', file_header(122 + len(data), 122) + v4 + data)


if __name__ == '__main__':
    sys.exit(main())
