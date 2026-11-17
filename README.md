# SCRIBE-ME — Auto Import v2.1

Browser-based transcription on GitHub Pages. Recordings remain on the user’s device.

### Upgrade
Upload all files from this package, preserving paths including `.github/workflows/deploy.yml`. The existing GitHub Actions workflow builds the project and publishes the `dist` folder.

### Import handling
Audio files of 64 MB or less are first sent to the browser decoder. If decoding fails, SCRIBE-ME attempts to convert the recording locally using FFmpeg.wasm. Files over 64 MB bypass full browser decoding and are converted in 25-second portions. No colleague needs to manually convert files. The first converter run downloads a WebAssembly runtime and requires internet access.

**Limitations:** Browser RAM constraints and codec availability remain. Large video or 300 MB files are not guaranteed to process. Tested syntax only; no complete browser or GitHub Actions build verified. No speaker diarisation; labels are manual.
