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
│   ├── main.py           # FastAPI server — Playwright automation + auth endpoints
│   ├── login.py          # Legacy one-time login script (CLI alternative)
│   └── requirements.txt  # Python dependencies
├── frontend/
│   ├── app/              # Next.js app router (layout, page, global styles)
│   ├── components/
│   │   ├── LoginScreen.tsx    # In-app login flow (open Chrome, verify session)
│   │   ├── UploadScreen.tsx   # Excel upload + parsing
│   │   ├── ReviewScreen.tsx   # Shot editor + image crop
│   │   └── GenerateScreen.tsx # Generation dashboard
│   ├── package.json
│   └── tsconfig.json
├── hailuo_profile/       # Browser session (auto-created on first login, gitignored)
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

> `GenerateScreen.tsx` reads `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_API_KEY` from the environment, falling back to `localhost:8001` / `my-secret-key` when the vars are not set.

---

## First-Time Login

The backend uses a persistent Chromium profile to stay logged in to Hailuo. The session is saved to `hailuo_profile/` at the project root and reused for all future runs.

### Option A — In-app (recommended)

With both the backend and frontend running, open [http://localhost:3000](http://localhost:3000). If your session has expired or was never set up, use the **LoginScreen** component:

1. Click **Open Hailuo & Log In** — a Chrome window opens pointing to hailuoai.video
2. Log in manually in that window
3. Click **I've Logged In ✓** — the backend closes the window and verifies the session cookie

A floating **Open Hailuo** button on every screen lets you reopen the browser tab at any time.

### Option B — CLI (legacy)

```bash
cd backend
python login.py
```

A browser window opens — log in to Hailuo manually, then press **Enter** in the terminal.

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
| `/auth/status` | GET | Check if the saved session is logged in |
| `/auth/login/start` | POST | Open a visible Chrome window for manual login |
| `/auth/login/verify` | POST | Close the Chrome window and verify the session cookie |
| `/hailuo/open` | POST | Open or focus the Hailuo tab in the automation browser |

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

## Deployment

> **Why cloud deployment is tricky for this app:** The backend drives a real Chrome browser with a persistent login session. This means it can't run on serverless platforms (Vercel functions, Lambda), requires a persistent disk for `hailuo_profile/`, and the interactive login screen can't open a visible window on a headless server. The recommended free setup is below.

### Frontend → Vercel

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo.
3. Set **Root Directory** to `frontend`.
4. Add environment variables:
   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | Your backend URL (e.g. `https://your-app.onrender.com`) |
   | `NEXT_PUBLIC_API_KEY` | Your API key (must match `API_KEY` on the backend) |
5. Deploy.

### Backend → Render (free tier)

Render's free tier runs Docker containers on Linux — Chrome is not available, so Playwright's own Chromium is used instead, and the browser runs **headless**.

#### Step 1 — Create `backend/Dockerfile`

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    ca-certificates wget \
    libglib2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium
RUN playwright install-deps chromium

COPY . .

CMD ["python", "main.py"]
```

#### Step 3 — Handle the login session

The `hailuo_profile/` folder must exist in the container with a valid session. Two options:

**Option A — Bake the profile into the image (simplest)**
1. Log in locally once: run the app locally, use the in-app login screen or `python login.py`.
2. Temporarily remove `hailuo_profile/` from `.gitignore`, commit, and push.
3. After deploying, add it back to `.gitignore` — the profile is now baked into the container image.
4. When the session expires, repeat.

**Option B — Render persistent disk (more durable)**
1. On Render, add a **Disk** to your service (free tier does not include this — it's $0.25/GB/month).
2. Mount it at `/app/hailuo_profile`.
3. Use the `/auth/login/start` + `/auth/login/verify` endpoints via the API to log in remotely by forwarding port 8001 with a local SSH tunnel or `render shell`.

#### Step 4 — Deploy on Render

1. Push the repo to GitHub.
2. Go to [render.com](https://render.com) → **New → Web Service**.
3. Connect the repo, set **Root Directory** to `backend`.
4. Set runtime to **Docker**.
5. Add environment variables:
   | Variable | Value |
   |---|---|
   | `API_KEY` | your secret key |
   | `HEADLESS` | `true` |
   | `ALLOWED_ORIGINS` | `https://your-app.vercel.app,http://localhost:3000` |
6. Deploy.

> **Free tier caveat:** Render's free web services spin down after 15 minutes of inactivity. The first request after a spin-down will be slow (~30s) as the container restarts. The browser profile on ephemeral disk is also lost on each redeploy.

---

## Troubleshooting

**Login session expired** — use the in-app login flow (click **Open Hailuo & Log In** on the Login screen) or re-run `python login.py` from the CLI.

**"No file input found"** — Hailuo's UI may have changed. Check the screenshots saved in `backend/screenshots/` for a visual of what the browser saw.

**Model not selected** — the selector falls back to Hailuo's default model silently; check step3 screenshots.

**Frontend can't reach backend** — confirm the backend is running on port 8001 and CORS is not blocked. Check `API_URL` in `frontend/components/GenerateScreen.tsx`.
