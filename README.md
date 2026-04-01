# Hailuo Video Automation

A Chrome extension that automates AI video generation on [Hailuo AI](https://hailuoai.video) from an Excel storyboard. Upload a spreadsheet, review shots, attach reference images, and the extension drives the Hailuo browser tab to generate videos for each shot automatically.

---

## How It Works

```
Excel storyboard → Upload → Review & attach images → Generate videos
```

1. **Upload** — drag-and-drop an `.xlsx` file containing shot descriptions
2. **Review** — edit prompts, attach reference images (auto-cropped to 16:9), mark shots as ready
3. **Generate** — pick a model and the extension automates the Hailuo tab for each shot in sequence, collecting video URLs as they complete

No backend or server required — everything runs inside the browser extension.

---

## Project Structure

```
hailuo-video-automation/
├── src/
│   ├── background.ts         # Service worker — orchestrates tab automation & generation loop
│   ├── content.ts            # Intercepts Hailuo API responses to detect completed videos
│   ├── inject.ts             # Injected script for XHR/fetch interception
│   ├── types.ts              # Shared TypeScript types
│   └── popup/
│       ├── App.tsx           # Root component — screen routing & port connection
│       ├── main.tsx          # React entry point
│       ├── globals.css       # Tailwind base styles
│       └── components/
│           ├── UploadScreen.tsx   # Excel upload & parsing
│           └── ReviewScreen.tsx   # Shot editor, image crop, model selection & generation
├── popup/
│   └── index.html            # Popup HTML shell
├── manifest.json             # Chrome extension manifest (MV3)
├── icon128.png
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── tsconfig.json
```

---

## Prerequisites

- **Node.js** 18+
- **Google Chrome** (or any Chromium-based browser)
- A [Hailuo AI](https://hailuoai.video) account

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Build the extension

```bash
npm run build
```

For development with auto-rebuild on file changes:

```bash
npm run dev
```

### 3. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

The extension icon will appear in the toolbar. Click it to open the app in a full tab.

---

## Usage

### Uploading shots

Drag-and-drop or browse for an `.xlsx` file. The parser accepts flexible column names (case-insensitive, partial matches):

| Field | Accepted column names |
|---|---|
| Shot number | `shot`, `shot number`, `shot #` |
| Narration | `narration`, `narrator`, `voice over`, `vo` |
| Text on screen | `text on screen`, `text`, `on screen text` |
| Visual description | `visual description`, `visual`, `description` |
| Shot description | `shot description`, `shot desc` |
| Asset type | `asset type`, `asset`, `type` |
| Prompt | `prompt`, `ai prompt`, `video prompt` |

Any row with at least a prompt or visual description is imported as a shot.

### Reviewing shots

- Edit any field inline (narration, prompt, visual description, etc.)
- Attach a reference image per shot via drag-and-drop, **Ctrl+V paste**, or file browse — images are automatically center-cropped to 16:9
- Click **Save & Next** to mark a shot ready and move to the next
- Delete individual shots using the × button on hover in the shot list, or the **Delete** button in the detail panel

### Generating videos

1. Click **Generate All (N) →** in the top bar
2. A model picker modal appears — select a model and confirm:

| Model | Resolution | Duration |
|---|---|---|
| Hailuo 2.3-Fast | 768P–1080P | 6–10s |
| Hailuo 2.0 | 512P–1080P | 6–10s |
| Hailuo 1.0-Director | 720P | 6s |

3. The extension opens (or reuses) a Hailuo tab and processes shots one by one — uploading the image, filling the prompt, clicking Generate, then waiting for the video to complete before moving to the next shot
4. Completed shots show a **Download** link and **Copy URL** button inline
5. Click **Stop** at any time to halt the queue

---

## Architecture

The extension uses three scripts:

- **`background.ts`** (service worker) — receives `GENERATE` messages from the popup via a long-lived port, orchestrates the Hailuo tab (navigation, image upload, prompt fill, button click), and listens for `API_RESPONSE` messages from the content script to detect when a video is ready
- **`content.ts`** — intercepts `XMLHttpRequest` and `fetch` calls on hailuoai.video by injecting `inject.ts` into the page's main world, forwarding response bodies to the background
- **`inject.ts`** — runs in the page's main world, patches `XMLHttpRequest.open/send` and `fetch` to capture Hailuo's API responses and relay them via `window.postMessage`

---

## Troubleshooting

**Extension not appearing** — make sure Developer mode is on and you loaded the `dist/` folder (not the repo root).

**"No file input found"** — Hailuo's UI may have changed. The extension targets `input[type='file'][accept='.jpg,.jpeg,.png,.webp']` — if Hailuo updates their markup this selector may need updating in `src/background.ts`.

**Model not selected** — the model selection clicks `[data-tour='model-selection-guide']` and then finds the matching label; if Hailuo renames models the selector in `selectModel()` may need updating.

**Video never detected** — the extension reads `batchFeeds` from Hailuo's feed API. If the response structure changes, update `extractVideoUrl()` in `src/background.ts`.

**Generation stuck** — the background has a 10-minute timeout per shot and a 3-minute submit timeout. If Hailuo is slow, these can be adjusted in `waitForGenCompletion` and `waitForShotSubmitted`.
