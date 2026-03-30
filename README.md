# Hailuo Video Automation

Automates AI video generation on [Hailuo AI](https://hailuoai.video) from an Excel storyboard. Upload a spreadsheet, review shots, attach reference images, and let the tool drive the browser to generate videos for each shot.

---

## How It Works

```
Excel storyboard → Upload → Review & attach images → Generate videos
```

1. **Upload** — drag-and-drop an `.xlsx` file containing shot descriptions
2. **Review** — edit prompts, attach reference images (auto-cropped to 16:9), mark shots as ready
3. **Generate** — the backend automates the Hailuo browser tab for each shot and returns video URLs

---

## Project Structure

```
hailuo-video-automation/
├── backend/
│   ├── main.py           # FastAPI server — Playwright automation logic
│   ├── login.py          # One-time login script to save browser session
│   └── requirements.txt  # Python dependencies
├── frontend/
│   ├── app/              # Next.js app router (layout, page, global styles)
│   ├── components/
│   │   ├── UploadScreen.tsx    # Excel upload + parsing
│   │   ├── ReviewScreen.tsx    # Shot editor + image crop
│   │   └── GenerateScreen.tsx  # Generation dashboard
│   ├── package.json
│   └── tsconfig.json
├── hailuo_profile/       # Browser session (auto-created by login.py, gitignored)
├── .env.example          # Environment variable reference
└── README.md
```

---

## Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- A [Hailuo AI](https://hailuoai.video) account

---

## Setup

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
playwright install chromium
```

### 2. Frontend

```bash
cd frontend
npm install
```

### 3. Environment variables

Copy `.env.example` and fill in values:

```bash
cp .env.example frontend/.env.local
```

The default API key is `my-secret-key` — change it in both places if deploying beyond localhost:

| Variable | Where | Description |
|---|---|---|
| `API_KEY` | backend env | Key the backend accepts |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | Backend URL |
| `NEXT_PUBLIC_API_KEY` | `frontend/.env.local` | Must match `API_KEY` |

> **Note:** `GenerateScreen.tsx` currently has the URL and key hardcoded. Update lines 12–13 to use `process.env.NEXT_PUBLIC_*` when you add the `.env.local` file.

---

## First-Time Login

The backend uses a persistent Chromium profile to stay logged in to Hailuo. Run this once:

```bash
cd backend
python login.py
```

A browser window opens — log in to Hailuo manually, then press **Enter** in the terminal. The session is saved to `hailuo_profile/` at the project root and reused for all future runs.

---

## Running the App

Start both processes (two terminals):

```bash
# Terminal 1 — backend (port 8001)
cd backend
python main.py

# Terminal 2 — frontend (port 3000)
cd frontend
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

---

## Excel Format

The upload parser accepts flexible column names (case-insensitive, partial matches). Supported columns:

| Column | Accepted names |
|---|---|
| Shot number | `shot`, `shot number`, `shot #` |
| Narration | `narration`, `narrator`, `voice over`, `vo` |
| Text on screen | `text on screen`, `text`, `on screen text` |
| Visual description | `visual description`, `visual`, `description` |
| Shot description | `shot description`, `shot desc` |
| Asset type | `asset type`, `asset`, `type` |
| Prompt | `prompt`, `ai prompt`, `video prompt` |

Any row with at least a prompt or visual description will be imported as a shot.

---

## Models

Three Hailuo models are supported (selectable before generation):

| Model | Quality | Duration |
|---|---|---|
| Hailuo 2.3-Fast | 768P–1080P | 6–10s |
| Hailuo 2.0 | 512P–1080P | 6–10s |
| Hailuo 1.0-Director | Standard | 6–10s |

---

## API Reference

The backend runs at `http://localhost:8001`.

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Health check |
| `/health` | GET | Health check |
| `/models` | GET | List available models |
| `/generate-video` | POST | Generate a video for one shot |

**POST `/generate-video`** — requires `x-api-key` header:

```json
{
  "shot_id": "shot-1",
  "prompt": "A drone shot of a mountain at sunrise",
  "image_url": "data:image/png;base64,...",
  "model": "Hailuo 2.3-Fast"
}
```

Response:

```json
{
  "shot_id": "shot-1",
  "status": "success",
  "message": "Video generated!",
  "video_url": "https://..."
}
```

Auto-generated API docs available at [http://localhost:8001/docs](http://localhost:8001/docs).

---

## Troubleshooting

**Login session expired** — re-run `python login.py` to refresh the session.

**"No file input found"** — Hailuo's UI may have changed. Check the screenshots saved in `backend/screenshots/` for a visual of what the browser saw.

**Model not selected** — the selector falls back to Hailuo's default model silently; check step3 screenshots.

**Frontend can't reach backend** — confirm the backend is running on port 8001 and CORS is not blocked. Check `API_URL` in `frontend/components/GenerateScreen.tsx`.
