# Screen rendering performance research

Research date: 2026-09-06. Scope: the new Screen's browser presentation, pixel production, undo allocation, framebuffer reads, and scheduling. The first half of this note is the research pass, written from source inspection, primary sources, the Bad Apple data and an isolated CPU allocation probe, before anything had been measured in a browser. **[Measured, and what was implemented](#measured-and-what-was-implemented)** is the second pass, from 2026-09-06 as well: it holds the browser measurements, which candidates they justified, and which they refuted. Where the two disagree the measurements win, and the sentences the measurements refuted are marked where they stand.

The research pass expected the wins to be an opaque Canvas2D context and dirty-region `putImageData`. **Neither of those turned out to be worth anything**: canvas submission is never more than 0.9% of the wall clock in any workload measured. What the measurements found instead was that the yield between two slices was starving the browser of rendering, which cost more delivered frames than every pixel change in this note put together.

## What is already efficient

[ScreenRenderer.svelte](../../src/components/specific/project/screen/ScreenRenderer.svelte), particularly `paint()` around lines 86–120, already:

- Paints at most once per animation callback and skips unchanged `screen.version` values.
- Keeps the Canvas2D context and an `ImageData` wrapper, rebuilding the wrapper only for a changed array or dimensions.
- Passes `screen.visiblePixels` directly to `ImageData`, without copying into another application buffer.
- Uses one backing-store pixel per Screen pixel and CSS sizing plus `image-rendering: pixelated` for zoom.

