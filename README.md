## v1.9 testing note

Speaker detection remains experimental. If no speaker identities are returned, SCRIBE-ME merges consecutive text into approximately 35-second readable blocks without guessing speaker identities. This does not constitute automatic diarisation. Diagnostic information names fields returned by the engine.

# SCRIBE-ME v1.7

A free browser transcription workspace for recorded interviews. Hosted on GitHub Pages. Recordings stay in the visitor's browser; no audio uploads or paid transcription API.

## Publish to GitHub Pages

1. Open the `slimbudoo/SCRIBE-ME` GitHub repository.
2. Upload **all the contents of this ZIP** to the repository (keep `.github/workflows/deploy.yml` and `src/main.js` in their folders). Replace the existing `index.html`.
   - The GitHub web uploader may hide folders starting with a dot on some systems. Use GitHub's **Add file → Create new file** and type `.github/workflows/deploy.yml` if the workflow did not upload.
3. In **Settings → Pages**, change **Build and deployment → Source** to **GitHub Actions**. Do NOT leave it set to **Deploy from a branch**, because source files require bundling.
4. Open the **Actions** tab and confirm **Build and deploy SCRIBE-ME** succeeds. The workflow installs dependencies, bundles the module worker and publishes `dist/`.
5. Visit your GitHub Pages address and confirm the sidebar says **V1.7**.

No GitHub secret, custom domain, server, account login or paid API is needed.

## Development

Requires Node.js 22+.

```bash
npm install
npm run dev
npm run build
```

`npm run build` creates `dist/`. The bundled diarisation worker is served from the same origin rather than imported dynamically from `esm.sh`.

## Compatibility and caveats

- Automatic speaker matching uses `@yourdevice/engine@0.1.1` and its model downloads. It is experimental and has **not** been end-to-end validated on a live Mac or Windows browser in this release. This fixes the specific failed remote module import, but it does not guarantee diarisation models will initialise.
- The engine may try WebGPU/WebNN and fall back to slower single-thread WASM. The first run downloads AI models from Hugging Face, and those requests can still fail on restricted networks or ad blockers.
- Manual mode retains the existing Transformers.js Whisper transcription path from v1.6 as fallback. Automatic mode also falls back to this on an error, with manual speaker assignment.
- Files are decoded in browser memory. 300 MB audio/video files are **not guaranteed** to process on every device. Native decoding depends on browser codecs; MOV and other containers may need conversion to a supported audio format.
- Voice labels can be wrong, especially with overlapping speech or quick interjections. Review against the recording before quoting.
- The site retains no recordings or transcripts server-side. The browser may cache model weights and the user must save a TXT before closing the page.
- This uses open-source code, but check upstream model licences before mirroring or redistributing their weights. Model files are **not included** in this repo.

## Troubleshooting

If **Build and deploy SCRIBE-ME** fails, copy the first red error from the GitHub Actions log. If it builds but automatic speaker matching fails, copy the exact on-screen message. If a model download fails, try another browser or network and compare with Manual · Faster mode.

## v1.8 troubleshooting update
If the speaker engine returns text without speaker labels, SCRIBE-ME now keeps
that transcription and enables TXT export without running the older transcription
engine again. The diagnostic message reports the number of engine sections and
whether all returned speaker labels were absent. It does **not** repair upstream
speaker diarisation; the browser-based model must return labels for that to work.
