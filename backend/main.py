"""
Hailuo Video Automation — with Model Selection
"""

import os
import asyncio
import tempfile
import base64
import time
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from playwright.async_api import async_playwright

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

_HERE = os.path.dirname(os.path.abspath(__file__))

HAILUO_URL = "https://hailuoai.video/create/image-to-video"
API_KEY = os.getenv("API_KEY", "my-secret-key")
VIDEO_WAIT_TIMEOUT_MS = 900000  # 15 mins
SCREENSHOT_DIR = os.path.join(_HERE, "screenshots")
HAILUO_PROFILE_DIR = os.path.join(_HERE, "..", "hailuo_profile")

VALID_MODELS = ["Hailuo 2.3-Fast", "Hailuo 1.0-Director", "Hailuo 2.0"]

os.makedirs(SCREENSHOT_DIR, exist_ok=True)

browser_semaphore = asyncio.Semaphore(1)

# Simple cache: (logged_in: bool, timestamp: float)
_auth_cache: dict = {"logged_in": False, "ts": 0.0}
_AUTH_CACHE_TTL = 60  # seconds


def _chrome_launch_args():
    return ["--no-first-run", "--no-default-browser-check", "--disable-blink-features=AutomationControlled"]


async def _check_logged_in(context) -> bool:
    """Check for the _token cookie — present only when logged in to Hailuo."""
    try:
        cookies = await context.cookies(["https://hailuoai.video"])
        return any(c["name"] == "_token" for c in cookies)
    except Exception:
        return False

# ─────────────────────────────────────────────
# APP
# ─────────────────────────────────────────────

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────

class ShotRequest(BaseModel):
    shot_id: str
    prompt: str
    image_url: str
    model: Optional[str] = "Hailuo 2.3-Fast"  # default model

class ShotResponse(BaseModel):
    shot_id: str
    status: str
    message: Optional[str] = None
    video_url: Optional[str] = None

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

async def verify_api_key(x_api_key: str):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

async def download_image(url: str, shot_id: str) -> str:
    path = os.path.join(tempfile.gettempdir(), f"{shot_id}.png")

    if url.startswith("data:image"):
        header, data = url.split(",", 1)
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))
        print(f"  ✅ Base64 image saved: {path}")
        return path

    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        r = await client.get(url)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)
    print(f"  ✅ Image downloaded: {path}")
    return path

# ─────────────────────────────────────────────
# MAIN AUTOMATION
# ─────────────────────────────────────────────

