# SCRIBE-ME — Stable edition

Free browser-based audio transcription with Whisper, timestamps, editing, playback and TXT download.

Automatic speaker recognition was removed because the experimental speaker engine returned no speaker identifiers. All speaker assignments are **manual**. Text blocks are based on Whisper timestamps and 25-second processing sections; they do **not** represent speaker turns.

## Deploy

Upload all files and folders to your GitHub repository, retaining `.github/workflows/deploy.yml`. Keep GitHub Pages set to **GitHub Actions**. The workflow runs `npm install` then `npm run build` and publishes the `dist/` directory.

Requires browser internet access initially to load Whisper models from Hugging Face. Audio stays in the browser. Large files, Safari support and some video codecs vary by device and have not been fully validated.
