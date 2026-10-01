# Hybrid search in the browser over a build-time index

Search over the **Documentation** and the **Courses** runs entirely in the reader's browser. Orama
holds a full-text and vector index of every **Documentation entry** and **Lecture section** in a
**Search scope**, and ranks them with both. The vectors come from `MongoDB/mdbr-leaf-ir` (23M
parameters, int8, 21.9 MiB of weights), used symmetrically: the build embeds the documents with it,
and the browser embeds the reader's query with the same files.

The model runs on ONNX Runtime directly, with `@huggingface/tokenizers` for the tokenizer:
`onnxruntime-node` in the build and the tests, and the CPU-only WebAssembly build of
`onnxruntime-web` (13.6 MiB) in the browser. Not transformers.js, whose browser build loads the
WebGPU runtime, a 27 MiB file that Cloudflare Pages cannot serve (it caps a file at 25 MiB) and that
transformers.js otherwise fetches from jsDelivr. The model's ONNX graph already ends in its pooling
and projection layers, so its `sentence_embedding` output is the vector; the build keeps its first
256 of 768 dimensions, which the model is trained to allow.

The build downloads the model files from Hugging Face at a pinned commit, checks them against
recorded hashes, and keeps them in the gitignored `.cache/` (CI keeps it with `actions/cache`),
together with every document's vector keyed by a hash of its text, so a rebuild only embeds what
changed. It then serves the files from our own origin as content-hashed assets under
`/_app/immutable/`, where the service worker caches them like the Monaco workers.

In the browser the model starts downloading in a Web Worker as soon as a page with a search box is
entered, unless the browser asks to save data; there is no Preference for it. Until it is ready,
search is full-text only and a spinner in the search box says so while the reader types.

## Considered options

- **The asymmetric mode** (`snowflake-arctic-embed-m-v1.5` embedding documents at build time).
  Rejected: half a BEIR point (54.03 against 53.55) for a 110M-parameter second model in every
  build, kept in step with the first.
- **Loading the model from the Hugging Face CDN.** Rejected: every reader's first search would
  depend on, and announce itself to, a third party that school and exam networks may block.
- **Committing the model files.** Rejected: 23 MB of barely compressible weights would more than
  double the repository (14 MiB packed), and every model update would add as much again.
- **Publishing the files as an npm package.** Rejected: a package to publish and maintain for what a
  pinned, hash-checked download already gives.
- **Committing the vectors.** Unnecessary: the build needs the model files to serve them anyway, so
  embedding at build time costs nothing extra and no content edit needs a separate step.

- **transformers.js in the browser.** Rejected: see above; its WebGPU runtime cannot be served from
  our origin.

## Consequences

The service worker has to copy an unchanged immutable asset forward from an older cache generation.
Today it drops one two deploys old and downloads it again. A build with a cold cache needs Hugging
Face to be reachable. Readers who never search still
download the model once if they open a page that has a search box: 35.5 MiB on disk (21.9 MiB of
weights, 13.6 MiB of runtime), about 18 MiB over the wire where both are compressed, and up to 25
MiB if the CDN sends the weights uncompressed.