async def run_hailuo(shot_id: str, prompt: str, image_path: str, model: str = "Hailuo 2.3-Fast") -> dict:
    async with browser_semaphore:
        async with async_playwright() as p:
            print(f"  🌐 [{shot_id}] Launching Chrome...")
            context = await p.chromium.launch_persistent_context(
                user_data_dir=HAILUO_PROFILE_DIR,
                channel="chrome",
                headless=False,
                args=[
                    "--start-maximized",
                    "--disable-blink-features=AutomationControlled",
                    "--no-first-run",
                    "--no-default-browser-check",
                ],
                ignore_default_args=["--enable-automation"],
                viewport=None
            )
            page = await context.new_page()

            try:
                # ── Step 1: Open Hailuo ──────────────────────
                print(f"  🌐 [{shot_id}] Opening Hailuo image-to-video page...")
                await page.goto(HAILUO_URL, wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(8000)
                await page.screenshot(path=f"{SCREENSHOT_DIR}/step1_loaded_{shot_id}.png")
                print(f"  ✅ [{shot_id}] Page loaded: {page.url}")

                # ── Step 2: Dismiss any modal ────────────────
                try:
                    close_btn = await page.wait_for_selector(
                        "section.fixed button, [aria-label='Close'], .close-btn",
                        timeout=3000
                    )
                    if close_btn:
                        await close_btn.click()
                        await page.wait_for_timeout(1000)
                        print(f"  ✅ [{shot_id}] Dismissed modal")
                except Exception:
                    pass

                # ── Step 3: Select model ──────────────────────
                print(f"  🤖 [{shot_id}] Selecting model: {model}...")
                try:
                    # Click the model selector button
                    model_btn = await page.wait_for_selector(
                        "[data-tour='model-selection-guide']",
                        timeout=5000
                    )
                    await model_btn.click()
                    await page.wait_for_timeout(1500)
                    await page.screenshot(path=f"{SCREENSHOT_DIR}/step3a_model_open_{shot_id}.png")

                    # Find and click the target model by its text
                    clicked_model = await page.evaluate(f"""() => {{
                        const divs = Array.from(document.querySelectorAll('div.font-500'));
                        const target = divs.find(d => d.textContent.trim() === '{model}');
                        if (target) {{
                            // Click the parent container of the model option
                            const row = target.closest('[class*="flex"][class*="items-center"]');
                            if (row) {{ row.click(); return true; }}
                            target.click();
                            return true;
                        }}
                        return false;
                    }}""")

                    if clicked_model:
                        print(f"  ✅ [{shot_id}] Model '{model}' selected!")
                    else:
                        print(f"  ⚠️ [{shot_id}] Model '{model}' not found — using default")

                    await page.wait_for_timeout(1500)
                    await page.screenshot(path=f"{SCREENSHOT_DIR}/step3b_model_selected_{shot_id}.png")

                except Exception as e:
                    print(f"  ⚠️ [{shot_id}] Model selection failed (using default): {e}")

                # ── Step 4: Upload image to Start Frame ──────
                print(f"  📤 [{shot_id}] Uploading image to Start Frame...")

                file_inputs = await page.query_selector_all(
                    "input[type='file'][accept='.jpg,.jpeg,.png,.webp']"
                )
                if not file_inputs:
                    await page.screenshot(path=f"{SCREENSHOT_DIR}/error_no_upload_{shot_id}.png")
                    raise Exception("No file input found — check screenshot!")

                start_frame_input = file_inputs[0]
                await page.evaluate("el => { el.style.display = 'block'; el.style.opacity = '1'; }", start_frame_input)
                await start_frame_input.set_input_files(image_path)
                print(f"  ✅ [{shot_id}] Image uploaded to Start Frame!")
                await page.wait_for_timeout(4000)
                await page.screenshot(path=f"{SCREENSHOT_DIR}/step4_uploaded_{shot_id}.png")

                # ── Step 5: Fill prompt (contenteditable div) ─
                print(f"  📝 [{shot_id}] Filling prompt...")

                prompt_box = await page.wait_for_selector(
                    "#video-create-textarea",
                    timeout=10000
                )
                if not prompt_box:
                    raise Exception("Prompt box not found!")

                await page.evaluate("el => el.focus()", prompt_box)
                await page.wait_for_timeout(500)
                await page.keyboard.press("Control+a")
                await page.keyboard.press("Backspace")
                await page.wait_for_timeout(300)

                await page.evaluate(f"navigator.clipboard.writeText({repr(prompt)})")
                await page.keyboard.press("Control+v")
                await page.wait_for_timeout(1000)

                await page.screenshot(path=f"{SCREENSHOT_DIR}/step5_prompted_{shot_id}.png")
                print(f"  ✅ [{shot_id}] Prompt filled!")

                # ── Step 6: Snapshot existing videos ─────────
                existing_videos = await page.evaluate("""() => {
                    return Array.from(document.querySelectorAll('video'))
                        .map(v => v.src || v.currentSrc || v.getAttribute('src'))
                        .filter(s => s);
                }""")
                print(f"  📹 [{shot_id}] Existing videos: {len(existing_videos)}")

                # ── Step 7: Click Generate button ────────────
                print(f"  🔘 [{shot_id}] Clicking Generate button...")

                generate_btn = await page.wait_for_selector(
                    "button.new-color-btn-bg",
                    timeout=10000
                )
                await page.evaluate("el => el.click()", generate_btn)
                print(f"  ✅ [{shot_id}] Generate clicked!")
                await page.wait_for_timeout(3000)
                await page.screenshot(path=f"{SCREENSHOT_DIR}/step7_after_click_{shot_id}.png")

                # ── Step 8: Wait for new video ────────────────
                print(f"  ⏳ [{shot_id}] Waiting for video (up to 15 mins)...")

                await page.wait_for_function(
                    """(existingSrcs) => {
                        const videos = Array.from(document.querySelectorAll('video'));
                        return videos.filter(v => {
                            const src = v.src || v.currentSrc || v.getAttribute('src');
                            return src && !existingSrcs.includes(src);
                        }).length > 0;
                    }""",
                    arg=existing_videos,
                    timeout=VIDEO_WAIT_TIMEOUT_MS
                )

                video_url = await page.evaluate(
                    """(existingSrcs) => {
                        const videos = Array.from(document.querySelectorAll('video'));
                        const v = videos.find(v => {
                            const src = v.src || v.currentSrc || v.getAttribute('src');
                            return src && !existingSrcs.includes(src);
                        });
                        return v ? (v.src || v.currentSrc || v.getAttribute('src')) : null;
                    }""",
                    existing_videos
                )

                await page.screenshot(path=f"{SCREENSHOT_DIR}/step8_done_{shot_id}.png")
                print(f"  🎬 [{shot_id}] Video ready: {video_url}")

                return {"shot_id": shot_id, "status": "success", "message": "Video generated!", "video_url": video_url}

            except Exception as e:
                print(f"  ❌ [{shot_id}] ERROR: {e}")
                try:
                    await page.screenshot(path=f"{SCREENSHOT_DIR}/final_error_{shot_id}.png")
                except:
                    pass
                return {"shot_id": shot_id, "status": "error", "message": str(e), "video_url": None}

            finally:
                await page.close()
                await context.close()

# ─────────────────────────────────────────────
# AUTH ENDPOINTS
# ─────────────────────────────────────────────

@app.get("/auth/status")
async def auth_status():
    global _auth_cache
    if time.time() - _auth_cache["ts"] < _AUTH_CACHE_TTL:
        return {"logged_in": _auth_cache["logged_in"]}

    try:
        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                user_data_dir=HAILUO_PROFILE_DIR,
                channel="chrome",
                headless=True,
                args=_chrome_launch_args(),
                ignore_default_args=["--enable-automation"],
            )
            try:
                logged_in = await _check_logged_in(context)
            finally:
                await context.close()

        _auth_cache = {"logged_in": logged_in, "ts": time.time()}
        return {"logged_in": logged_in}
    except Exception as e:
        return {"logged_in": False, "error": str(e)}