The `ImageData` constructor really does retain the supplied typed array; this is specified behavior, not an assumption about a browser optimization. It does **not** make the later transfer into the canvas bitmap free. [WHATWG ImageData constructor](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#dom-imagedata)

Canvas bitmap dimensions and CSS display dimensions are separate. Resizing the bitmap resets its contents, which supports retaining the current arrangement where Svelte alone updates its width and height attributes. Adding another application pixel copy, recreating `ImageData` each frame, or enlarging the bitmap to match CSS zoom would add work to this design. [WHATWG canvas sizing](https://html.spec.whatwg.org/multipage/canvas.html#the-canvas-element)

## First experiment: request an opaque Canvas2D context

> **Measured and rejected.** An opaque context was 0.240 ms a whole-image submission against 0.259 ms for the default, which is inside the clock's own resolution; see [Canvas submission is not the cost](#canvas-submission-is-not-the-cost).

The current call is `canvas.getContext('2d')`. Benchmark creating that context with `{ alpha: false }`. The Screen represents 24-bit RGB, and its initialized pixels have alpha 255; `fillImage()` preserves that convention. An opaque context therefore matches the intended content. [Screen.ts](../../src/lib/languages/peripherals/screen/Screen.ts)

Mozilla recommends this flag when a canvas does not require transparency because the browser can optimize rendering. This is a credible low-effort candidate, not a guarantee of improvement on every device. [Mozilla canvas optimization guidance](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas#turn_off_transparency)

A concrete implementation example strengthens the case: Chromium revision `fe487bfab3b23b7a107987b0a2f7b65222ae7ae0` changes the pixel-write alpha type to opaque when the context has no alpha. Its `PutByteArray` comment describes obtaining memcpy behavior. This is a pinned source snapshot, not a claim about the user's installed Chrome release or measured performance. [Chromium Canvas2D implementation](https://chromium.googlesource.com/chromium/src/+/fe487bfab3b23b7a107987b0a2f7b65222ae7ae0/third_party/blink/renderer/modules/canvas/canvas2d/base_rendering_context_2d.cc#3095)

Context attributes are established on the first `getContext()` call. Comparing options requires fresh canvases; calling `getContext()` again on the running display will not change its attributes. [Chrome context-attribute explanation](https://developer.chrome.com/blog/desynchronized#there_can_be_only_one)

## Highest potential for sparse drawing: carry damage into presentation

> **Measured and rejected.** The whole-image submission this section proposes to avoid costs 0.16% to 0.93% of the wall clock, so the entire saving available is under one percent; see [Canvas submission is not the cost](#canvas-submission-is-not-the-cost).

The renderer currently calls `context.putImageData(image, 0, 0)` for every changed version. A single changed logical pixel therefore triggers a request to replace the whole bitmap. The API accepts source coordinates and dimensions for a dirty rectangle, limiting which pixels are painted. [WHATWG pixel manipulation](https://html.spec.whatwg.org/multipage/canvas.html#pixel-manipulation)

The natural first prototype is to accumulate visible damage between frames and use the seven-argument form with the same retained `ImageData`:

```ts
context.putImageData(image, 0, 0, dirty.x, dirty.y, dirty.width, dirty.height)
```

The dirty coordinates are inside the source image; keeping destination `dx` and `dy` at zero preserves the Screen's coordinates. Avoid allocating a cropped image just to submit the rectangle. [Mozilla putImageData reference](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData)

The pinned Chromium implementation clips the dirty source/destination rectangles and passes their dimensions and the original row stride into `WritePixels`. Its differing-bytes-per-pixel branch first converts a full image, so keeping the current matching 8-bit formats avoids introducing that particular conversion case. These details support testing dirty regions without promising proportional GPU or compositor savings. [Chromium putImageData implementation](https://chromium.googlesource.com/chromium/src/+/fe487bfab3b23b7a107987b0a2f7b65222ae7ae0/third_party/blink/renderer/modules/canvas/canvas2d/base_rendering_context_2d.cc#3048)

Proposed damage design, based on this repository:

- Reuse primitive bounds already calculated for `journalPatch`, but store damage independently of undo records: framebuffer mode bypasses journaling, and history may be disabled or evicted.
- Keep drawing damage separate from visible damage under double buffering. Drawing becomes visible only at `present()`. A conservative first version can mark the full display on `present()` while direct drawing gets precise regions.
- A later buffered version can accumulate drawing damage until `present()` and merge it into all visible damage still awaiting paint. Clearing drawing damage when the GUI paints would lose unpresented changes.
- Force a complete paint on initial mount, buffer/dimension replacement, reset, context restoration, and any undo operation whose damage is not known precisely. Acknowledging damage must not discard changes belonging to a newer version.
- Start with one bounding rectangle, then measure it against row spans or dirty tiles for dispersed updates. Two distant changed cells can make a union cover almost the entire display. Coalesce neighboring spans/tiles and fall back to one full upload for dense damage; avoid one browser call per pixel or primitive. Choose thresholds from measurements of area **and** call count.

These are implementation proposals, not existing behavior or measured results. Relevant local boundaries are `markDrawn()`, `markVisible()`, `present()`, `syncFramebuffer()`, and `journalPatch()` in [Screen.ts](../../src/lib/languages/peripherals/screen/Screen.ts). The current changed-cell Bad Apple workload is particularly useful for comparing union rectangles with multiple coalesced regions; changing that program to draw only changed cells is already underway and is not a new recommendation here.

For scale, a 640 × 480 RGBA8 frame contains 1,228,800 bytes. At 60 full paints per second, that is 73.7 MB/s of logical source pixel payload before other copies or compositing. A 30 × 30 patch contains 3,600 bytes. These are arithmetic counts, not measured memory traffic, latency, or an expected speedup.

Read-only analysis of the current [`examples/m68k/bad-apple.x68`](../../examples/m68k/bad-apple.x68) parsed its 6,526 frames of 256 bytes and compared each frame with the preceding cell image, initially black. There are 5,638 changed frames, averaging 8.013 changed cells over all frames, or 9.275 per changed frame. Its 30 × 30 cells yield the following ideal source pixel areas:

| Submission strategy                         | Average pixel bytes per changed guest frame |
| ------------------------------------------- | ------------------------------------------: |
| Current whole 640 × 480 image               |                                   1,228,800 |
| One bounding rectangle around changed cells |                                     328,209 |
| Separate exact changed cells                |                                      33,390 |

The last row requests about 36.8 times fewer pixel bytes than the whole image, but would require about 9.3 calls on average before coalescing. A union requests about 3.74 times fewer. Neither ratio predicts rendering speed: browser call overhead, browser damage handling, and multiple guest frames coalescing into one animation callback all matter. Initial paint is necessarily full; this calculation covers changes in the video data. These figures support comparing coalesced spans/tiles with the simpler union.

## Flags and architectural changes to avoid adopting blindly

| Candidate                                      | Evidence and relevance                                                                                                                                                                                                                                                                                                                                                       | Recommendation                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `willReadFrequently: true`                     | The flag requests readback optimization and can favor a software canvas. This renderer never calls `getImageData`; the model's `getPixel` reads its own array. [WHATWG canvas settings](https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-will-read-frequently), [Chrome Canvas2D guidance](https://developer.chrome.com/blog/canvas2d#will_read_frequently) | Keep the current default initially. It may be worth an explicit hardware/browser comparison, but it is not a generic optimization for writing pixel arrays.                                                                                                 |
| `desynchronized: true`                         | Chrome describes bypassing parts of the compositor queue to lower latency and notes possible tearing and flicker. [Chrome low-latency canvas](https://developer.chrome.com/blog/desynchronized)                                                                                                                                                                              | Consider only if measured input-to-display latency remains the problem and those visual tradeoffs are acceptable. It does not remove emulator work or make `putImageData` intrinsically cheap.                                                              |
| Additional offscreen canvas on the main thread | The existing Screen already owns the CPU bitmap, so copying it into another canvas before copying it onscreen adds a presentation stage by construction.                                                                                                                                                                                                                     | No reason to add this stage without a measured advantage or a new rendering requirement.                                                                                                                                                                    |
| WebGL texture presentation                     | WebGL supports uploading typed-array pixel regions through `texSubImage2D`. [Khronos WebGL specification, editor's draft](https://registry.khronos.org/webgl/specs/latest/1.0/#5.14.8)                                                                                                                                                                                       | A possible later prototype: retain a texture, update changed regions, draw a nearest-filtered quad. CPU-produced pixels still require transfer, and this introduces shader/resource/context-loss handling. No evidence yet that this is the limiting stage. |

## Workers and OffscreenCanvas: useful when ownership moves with the work

OffscreenCanvas allows Canvas2D rendering in a worker. A canvas transferred using `transferControlToOffscreen()` can display the worker's drawing directly, freeing main-thread time for UI work. [Google OffscreenCanvas guide](https://web.dev/articles/offscreen-canvas)

Moving only the current `putImageData()` call to a worker requires getting each changed Screen image there. Cloning pixel arrays adds copying; transferring an `ArrayBuffer` detaches it from the sender. The Screen currently retains and mutates that array, so transferring its live buffer would invalidate its existing ownership assumptions. [Mozilla transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)

An implementation proposal would therefore need one of: worker ownership of Screen/emulation, a pool of transferable presentation buffers, or another explicit snapshot protocol. Include synchronization, copying, stale-frame handling, and input round trips in the benchmark. If the actual bottleneck is main-thread emulation or history allocation, moving only canvas submission leaves that work on the main thread.

Transfer must also happen before the HTML canvas has acquired a rendering context, so this cannot be bolted onto an already initialized `context` in the existing component. [Mozilla transferControlToOffscreen exceptions](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen#exceptions)

## Browser validation to choose the next change

Use a browser performance trace of a real editor run. Chrome's Performance panel exposes main-thread activity, raster/GPU activity, frame duration, and dropped frames; its FPS meter also reports dropped/partially presented frames. These distinguish a responsive producer from actual displayed frames. [Chrome Performance reference](https://developer.chrome.com/docs/devtools/performance/reference)

Suggested experiment sequence, after current code changes settle:

1. Establish a baseline for a static screen, sparse nearby cell updates, dispersed changed cells, scrolling text, and dense full-frame animation. Keep screen dimensions, zoom, history settings, and machine/browser fixed.
2. Compare default context against opaque context on fresh canvases, then compare full paints against dirty union and coalesced regions independently.
3. Record paint-call duration and total browser frame behavior separately; report p50/p95 values, submitted pixel area and call count, allocation/GC activity, dropped frames, and program throughput. Do not treat a version increment or a completed `putImageData()` call as proof a physical frame was displayed.
4. Try a renderer-only replay of representative pixel frames to isolate presentation from emulation. Keep the end-to-end run as the deciding benchmark.
5. Repeat worthwhile candidates in supported Chrome, Firefox, and Safari environments, including a slower target machine. Do not add `getImageData()` readbacks to the timed rendering path merely to verify pixels; validate output outside the timing run.

No browser trace, browser benchmark, build, development server, or application code change was performed for this research. The isolated CPU probe below measured allocation counts; proposed browser speedups remain hypotheses.

## Producer, history, and scheduling findings

These findings come from the local implementation inspected on 2026-09-06. The working tree was changing during the investigation; function names are the stable references. No application source, example, dependency, build output, or existing documentation was changed by this research. The only repository addition is this note. The CPU probe ran separately under Node; it did not start or attach to the running app.

### The existing animation measurements exclude canvas painting

[`animation.measure.ts`](../../src/lib/languages/measurements/animation.measure.ts) measures intervals between program waits and counts presentations. [`startFakeRenderer`](../../src/lib/languages/measurements/harness.ts) uses a timer to call `markPainted()`; it neither creates a canvas nor calls `putImageData`. The [recorded frame pacing](./screen-peripherals.md#frame-pacing) is useful producer-side evidence, but it is not measured browser FPS. A browser trace must distinguish CPU production, time waiting to paint, canvas submission, raster/compositor work, and actual frame delivery. Chrome's [Performance reference](https://developer.chrome.com/docs/devtools/performance/reference) documents the Frames track and Bottom-up aggregation used for this diagnosis.

### Undo snapshots are a concrete allocation target

[`Screen.journalPatch`, `copyRegion`, `clear`, and `present`](../../src/lib/languages/peripherals/screen/Screen.ts) copy the previous pixels for every drawing operation. Whole-image snapshots still run through a row loop, creating one temporary `subarray` view per row. Those views do not copy the row data themselves; the subsequent `set` copies it into the allocated snapshot.

A separate Node v24.18.1 process imported the existing Screen source without modifying it and wrapped `copyRegion` only in that process to count copied bytes and row iterations. At 640 × 480, with double buffering and a repeated clear → 20 × 20 ellipse → present sequence, the probe observed:

| Metric per synthetic frame            | 64 MiB history budget | Zero history budget |
| ------------------------------------- | --------------------: | ------------------: |
| Snapshot pixel bytes allocated/copied |             2,459,364 |           2,459,364 |
| Snapshot allocations                  |                     3 |                   3 |
| Temporary row views created           |                   981 |                 981 |
| Retained history after the run        |      66,408,012 bytes |             0 bytes |

Method: ten warmup frames, then 90 counted frames; no Core execution, guest waits, DOM, or canvas. `copyRegion` counts exclude additional bookkeeping objects. Allocation counts are the useful result; this is not an end-to-end performance comparison. The scratch probe is `/tmp/screen-rendering-research/probe.mjs` for this session.

A full image is 1,228,800 bytes. Clear and present alone therefore allocate 2,457,600 snapshot bytes per guest frame, or 147,456,000 bytes/s at a hypothetical 60 guest frames/s. This is an allocation-volume calculation, not a measured bandwidth limit. `present` also copies drawing pixels into the visible image.

Recommended experiments, preserving Undo:

- ~~Give `copyRegion` a contiguous full-width/full-image path instead of copying 480 rows separately.~~ **Measured and rejected:** the row loop is 0.320 ms for a whole 640 × 480 image and one `slice()` of the same bytes is 0.346 ms, so the row views cost nothing worth removing. `pasteRegion` can use the equivalent path during Undo. This removes temporary row views and repeated calls, while keeping the same snapshot bytes.
- When history is explicitly disabled, avoid pixel snapshot allocation before it happens. Setting the budget to zero currently allocates and then evicts. Preserve the journal's sequence/counting contract, compound boundaries, and the rule that unavailable history blocks Undo; simply returning early from every journal method is not a complete design. Likewise, Core history disabled and Screen history disabled are currently separate settings.
- For enabled history, consider pooled snapshot buffers and/or patches for changed regions at `present`, if profiling shows allocation or copying dominates. Do not recycle any buffer retained by a live record or currently used by the Screen after Undo.
- Profile [`ScreenHistory.evict`](../../src/lib/languages/peripherals/screen/ScreenHistory.ts) after the history fills, especially with many tiny pixel/color records. It calls `shift()` on two arrays. A deque or indexed head can make eviction predictable; release removed references. Do not assume every engine always performs a linear move: [V8's implementation](https://github.com/v8/v8/blob/main/src/builtins/array-shift.tq) has both element-moving and runtime paths.

A plain drawing/visible pointer swap is not a drop-in optimization for `present`: current presentation leaves the drawing image containing the newly presented pixels, so subsequent partial drawings build on them. A swap without maintaining that invariant changes program-visible output. See [ADR 0006](../adr/0006-screen-double-buffering.md).

### Bulk pixel writes can reduce CPU rasterization work

[`fillImage`, `rectangle`, `ellipse`, and `paint`](../../src/lib/languages/peripherals/screen/Screen.ts) use scalar JavaScript pixel loops. Rectangle filling calls `paint` for every pixel, repeating clipping, offset calculation, and RGB extraction. Rectangle/ellipse loops also traverse off-screen coordinates and rely on `paint` to discard them.

Proposed experiments:

- **Adopted.** Retain a `Uint32Array` view over the same RGBA buffer, and benchmark word fills for clears and contiguous rectangle spans. Extract the color once per primitive and clip fill bounds once. [ECMAScript specifies typed-array fill and shared-buffer view semantics](https://tc39.es/ecma262/multipage/indexed-collections.html#sec-%typedarray%.prototype.fill); faster execution here remains a hypothesis until compared in the target browser.
- Keep byte order correct: RGBA bytes require a host-endian-aware packed word, not writing the existing `0xRRGGBB` color directly. Refresh views whenever resize, reset, buffering, or Undo replaces arrays.
- For ellipses, restrict iteration to pixels that can affect the image, including wide-pen overhang. Consider span filling only after preserving the current pixel-center and border rules. Naive endpoint clipping can change Bresenham's pixel pattern, so line clipping needs special care.

For the current Bad Apple example, these are supporting improvements: it already skips unchanged cells. Broadly replacing exact software primitives with Canvas paths could change the integer pixel output and introduce canvas readback into `getPixel` and Undo.

### Keep animation responsiveness separate from the instantaneous dirty flag

[`GenericEmulator.runSlices` and `sliceTimeBudgetMs`](../../src/lib/languages/GenericEmulator.svelte.ts) choose the budget at slice entry. [`ExecutionSlice.ts`](../../src/lib/languages/ExecutionSlice.ts) defines 16 ms for a watched dirty Screen and 50 ms otherwise. After the renderer clears dirty, a program can receive the 50 ms budget and start drawing again inside that slice; double-buffered drawing also stays invisible until presentation. This is a plausible source of uneven frames for drawing loops without guest waits, not proof of the current user's bottleneck.

A 60 Hz refresh interval is only about 16.7 ms for the entire browser pipeline. The browser also needs time outside JavaScript; Google's [rendering guidance](https://web.dev/articles/rendering-performance) recommends leaving headroom. Thus a 16 ms uninterrupted compute slice does not itself ensure smooth 60 Hz output, and 120 Hz leaves about 8.3 ms total.

**Adopted.** Experiment with a short recent-graphics activity window that retains the animation budget across `markPainted`, plus an initial 4–8 ms graphics slice budget at 60 Hz. Tune from browser traces and instruction throughput, rather than treating those numbers as universal constants. Return to the compute budget once graphics activity subsides. Account for refresh rate, hidden/closed panels, and damage raised inside an already-running slice. Keep the guest wait semantics and the existing Stop responsiveness contract. ~~`scheduler.yield()` is already feature-detected, so adding it again is not an optimization.~~ **Refuted:** `scheduler.yield()` was the single largest cost measured. It hands the continuation back ahead of the browser's own rendering, which held the page to about 9 frames a second for the whole of any run; see [The yield between two slices was starving the browser](#the-yield-between-two-slices-was-starving-the-browser).

### Preserve sparse changes across the MIPS/RISC-V memory bridge

[`MarsDevices.observeFramebuffer`, `flush`, and `readInto`](../../src/lib/languages/mars/MarsDevices.ts) accumulate a single minimum/maximum dirty word interval, re-read that interval from the Core, assemble colors, then call `Screen.syncFramebuffer`. Two widely separated writes can cause most of the intervening image to be read and converted. Drawing dirty rectangles only at the canvas cannot recover this upstream work.

For sparse large framebuffers, benchmark dirty row spans, tiles, or a small merged range list across the entire path: observer → Core memory reads → RGBA conversion → canvas. Bound the number of Core calls and switch to larger merged/full ranges for dense changes. Keep flush-before-sleep and full resynchronization on Undo/configuration. This is most relevant to MIPS/RISC-V; Bad Apple uses M68K drawing traps.

## What to measure next

Use a browser Performance recording of the current implementation before making changes. Record a settled 10–20 second interval, then a longer run that reaches history eviction. Exercise Bad Apple, a full-clear/present animation, sparse distant framebuffer writes, and a drawing loop without waits. Compare normal and expanded panel sizes on the target browser/device.

Measure actual frame intervals and dropped frames; main-thread slice lengths; `paint`/`putImageData`; raster/compositor time; `copyRegion`, `fillImage`, rectangle/ellipse work, `readMemoryBytes`; and garbage collection. Keep guest wait time separate from CPU time. Count changed pixels and rectangles per browser paint. Existing synthetic frame rates should remain labelled as such.

Prioritize based on the trace: dirty uploads for sparse presentation cost, snapshot/bulk-fill changes for CPU and GC cost, scheduling changes for delayed frames despite cheap painting, and worker ownership only when sustained main-thread contention justifies it. Validate pixel equivalence, clipping, resize, reset, double buffering, and instruction-aligned Undo for any later implementation.

---

# Measured, and what was implemented

2026-09-06, the second pass. Everything above this line was written before anything had been measured in a browser; everything below it is measurement, and it is what the implementation followed.

## How these numbers were taken

The built app (`npm run build`, `vite preview`) driven over the DevTools protocol in the Playwright-cached `chrome-headless-shell-1234`, on `/projects/share?project=…`, at 1600 × 900, one workload per fresh tab: navigate, Build, Run, three seconds of warm-up, ten seconds of measurement, Stop. Two runs of every workload, and the tables give both.

What each number means:

- **Delivered screen frames/s** — calls to `putImageData` that actually happened, counted by a wrapper installed on `CanvasRenderingContext2D.prototype` before the app's own scripts. The renderer paints only when `screen.version` moved, so this is the number of frames of the program that reached the canvas, not the number the program produced.
- **Browser frames/s** — `requestAnimationFrame` callbacks, which is the browser's own frame delivery.
- **Main thread busy** — `Performance.getMetrics`' `TaskDuration` over the window, as a percentage of it. It counts nested tasks more than once, so treat it as a load index rather than a duty cycle.
- **Long tasks** — `PerformanceObserver` entries over 50 ms, the ones that cost the page a frame.
- **Where the time goes** — `Profiler.start` at a 200 µs sampling interval. The production bundle is minified, so the names are the minified ones; `fillImage` survives as `J` in `DpfhWv1T.js` (its body is the byte-store loop, checked in the bundle) and `copyRegion`, `syncFramebuffer` and `readInto` keep their names.

Limits worth stating plainly. This is one machine, one browser, and a headless shell that rasterizes in software: the absolute cost of a canvas submission on a GPU-backed desktop browser will differ, and the conclusion drawn from it — that submission is a rounding error next to everything else — has that much room in it. `performance.now()` is clamped to 100 µs in a page like this one, so a single `putImageData` timing is a bucket, not a value. Neither Firefox nor Safari nor a slower machine was tried. Two of the workloads are programs written for the measurement rather than shipped examples, and they are marked as such.

The workloads:

| Workload                          | What it exercises                                                                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/m68k/bouncing-ball.x68` | double-buffered clear, filled ellipse, present at 640 × 480, paced by a 20 ms guest wait                                                                                                                                                  |
| `examples/z80/bouncing-ball.z80`  | the same shape at 256 × 192, paced by the host's frame                                                                                                                                                                                    |
| `examples/mips/bouncing-ball.asm` | the memory-backed framebuffer, 128 × 128 words, 16 ms sleep                                                                                                                                                                               |
| m68k drawing loop, no wait        | the bouncing ball with its delay trap deleted: a program that draws as fast as the host lets it. Written for the measurement                                                                                                              |
| m68k sparse cells                 | nine scattered 30 × 30 filled rectangles a frame at 640 × 480, 30 frames a second — Bad Apple's drawing shape without its 3.4 MB of video data, so the measurement does not depend on an uncommitted example. Written for the measurement |
| mips sparse framebuffer           | two words a frame at opposite ends of a 256 × 256 word grid: the worst case for the single dirty interval `MarsDevices` keeps. Written for the measurement                                                                                |

`examples/m68k/bad-apple.x68` was **not** measured. It exists only in the working tree, and its 3.4 MB source never finished loading into the editor in the headless shell within five minutes; the sparse-cells program stands in for its drawing shape. Nothing in this section depends on it.

## Canvas submission is not the cost

A renderer-only replay, with no emulator and no app: a 640 × 480 `ImageData` submitted to fresh canvases once an animation frame, 240 frames a strategy after 30 warm-up frames.

| Submission                                       |      p50 |      p95 |     mean |
| ------------------------------------------------ | -------: | -------: | -------: |
| default context, whole 640 × 480 image           | 0.200 ms | 0.500 ms | 0.259 ms |
| opaque context (`{ alpha: false }`), whole image | 0.200 ms | 0.400 ms | 0.240 ms |
| opaque, one 480 × 330 union rectangle            | 0.200 ms | 0.300 ms | 0.160 ms |
| opaque, nine 30 × 30 dirty rectangles            | 0.000 ms | 0.100 ms | 0.049 ms |
| opaque, one 30 × 30 dirty rectangle              | 0.000 ms | 0.100 ms | 0.027 ms |

And in the whole app, the share of the wall clock spent inside `putImageData`, across every workload and both before and after this work: **between 0.16% and 0.93%**, never higher.

So the two candidates the research pass put first are both rejected:

- **Dirty-rectangle uploads.** The most a perfect damage model could save is the difference between the first row and the fourth, 0.19 ms a frame, which on the sparsest workload measured (29 frames a second) is 5.7 ms/s, or 0.6% of the wall clock. Against that: damage has to be tracked through double buffering, where drawing damage only becomes visible at `present`; through Undo, which can restore an arbitrary region; through `syncFramebuffer`, resize and reset; and it has to be acknowledged without losing a change belonging to a newer version. The design sketched above is sound, and it is not worth its own correctness risk for six tenths of a percent.
- **An opaque context.** 0.240 ms against 0.259 ms is a 7% difference on a number whose own clock resolution is 0.1 ms. Mozilla's advice stands and the flag may well pay on other hardware, but nothing here measured a gain, so nothing here justifies changing how the canvas composites.

Workers and WebGL were not prototyped. Both were conditional on canvas submission being the limiting stage, and it is not: the stage they would move is under one percent of the wall clock.

## Where the time actually goes

Sampling profiles of the baseline, self time per second of wall clock:

| Workload                   | Hottest, in order                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| m68k drawing loop, no wait | `fillImage` 154 ms/s, `copyRegion` 94 ms/s, garbage collector 17 ms/s, `putImageData` 2 ms/s                                               |
| m68k bouncing ball         | `getBoundingClientRect` 48 ms/s, `copyRegion` 43 ms/s, `fillImage` 32 ms/s, garbage collector 14 ms/s                                      |
| m68k sparse cells          | the Svelte runtime, about 120 ms/s across its hottest frames; `getBoundingClientRect` 21 ms/s; no Screen function in the top fourteen      |
| mips sparse framebuffer    | the MIPS Core's `wasm-bindgen` glue, 471 ms/s across eight frames — 47% of the wall clock; `syncFramebuffer` 5.7 ms/s, `readInto` 5.2 ms/s |

Two things fall out of that table. The Screen's own pixel loops are the top of the profile only for a program that draws without waiting. And `getBoundingClientRect` and the Svelte runtime, which have nothing to do with pixels, are near the top of two of the four — that is the adapter refreshing the register, memory, call-stack and history panels once per Core interrupt, which a graphical program reaches a few hundred times a second.

## The yield between two slices was starving the browser

The largest finding, and it was not in the research pass at all.

`yieldToHost` called `scheduler.yield()`. Its whole purpose is to hand the continuation back ahead of other queued work — and the browser's own rendering is other queued work. A loop that burns a slice and yields, with nothing else on the page:

| Yield                   | 16 ms slices                                         | 50 ms slices                        |
| ----------------------- | ---------------------------------------------------- | ----------------------------------- |
| `scheduler.yield()`     | 0.210 ms a yield, 1.3% overhead, **8.9 browser fps** | 0.528 ms, 1.0%, **9.6 browser fps** |
| `setTimeout(0)`         | 4.289 ms, 21.1%, 60.0 browser fps                    | 4.150 ms, 7.7%, 41.6 browser fps    |
| `MessageChannel` post   | 0.790 ms, 4.7%, 59.6 browser fps                     | 0.870 ms, 1.7%, 19.7 browser fps    |
| `requestAnimationFrame` | 0.786 ms, 4.7%, 59.6 browser fps                     | 0.880 ms, 1.7%, 19.7 browser fps    |

Nine frames a second, for the whole of any run, however short the slices are. Ordinary tasks are starved the same way: a `Runtime.evaluate` sent to a page running the no-wait drawing loop did not come back for over a minute, while a synthetic click on Stop was answered in 37 ms — input outranks both, which is why ADR 0007's Stop contract never noticed. Phase 8 measured under node, which has no `scheduler.yield()` and falls back to the timer, so its numbers could not have shown this.

End to end on the no-wait drawing loop, same build, only the yield changed:

| Yield                   | Delivered screen frames/s | Browser frames/s |
| ----------------------- | ------------------------: | ---------------: |
| `scheduler.yield()`     |                       8.2 |              9.7 |
| `setTimeout(0)`         |                      28.0 |             35.3 |
| `MessageChannel` post   |                      35.2 |             37.1 |
| `requestAnimationFrame` |                      36.7 |             38.3 |

**Adopted: a posted message.** `setTimeout` is out because a timer scheduled from a timer callback is clamped to about 4 ms once it is a few deep, which is 21% of a 16 ms slice. `requestAnimationFrame` was the fastest by a hair but ties every run to the display: a hidden or occluded tab stops producing frames, and a compute-only run would stop with it. A posted message keeps the run going at 0.8 ms a yield — 0.7 percentage points more of a 50 ms slice than `scheduler.yield()` cost, well inside the five percent ADR 0007 budgets — and lets the browser draw. Node keeps the timer: it has no clamping problem, and a `MessagePort` would hold the process open under vitest and the measurement harness.

## The dirty flag was too instantaneous

`sliceTimeBudgetMs` asked for the 16 ms animation slice while `screen.dirty` was set. The renderer clears that flag the moment it paints, so the very next slice of a program that keeps drawing was handed the 50 ms compute budget and spent all of it on frames nothing could show until it came back.

**Adopted:** the budget now follows a 200 ms window since the last change to `screen.version`, which is what a renderer already compares and which moves whether or not anybody has painted yet. Measured with the posted-message yield in place, only the window removed:

| Workload                   |   Instantaneous dirty flag |         200 ms activity window |
| -------------------------- | -------------------------: | -----------------------------: |
| m68k drawing loop, no wait |   16.1 fps, 165 long tasks |     **38.0 fps, 0 long tasks** |
| m68k bouncing ball         | 27.5 fps, 51.4 browser fps | **40.6 fps, 59.9 browser fps** |
| m68k sparse cells          |                   28.6 fps |                       29.1 fps |

The two changes only pay together: with `scheduler.yield()` still in place the window changed nothing at all, because the frames it made room for were being starved anyway.

## Bulk pixel writes

**Adopted.** `fillImage`, the interior of a filled rectangle, the row a text scroll leaves behind and the framebuffer sync now write through a `Uint32Array` view of the same RGBA buffer, one word a pixel. The view is built where it is used rather than kept beside the image, so a resize, an Undo or a buffering change cannot leave a stale one behind, and `packColor` is host-endian-aware because a typed-array view uses the host's byte order and the images are RGBA in memory order.

Primitives, node v24.18.1, against the byte loops they replace:

| Operation                        |   Before |    After |       |
| -------------------------------- | -------: | -------: | ----: |
| `fillImage`, 640 × 480           | 1.012 ms | 0.051 ms | 19.9× |
| filled rectangle 300 × 300       | 257.5 µs |  18.2 µs | 14.2× |
| filled rectangle 64 × 64         |  11.5 µs |   2.1 µs |  5.5× |
| filled rectangle 30 × 30         |  2.67 µs |  0.89 µs |  3.0× |
| filled rectangle 16 × 16         |  1.25 µs |  0.51 µs |  2.5× |
| filled rectangle 8 × 8           |  0.29 µs |  0.42 µs |  0.7× |
| `syncFramebuffer`, 307 200 words | 1.745 ms | 1.103 ms |  1.6× |

The rectangle numbers include the view allocation and the clipping the row fills do once. A rectangle smaller than about 12 pixels a side is slightly slower than the old double loop — 0.13 µs on an 8 × 8 — and no threshold was added for it: the absolute cost is a tenth of a microsecond and a constant chosen to avoid it would have to be justified too.

**Not adopted: a packed word for single pixels.** Routing `paint` through the same word store is only 1.13× (0.92 ms against 0.82 ms for 100 000 scattered pixels), because the bounds check dominates, so lines, glyphs, ellipse borders and flood fill keep the byte stores.

Whole synthetic frames, from the same isolated CPU probe the research pass used (`/tmp/screen-rendering-research/probe.mjs`), median of three runs:

| Synthetic frame                                           |   Before |    After |      |
| --------------------------------------------------------- | -------: | -------: | ---: |
| 640 × 480 clear, 20 × 20 ellipse, present; 64 MiB history |  1.99 ms |  1.09 ms | 1.8× |
| the same with the history budget at zero                  |  1.30 ms |  0.59 ms | 2.2× |
| eight changed 30 × 30 cells                               | 0.117 ms | 0.096 ms | 1.2× |

That is a CPU measurement, not a frame rate: on its own, in the browser, this change moved the m68k bouncing ball from 31.7 to 32.1 delivered frames a second and the no-wait drawing loop from 8.4 to 8.7, because both were then bounded by scheduling and not by pixels. It is worth keeping for the CPU it gives back — a fifth of the wall clock of the drawing loop was `fillImage` — but it is not where the frames came from.

## Undo allocation

**Nothing adopted.** `copyRegion` is 94 ms/s on the drawing loop and 43 ms/s on the bouncing ball, which is real, but the contiguous path the research pass proposed does not help: 0.320 ms for a whole 640 × 480 image through the row loop against 0.346 ms for one `slice()` of the same bytes. V8's `set` over a subarray is already a `memmove`, and what the 2.4 MB a frame actually costs is the allocation, not the copying. The garbage collector is 14 to 17 ms/s across the graphical workloads, one to two percent of the wall clock.

A snapshot pool would attack the allocation, and it was left alone: the records it would recycle are owned by the journal, but `apply` hands an `images` record's array straight to the live Screen, so a pool has to know which buffers are still reachable, and one to two percent of the wall clock does not pay for that. `ScreenHistory.evict`'s `shift()` never appeared in a profile.

## The MIPS and RISC-V framebuffer bridge

**Measured, not implemented, and worth doing next.** `MarsDevices` keeps one minimum/maximum dirty word interval, so a program that writes two words at opposite ends of its grid has the whole grid re-read from the Core and converted. Measured on a program written for it — two words a frame on a 256 × 256 word grid, sleeping 16 ms, so it should reach 60 frames a second: **29 delivered frames a second, with 47% of the wall clock inside the Core's `wasm-bindgen` memory-read glue** turning 262 144 bytes into a JavaScript array, once a frame.

The fix is the one the research pass sketched: mark fixed-size blocks of words dirty in the observer instead of a single interval, and flush each contiguous run of blocks separately, collapsing to one span when there are more runs than a small cap. At 256 words a block the sparse case above would re-read 512 words instead of 65 536.

It was left out because no shipped example triggers it: `mips/bouncing-ball.asm` erases and redraws adjacent cells and already runs at 56 frames a second, and `bitmap-tour.asm` writes the whole grid, where the current behaviour is exactly right. The only evidence is a program written to expose the case, the change is in the memory bridge both MIPS and RISC-V depend on, and a bug there is wrong pixels. Recorded here with its measurement so the decision is cheap to revisit.

## What was implemented, end to end

Same commit, same machine, same headless shell; two runs of each, both given.

| Workload                   | Delivered screen frames/s   | Browser frames/s | Main thread busy | Long tasks |
| -------------------------- | --------------------------- | ---------------- | ---------------- | ---------- |
| m68k bouncing ball         | 31.8, 31.2 → **40.8, 40.3** | 59.9 → 59.9      | 75% → 47%        | 0 → 0      |
| m68k drawing loop, no wait | 8.6, 8.5 → **38.1, 37.9**   | 10.1 → 39.7      | 126% → 126%      | 86 → **0** |
| m68k sparse cells          | 13.0, 12.6 → **29.0, 29.1** | 44.9 → 59.9      | 92% → 34%        | 42 → **0** |
| z80 bouncing ball          | 58.3 → 58.2                 | 60.0 → 59.9      | 10.2% → 8.2%     | 0 → 0      |
| mips bouncing ball         | 56.4 → 56.6                 | 59.9 → 59.9      | 13.9% → 13.1%    | 0 → 0      |
| mips sparse framebuffer    | 28.6 → 29.9                 | 59.9 → 59.9      | 70% → 68%        | 0 → 0      |

The two examples that already ran at the display's rate stayed there and got cheaper. The three that did not gained between 1.3× and 4.4× the frames the user actually sees, and every task over 50 ms is gone.

The fourth change in that table is not a rendering change at all. `M68KEmulator` refreshed the registers, the memory pages, the call stack and the undo history on **every** Core interrupt; a graphical program reaches one a few hundred times a second, and nothing it writes can be seen more than sixty times a second. `GenericEmulator.refreshRunningPanels` now rate-limits that to one display frame, forced for the interrupts that stop to ask the user something. On the bouncing ball alone it is 31.5 → 40.6 frames a second and 75% → 47% of the main thread; on the sparse-cell program it is 118% → 34%. It is called out separately in the status record, because it changes how often a panel is read rather than how a pixel is drawn.

## Pixel output is unchanged

Every change above had to leave the image identical. The four programs that paint a fixed picture were run in the built app before and after, and their canvases hashed outside the timed runs:

| Program                  | Canvas    | Hash, before and after |
| ------------------------ | --------- | ---------------------- |
| `m68k/graphics-tour.x68` | 640 × 480 | `7bd0baa9`             |
| `mips/bitmap-tour.asm`   | 256 × 256 | `e8853fc5`             |
| `z80/mouse-paint.z80`    | 256 × 192 | `e4ea9dc5`             |
| `m68k/keyboard-move.x68` | 640 × 480 | `454ffea5`             |

The bulk-write rewrite also preserved the Screen journal byte for byte: a differential script ran the
Screen from before this work and the current Screen through 25 checkpoints at both 64 × 64 and a
non-word-row-width 37 × 21, including clipped fills, scrolling, double buffering, framebuffer
sync, resize and every retained Undo, with identical visible and drawing images throughout. The
MIPS memory-backed path retraced 90 stepped images exactly after re-reading Core memory.

`graphics-tour.x68` did **not** retrace one canvas image per Core instruction, contrary to the
sentence this paragraph replaced. That is the known direct-drawing limitation recorded in phase 3:
the Cores expose neither an instruction count at a Screen operation nor an Undo-depth key the two
histories can share, so sparse Screen records rewind ahead of intervening non-drawing Core steps and
re-converge at the next drawing step. The performance change did not alter that behavior. Pause
froze the image and Resume moved it again; Stop cleared the Screen to a canvas with no non-zero byte
in it.

# The journal, 2026-09-12

A second round, six days after the first. The first round found that canvas submission is a
rounding error and that what cost delivered frames was the yield between two slices; it left
`copyRegion` in the profile at 94 ms/s on the no-wait drawing loop and decided a snapshot pool was
not worth its correctness risk. Re-profiled on the branch as it stands, **`copyRegion` is 304 ms/s
on that workload — 30% of the wall clock, more than the M68K Core itself at 27%** — so the decision
was worth revisiting. `putImageData` is still under 1%.

Same method as the first round: `npm run build`, `vite preview`, the Playwright
`chrome-headless-shell`, one workload per fresh tab, 3 s warm-up and 10 s measured. This machine
was doing other work throughout, so the fps numbers move a few percent between runs; the profile
shares are the stable part, and the node measurements below are the ones to compare across the
change.

## Where the journal was spending it

Three things, all in [`Screen.ts`](../../src/lib/languages/peripherals/screen/Screen.ts):

- **`clear` and `present` copied a whole image to record it.** A 640 × 480 double-buffered frame
  allocated and copied 2.4 MB before it drew anything, on top of the 1.2 MB fill and the 1.2 MB
  present copy it actually needed.
- **`drawPixel` journaled a 1 × 1 `patch`**: a four-byte `Uint8ClampedArray`, a patch object, a
  record and a thirteen-field state snapshot, per pixel. `RECORD_OVERHEAD_BYTES` accounts that at
  64 bytes; 800 000 plotted pixels accounted as 54 MB and cost **651 MB of real heap**, so the
  budget did not bound what it claims to bound.
- **A history budget of zero bought nothing.** `journal` built the record, `copyRegion` included,
  and `ScreenHistory.push` evicted it on arrival.

## What was changed

- **Whole-image operations journal by transfer.** `clear` and `present` hand the journal the image
  they are replacing and take a new one, instead of copying. Safe because `apply` reads a `patch`
  record through `pasteRegion`, which copies out — an `images` record, whose arrays `apply` adopts,
  is left alone.
- **The images the budget drops are recycled.** `ScreenHistory` now takes an `onEvicted` callback,
  and the Screen keeps up to `MAX_SPARE_IMAGES` full-size buffers from it. Only evicted records
  are offered: a record `pop` returns is being undone and its pixels are still being read. Without
  this the transfer was a wash in the browser — a fresh 1.2 MB allocation has to be zeroed, which
  measured as expensive as the copy it replaced, `newImage` taking 145 ms/s on the no-wait loop.
- **A single pixel is journaled as a packed number**, a new `pixel` record kind.
- **The state snapshot is shared between records while nothing scalar has changed**, decided by
  comparing the fields rather than by invalidating from each setter, so a scalar that grows a new
  way of changing cannot leave a record holding a state the Screen was never in.
- **A budget of zero skips the pixels**, journaling a `none` instead. The record is still pushed:
  `sequence` and `depth` are what `ScreenInstructionHistory` reads to decide the Screen cannot be
  rolled back, and a Screen that stopped counting would let a CPU Undo run against an image that
  stayed where it was.

## Measured, node v24.18.1

A 640 × 480 double-buffered frame, `clear` + filled ellipse + `present`, 400 frames after 40 warm-up:

| Frame                            |         mean |      p50 |          p95 |
| -------------------------------- | -----------: | -------: | -----------: |
| before                           |     1.265 ms | 1.019 ms |     3.323 ms |
| journalling by transfer          |     0.659 ms | 0.484 ms |     1.673 ms |
| and recycling the evicted images | **0.318 ms** | 0.306 ms | **0.400 ms** |
| the same, journal budget 0       |     0.163 ms | 0.173 ms |     0.224 ms |
| before, journal budget 0         |     1.067 ms | 0.989 ms |     1.789 ms |

4.0× on the mean and **8.3× on the p95**: the tail was garbage collection, and recycling removes it.

`drawPixel`, 640 × 480, the count run in one loop:

| Pixels  | before                   | after                        |
| ------- | ------------------------ | ---------------------------- |
| 400 000 | 0.65 Mpx/s, heap +226 MB | 3.15–4.48 Mpx/s, heap +67 MB |
| 800 000 | 0.97 Mpx/s, heap 651 MB  | 4.82 Mpx/s, heap 229 MB      |

Taken apart on 400 000 pixels: the packed pixel record alone is 0.65 → 3.46 Mpx/s, the shared state
snapshot alone 0.65 → 1.11, and together 4.81 — against 4.72 for the same loop with journalling
stubbed out entirely. The two together give back the whole of it.

## Measured, the built app

| Workload                   | Screen fps  | Main thread | The Screen in the profile                                |
| -------------------------- | ----------- | ----------- | -------------------------------------------------------- |
| m68k bouncing ball         | 41.2 → 44.3 | 42% → 34%   | `copyRegion` 47 ms/s → `present` 4.8; GC 11 → 3.8        |
| m68k drawing loop, no wait | 39.6 → 39.5 | 105% → 107% | 365 ms/s → 241 ms/s; GC 44 ms/s → out of the top sixteen |
| z80 bouncing ball          | 60.5 → 60.5 | 10% → 9%    | —                                                        |
| mips bouncing ball         | 60.5 → 59.8 | 11% → 7%    | —                                                        |

The bouncing ball is paced by a 20 ms guest wait, so about 50 frames a second is its ceiling; it
moved 3 frames closer to it and gave back an eighth of the main thread. The no-wait loop is
scheduler-bound, exactly as the first round found — its frame rate does not move, and what the
change buys is 124 ms/s of main thread and the collector falling out of the profile. What is left
in it is not bookkeeping any more: `newImage` is the clear's fill and `present` is the copy to the
visible image, both of which are the pixels the program asked for.

## Still open

Unchanged from the first round, and still the next thing worth doing: `MarsDevices` keeps one
minimum/maximum dirty word interval, so a program writing two scattered framebuffer words re-reads
the whole grid. Measured then at 29 delivered frames a second against a possible 60, with 47% of
the wall clock in the Core's memory-read glue.

New, and not a Screen change at all: `getBoundingClientRect` and `getClientRects` are 23 ms/s on the
bouncing ball with nothing in the editor changing. The callers are Monaco's `readClientRects` and
`prepareRenderText`, about 73 layout queries a second, because `RUNNING_PANEL_REFRESH_MS` is 16 and
republishes `emulator.pc` every display frame. While a Screen is inside its activity window the user
is watching pixels rather than registers, and a longer panel interval there would give most of that
back.

# The panels and the framebuffer bridge, 2026-09-12

A third round the same day, taking the two items the second one left open, and re-testing one
candidate it had proposed.

Measurement note that cost an afternoon: this repository's `vite.config.ts` puts the dev server on
**4173**, which is the port the earlier rounds also pointed `vite preview` at. With a dev server
already running, preview silently falls back to 4174 and the harness measures whatever is on 4173.
Measure on a port nothing else claims (`--strictPort` so a clash fails loudly), and check
`/@vite/client` returns 404 before trusting a number. A second harness bug hid in the same place:
wrapping `requestAnimationFrame` as `raf.call(this, …)` throws for a bare `requestAnimationFrame(…)`
in strict module code, which is how `ScreenRenderer` calls it, so the paint loop died and the
workload reported zero delivered frames while still reporting browser frames.

## The panels, while a Screen is being drawn on

`refreshRunningPanels` was rate limited to one display frame. The reads themselves are not the whole
cost: `pc` moving republishes the editor's pseudo-instruction view zones, and Monaco re-measures
them. Traced with `getBoundingClientRect` and `getClientRects` wrapped in the page, the bouncing
ball was making about **73 layout queries a second with nothing in the editor changing**, through
Monaco's `readClientRects` and `prepareRenderText`.

**Adopted:** `ANIMATING_PANEL_REFRESH_MS`, 100 ms, used whenever `screenIsAnimating()` — the same
`SCREEN_ACTIVITY_MS` window the slice budget already keeps, factored out so both ask one question.
Outside that window the panels go straight back to a refresh a frame, and `force` is untouched, so an
input prompt still shows current panels beside it.

## The framebuffer bridge

Implemented as the first round sketched it: a dirty map of `DIRTY_BLOCK_WORDS` (256) blocks instead
of one minimum-to-maximum interval, flushed as contiguous runs, collapsing to a single span past
`MAX_DIRTY_RUNS` (8) runs. A program writing its whole grid still flushes as one run, which is the
case the old behaviour was right for.

## Measured, the built app

Same machine, one workload per process, `vite preview` on its own port. `mips sparse framebuffer` is
two words a frame at opposite ends of a 256 × 256 word grid with a 16 ms sleep — the program the
first round wrote to expose the case.

| Workload                | Screen fps      | Main thread   |
| ----------------------- | --------------- | ------------- |
| mips sparse framebuffer | 46.7 → **59.2** | 28% → **8%**  |
| m68k bouncing ball      | 43.0 → **45.1** | 34% → **20%** |
| mips bouncing ball      | 59.7 → 59.4     | 9% → 9%       |

The sparse framebuffer now reaches the display's rate. The bouncing ball gives back two fifths of
the main thread it was using: in its profile the Svelte runtime falls from about 32 ms/s to 6, the
memory grid's `currentAddress` leaves the top sixteen entirely, and `getBoundingClientRect` drops
from 23.5 to 17.2 ms/s. The MIPS bouncing ball is unchanged, as expected — it erases and redraws
adjacent cells, so its writes were always one run.

## Measured and rejected: `present` as a page flip

Proposed after the second round on the strength of a prototype that measured 0.330 → 0.171 ms a
frame. **That prototype was wrong**: it handed the drawing array to `visible` and gave the drawing
buffer a recycled one, so the `clear` that followed journaled a buffer whose contents were not the
frame it claimed. `present`'s contract is that the drawing buffer keeps the presented image, so a
flip does not remove the copy — it moves it into the next `clear`, which then has to copy the frame
out of the visible image to journal it. With that copy put back:

| Frame                          |     mean |      p95 |
| ------------------------------ | -------: | -------: |
| as it stands, 64 MiB journal   | 0.358 ms | 0.781 ms |
| page flip, 64 MiB journal      | 0.293 ms | 0.517 ms |
| as it stands, journal budget 0 | 0.118 ms | 0.169 ms |
| page flip, journal budget 0    | 0.213 ms | 0.523 ms |

A fifth faster in one case, nearly twice as slow in the other, for a change that would have to make
36 `this.drawing` sites resolve a deferred copy correctly. Not worth it.

## Still open

The operations that still write a pixel at a time where they write contiguous runs, measured at
640 × 480 with the journal off: `floodFill` over the whole image **31.4 ms**, a filled ellipse
inscribed in it **11.1 ms**, a 4000-character text run **5.4 ms** — against 0.119 ms for a filled
rectangle, which takes the word path. A span-based filled ellipse was prototyped and verified
pixel-identical across 270 shapes: 3.4× at 40 × 40, 42.7× at 300 × 300 and **98.7× at 600 × 600**,
where it is 17.0 ms against 172 µs. `floodFill` wants the same treatment as a scanline fill, and
`paintGlyph` paints a cell's opaque background a byte at a time.

# The pixel runs, 2026-09-12

The fourth round, and the last item the third one left open: three operations that write contiguous
runs of pixels but went through `paint` — a bounds check and four byte stores — for each one. The
second round had converted bulk fills to the `Uint32Array` word path and explicitly left single
pixels alone, having measured that routing _scattered_ pixels through it is only 1.13× because the
bounds check dominates. That is true, and it does not apply to a run, where the clipping is settled
once for the whole thing.

## What was changed

**The filled ellipse now solves each row instead of testing every pixel of the bounding box.** The
inside pixels of a row of an ellipse are always one interval, so `1 - dy²` gives its half-width and
the interior is a `words.fill`. Two details make it exact rather than approximately right:

- The square root can land a boundary pixel on the wrong side, so each end of the interval is walked
  out against the original `inside` predicate. The shape is the predicate's, not the solver's.
- The border is still "an inside pixel with an outside neighbour", but read off the spans: within
  the row that is the two ends, and vertically it is whatever the rows above and below leave
  uncovered — `[from, max(prevFrom, nextFrom) - 1]` and `[min(prevTo, nextTo) + 1, to]`.

**A pen wider than one pixel keeps the old loop**, and this is the part worth knowing about. GDI
fills a pixel and stamps it before moving to the next, so a stamp survives on the pixel to its right
only until that pixel is filled. Filling the whole row first and stamping afterwards leaves those
pixels pen instead of fill — two of them on a 16 × 12 test ellipse, which is what the differential
run caught. The wide-pen path still gets the spans, so it walks the ellipse rather than its bounding
box; it just keeps the interleave.

**`floodFill` is a scanline fill.** It walked one pixel at a time, pushing four neighbours per
visited pixel onto a JavaScript array and reassembling a color through `getPixel` per pop. It now
fills a run at a time as words and seeds one entry per run of the rows above and below. Comparing
packed words is comparing colors because every write to an image is opaque.

**A glyph cell is clipped once and written as words.** `paintGlyph` clipped and stored four bytes
per pixel, a hundred and twenty-eight times a character. The word view is now the caller's, built
once per text run rather than once per glyph — a scroll moves the image inside the same buffer, so
the view stays valid for the whole run. The first attempt at this, filling the cell background
through `fillRegion` and painting only the lit pixels, measured **1.0×**: it built a word view per
character, and that allocation ate the win.

## Measured, node v24.18.1, 640 × 480, journal off

| Operation                               |    before |    after |       |
| --------------------------------------- | --------: | -------: | ----: |
| `floodFill` over the whole image        | 29.116 ms | 2.049 ms | 14.2× |
| `floodFill` inside a 300 × 300 box      |  7.375 ms | 423.9 µs | 17.4× |
| filled ellipse inscribed in the image   | 10.283 ms | 282.0 µs | 36.5× |
| filled ellipse 300 × 300                |  3.002 ms | 107.0 µs | 28.1× |
| filled ellipse 100 × 100                |  302.5 µs |  29.5 µs | 10.2× |
| filled ellipse 40 × 40 (the ball)       |   39.3 µs |  11.0 µs |  3.6× |
| unfilled ellipse 300 × 300              |  1.833 ms |  33.7 µs | 54.5× |
| filled ellipse 300 × 300, pen 3         |  2.199 ms | 565.0 µs |  3.9× |
| a 4000-character text run               |  5.133 ms | 3.432 ms |  1.5× |
| a 200-character text run                |  267.0 µs | 168.7 µs |  1.6× |
| `drawText`, 40 characters at a position |   18.5 µs |  10.8 µs |  1.7× |

A filled ellipse the size of the Screen was two frame budgets and is now a sixtieth of one.

## Pixel output is unchanged

406 scripts run through the Screen as it was and the Screen as it is, comparing every byte of both
images and the pen and cursor position after each: ellipses from 2 to 60 pixels square and from
1 × 1 to 40 × 33, filled and unfilled, pen widths 1 to 8, clipped off all four edges and degenerate;
flood fills bounded by a border, around an obstacle, through a U that has to come back up, through a
one-pixel channel, through a comb of columns, from a corner, outside the Screen and onto its own
color; text that wraps, scrolls and clips at each edge, every glyph in the font, two cell sizes; and
a scene using all three. **406/406 identical.**

Three repository tests were added for the cases a differential run cannot be kept for: the two
pixels that distinguish the wide-pen order, a U-shaped flood fill that only a seeded row above can
finish, and a glyph clipped at each of the four edges. Each was checked by mutation — bypassing the
wide-pen interleave, seeding only the row below, and ignoring the glyph clip each fail exactly one.