# Global login session (kept alive between start/verify calls)
_login_pw = None
_login_ctx = None


@app.post("/auth/login/start")
async def auth_login_start():
    """Open a visible Chrome window for manual login. Returns immediately."""
    global _login_pw, _login_ctx
    # Clean up any previous session
    try:
        if _login_ctx:
            await _login_ctx.close()
        if _login_pw:
            await _login_pw.stop()
    except Exception:
        pass

    try:
        _login_pw = await async_playwright().start()
        _login_ctx = await _login_pw.chromium.launch_persistent_context(
            user_data_dir=HAILUO_PROFILE_DIR,
            channel="chrome",
            headless=False,
            args=["--start-maximized"] + _chrome_launch_args(),
            ignore_default_args=["--enable-automation"],
            viewport=None,
        )
        page = await _login_ctx.new_page()
        await page.goto("https://hailuoai.video", wait_until="domcontentloaded", timeout=30000)
        return {"success": True}
    except Exception as e:
        return {"success": False, "message": str(e)}


@app.post("/auth/login/verify")
async def auth_login_verify():
    """Close the visible Chrome window, then do a headless check to confirm login."""
    global _login_pw, _login_ctx, _auth_cache
    # Close visible browser first so profile is free for headless check
    try:
        if _login_ctx:
            await _login_ctx.close()
        if _login_pw:
            await _login_pw.stop()
    except Exception:
        pass
    finally:
        _login_ctx = None
        _login_pw = None

    await asyncio.sleep(1)  # let Chrome release the profile lock

    try:
        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                user_data_dir=HAILUO_PROFILE_DIR,
                channel="chrome",
                headless=True,
                args=_chrome_launch_args(),
                ignore_default_args=["--enable-automation"],
            )
            try:
                logged_in = await _check_logged_in(context)
            finally:
                await context.close()

        if logged_in:
            _auth_cache = {"logged_in": True, "ts": time.time()}
        return {"logged_in": logged_in}
    except Exception as e:
        return {"logged_in": False, "error": str(e)}


# Global hailuo browser (kept open for the "Open Hailuo" button)
_hailuo_pw = None
_hailuo_ctx = None


@app.post("/hailuo/open")
async def hailuo_open():
    """Open (or focus) hailuoai.video in the automation Chrome profile."""
    global _hailuo_pw, _hailuo_ctx

    # If already open, just navigate to the create page
    if _hailuo_ctx:
        try:
            pages = _hailuo_ctx.pages
            if pages:
                await pages[0].bring_to_front()
                return {"success": True}
        except Exception:
            pass  # context died, reopen below
        try:
            await _hailuo_ctx.close()
        except Exception:
            pass
        try:
            await _hailuo_pw.stop()
        except Exception:
            pass
        _hailuo_ctx = None
        _hailuo_pw = None

    try:
        _hailuo_pw = await async_playwright().start()
        _hailuo_ctx = await _hailuo_pw.chromium.launch_persistent_context(
            user_data_dir=HAILUO_PROFILE_DIR,
            channel="chrome",
            headless=False,
            args=["--start-maximized"] + _chrome_launch_args(),
            ignore_default_args=["--enable-automation"],
            viewport=None,
        )
        page = await _hailuo_ctx.new_page()
        await page.goto("https://hailuoai.video/create/image-to-video",
                        wait_until="domcontentloaded", timeout=30000)
        return {"success": True}
    except Exception as e:
        _hailuo_ctx = None
        _hailuo_pw = None
        return {"success": False, "message": str(e)}


# ─────────────────────────────────────────────
# API ENDPOINTS
# ─────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "Hailuo Automation API is running!"}

@app.get("/models")
def get_models():
    return {"models": VALID_MODELS}

@app.post("/generate-video", response_model=ShotResponse)
async def generate_video(shot: ShotRequest, x_api_key: str = Header(...)):
    await verify_api_key(x_api_key)
    image_path = None
    try:
        print(f"\n{'='*50}")
        print(f"🎬 Shot: {shot.shot_id} | Model: {shot.model}")
        print(f"   Prompt: {shot.prompt[:60]}...")

        image_path = await download_image(shot.image_url, shot.shot_id)
        result = await run_hailuo(shot.shot_id, shot.prompt, image_path, shot.model or "Hailuo 2.3-Fast")

        return ShotResponse(**result)

    except Exception as e:
        return ShotResponse(shot_id=shot.shot_id, status="error", message=str(e))

    finally:
        if image_path and os.path.exists(image_path):
            os.remove(image_path)

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*50)
    print("  HAILUO AUTOMATION API")
    print("  API: http://localhost:8001")
    print("  Docs: http://localhost:8001/docs")
    print("="*50 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8001)