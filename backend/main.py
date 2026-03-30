"""
Hailuo Video Automation — with Model Selection
"""

import os
import sys
import asyncio
import tempfile
import base64
import time
import subprocess
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
HEADLESS = os.getenv("HEADLESS", "false").lower() == "true"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
VIDEO_WAIT_TIMEOUT_MS = 900000  # 15 mins
SCREENSHOT_DIR = os.path.join(_HERE, "screenshots")
HAILUO_PROFILE_DIR = os.path.join(_HERE, "..", "hailuo_profile")

VALID_MODELS = ["Hailuo 2.3-Fast", "Hailuo 1.0-Director", "Hailuo 2.0"]

os.makedirs(SCREENSHOT_DIR, exist_ok=True)

browser_semaphore = asyncio.Semaphore(1)

# Simple cache: (logged_in: bool, timestamp: float)
_auth_cache: dict = {"logged_in": False, "ts": 0.0}
_AUTH_CACHE_TTL = 60  # seconds

# Persistent browser context — shared across all operations
_pw_instance = None
_ctx_instance = None


def _chrome_launch_args():
    return ["--no-first-run", "--no-default-browser-check", "--disable-blink-features=AutomationControlled"]


def _kill_hailuo_chrome():
    """Kill any unmanaged Chrome process using hailuo_profile."""
    try:
        subprocess.run(["pkill", "-f", HAILUO_PROFILE_DIR], capture_output=True)
        time.sleep(1.5)
    except Exception:
        pass


async def get_context():
    """Return the existing live browser context, or launch a new one."""
    global _pw_instance, _ctx_instance

    if _ctx_instance:
        try:
            _ = _ctx_instance.pages  # raises if context is dead
            return _ctx_instance
        except Exception:
            _ctx_instance = None
            try:
                await _pw_instance.stop()
            except Exception:
                pass
            _pw_instance = None

    _kill_hailuo_chrome()
    _pw_instance = await async_playwright().start()
    extra_args = ["--start-maximized"] if not HEADLESS else []
    _ctx_instance = await _pw_instance.chromium.launch_persistent_context(
        user_data_dir=HAILUO_PROFILE_DIR,
        headless=HEADLESS,
        args=extra_args + ["--disable-blink-features=AutomationControlled"] + _chrome_launch_args(),
        ignore_default_args=["--enable-automation"],
        viewport=None,
    )
    return _ctx_instance


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
    allow_origins=ALLOWED_ORIGINS,
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
        print(f"  🌐 [{shot_id}] Getting Chrome context...")
        context = await get_context()

        # Reuse an existing hailuoai page if open, otherwise create one
        page = None
        for p in context.pages:
            if "hailuoai" in p.url:
                page = p
                break
        if page is None:
            page = await context.new_page()

        try:
            # ── Step 1: Open Hailuo ──────────────────────
            print(f"  🌐 [{shot_id}] Opening Hailuo image-to-video page...")
            await page.goto(HAILUO_URL, wait_until="domcontentloaded", timeout=30000)
            # Scroll down and back up to trigger lazy-loading of history videos
            await page.wait_for_timeout(5000)
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(3000)
            await page.evaluate("window.scrollTo(0, 0)")
            await page.wait_for_timeout(2000)
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
                model_btn = await page.wait_for_selector(
                    "[data-tour='model-selection-guide']",
                    timeout=5000
                )
                await model_btn.click()
                await page.wait_for_timeout(1500)
                await page.screenshot(path=f"{SCREENSHOT_DIR}/step3a_model_open_{shot_id}.png")

                clicked_model = await page.evaluate(f"""() => {{
                    const divs = Array.from(document.querySelectorAll('div.font-500'));
                    const target = divs.find(d => d.textContent.trim() === '{model}');
                    if (target) {{
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

            # Wait for Hailuo's image upload API response before setting the file,
            # so we can detect when the server-side upload finishes.
            image_upload_done = {"value": False}

            async def on_image_upload_response(response):
                if image_upload_done["value"]:
                    return
                if not response.ok or "hailuoai" not in response.url:
                    return
                if "json" not in response.headers.get("content-type", ""):
                    return
                try:
                    if response.request.method.upper() != "POST":
                        return
                    data = await response.json()
                    # Hailuo returns an image URL / asset key after upload
                    url_val = (
                        (data.get("data") or {}).get("url") or
                        (data.get("data") or {}).get("ossUrl") or
                        (data.get("data") or {}).get("fileUrl") or
                        (data.get("data") or {}).get("imageUrl")
                    )
                    if url_val:
                        image_upload_done["value"] = True
                        print(f"  ✅ [{shot_id}] Server confirmed image upload: {str(url_val)[:80]}")
                except Exception:
                    pass

            page.on("response", on_image_upload_response)
            await start_frame_input.set_input_files(image_path)
            print(f"  📤 [{shot_id}] File set — waiting for server-side upload to complete...")

            # Wait up to 30s for server confirmation, then fall back to fixed wait
            for _ in range(30):
                if image_upload_done["value"]:
                    break
                await asyncio.sleep(1)
            page.remove_listener("response", on_image_upload_response)

            if not image_upload_done["value"]:
                print(f"  ⚠️ [{shot_id}] Upload confirmation not seen — waiting extra 5s")
                await page.wait_for_timeout(5000)

            await page.wait_for_timeout(1000)  # brief settle
            await page.screenshot(path=f"{SCREENSHOT_DIR}/step4_uploaded_{shot_id}.png")

            # ── Step 5: Fill prompt ───────────────────────
            print(f"  📝 [{shot_id}] Filling prompt...")
            prompt_box = await page.wait_for_selector("#video-create-textarea", timeout=10000)
            if not prompt_box:
                raise Exception("Prompt box not found!")

            await prompt_box.click()
            await page.wait_for_timeout(300)
            await prompt_box.fill(prompt)
            await page.wait_for_timeout(1000)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/step5_prompted_{shot_id}.png")
            print(f"  ✅ [{shot_id}] Prompt filled!")

            # ── Step 6: Record submit timestamp + click Generate ─
            submit_time_sec = int(time.time())  # seconds — matches Hailuo's createTime
            gen_batch_id = {"value": None}
            video_result  = {"url": None}
            feed_api_url  = {"value": None}  # captured for active polling

            async def capture_batch_id(response):
                """Grab our batchID from the generate POST response only."""
                if not response.ok or "hailuoai" not in response.url:
                    return
                if "json" not in response.headers.get("content-type", ""):
                    return
                try:
                    if response.request.method.upper() != "POST":
                        return  # feed polling is GET; generate is POST
                    data = await response.json()
                    def find(obj, key, depth=0):
                        if depth > 5: return None
                        if isinstance(obj, dict):
                            if key in obj and obj[key]: return str(obj[key])
                            for v in obj.values():
                                r = find(v, key, depth + 1)
                                if r: return r
                        elif isinstance(obj, list):
                            for item in obj:
                                r = find(item, key, depth + 1)
                                if r: return r
                        return None
                    bid = find(data, "batchID")
                    if bid and not gen_batch_id["value"]:
                        gen_batch_id["value"] = str(bid)
                        print(f"  🎯 [{shot_id}] Batch ID from generate API: {bid}")
                except Exception as e:
                    print(f"  ⚠️ [{shot_id}] capture_batch_id error: {e}")

            def _extract_url_from_feed(data):
                """Parse feed JSON and return video URL if our batch is done."""
                try:
                    d = data.get("data", data) if isinstance(data, dict) else {}
                    batch_feeds = d.get("batchFeeds") if isinstance(d, dict) else None
                    if not batch_feeds:
                        return None
                    our_bid = gen_batch_id["value"]
                    for batch in batch_feeds:
                        bid = str(batch.get("batchID", ""))
                        for feed in batch.get("feeds", []):
                            info = feed.get("commonInfo", {})
                            status = int(info.get("status", 0))  # normalize to int
                            create_time = int(info.get("createTime", 0))  # in seconds
                            if status != 2:
                                continue
                            # Match by batchID (primary) or submit timestamp (fallback)
                            if our_bid and bid != our_bid:
                                continue
                            if not our_bid and create_time <= submit_time_sec:
                                continue
                            url = (feed.get("metaInfo", {})
                                       .get("videoMetaInfo", {})
                                       .get("mediaInfo", {})
                                       .get("url", ""))
                            if url:
                                return url
                except Exception as e:
                    print(f"  ⚠️ [{shot_id}] _extract_url_from_feed error: {e}")
                return None

            async def monitor_feed(response):
                """Watch the feed polling API for our batch completing."""
                if not response.ok or video_result["url"]:
                    return
                if "json" not in response.headers.get("content-type", ""):
                    return
                try:
                    data = await response.json()
                    # Capture feed URL for active polling fallback
                    if not feed_api_url["value"] and isinstance(data, dict):
                        d = data.get("data", {})
                        if isinstance(d, dict) and d.get("batchFeeds"):
                            feed_api_url["value"] = response.url
                            print(f"  📡 [{shot_id}] Feed URL captured: {response.url[:100]}")
                    url = _extract_url_from_feed(data)
                    if url:
                        video_result["url"] = url
                        print(f"  🎬 [{shot_id}] Video found via feed listener: {url}")
                except Exception as e:
                    print(f"  ⚠️ [{shot_id}] monitor_feed error: {e}")

            page.on("response", capture_batch_id)
            page.on("response", monitor_feed)

            print(f"  🔘 [{shot_id}] Clicking Generate button...")
            generate_btn = await page.wait_for_selector("button.new-color-btn-bg", timeout=10000)
            await generate_btn.click()  # Playwright native click — triggers React handlers
            print(f"  ✅ [{shot_id}] Generate clicked! Waiting for batch ID...")
            await page.wait_for_timeout(5000)
            page.remove_listener("response", capture_batch_id)
            print(f"  ⏳ [{shot_id}] Tracking batch={gen_batch_id['value']} since t={submit_time_sec}")
            await page.screenshot(path=f"{SCREENSHOT_DIR}/step7_after_click_{shot_id}.png")

            # ── Step 7: Wait — listener + active polling fallback ──
            deadline = time.time() + VIDEO_WAIT_TIMEOUT_MS / 1000
            last_active_poll = 0.0

            while time.time() < deadline:
                if video_result["url"]:
                    break

                # Active poll every 15s once we have the feed URL
                # (handles case where page stops polling after cycleTime=0)
                now = time.time()
                if feed_api_url["value"] and (now - last_active_poll) >= 15:
                    last_active_poll = now
                    try:
                        feed_url_safe = feed_api_url["value"].replace('"', '')
                        result = await page.evaluate(f"""async () => {{
                            try {{
                                const r = await fetch("{feed_url_safe}", {{credentials: 'include'}});
                                if (!r.ok) return null;
                                return await r.json();
                            }} catch(e) {{ return null; }}
                        }}""")
                        if result:
                            url = _extract_url_from_feed(result)
                            if url:
                                video_result["url"] = url
                                print(f"  🎬 [{shot_id}] Video found via active poll: {url}")
                                break
                            else:
                                try:
                                    feeds = result.get("data", {}).get("batchFeeds", [{}])
                                    s = feeds[0].get("feeds", [{}])[0].get("commonInfo", {}).get("status", "?") if feeds else "?"
                                    bid_in = str(feeds[0].get("batchID", "?")) if feeds else "?"
                                    print(f"  ⏳ [{shot_id}] Active poll: batch={bid_in} status={s} (want batch={gen_batch_id['value']})")
                                except Exception:
                                    print(f"  ⏳ [{shot_id}] Active poll: processing...")
                    except Exception as e:
                        print(f"  ⚠️ [{shot_id}] Active poll error: {e}")

                await asyncio.sleep(2)

            page.remove_listener("response", monitor_feed)

            video_url = video_result["url"]
            if not video_url:
                raise Exception("Video generation timed out or URL not found in feed")
            await page.screenshot(path=f"{SCREENSHOT_DIR}/step8_done_{shot_id}.png")

            await page.screenshot(path=f"{SCREENSHOT_DIR}/step8_done_{shot_id}.png")
            print(f"  🎬 [{shot_id}] Video ready: {video_url}")
            return {"shot_id": shot_id, "status": "success", "message": "Video generated!", "video_url": video_url}

        except Exception as e:
            print(f"  ❌ [{shot_id}] ERROR: {e}")
            try:
                await page.screenshot(path=f"{SCREENSHOT_DIR}/final_error_{shot_id}.png")
            except Exception:
                pass
            return {"shot_id": shot_id, "status": "error", "message": str(e), "video_url": None}

        finally:
            pass  # keep the page and context open — Chrome stays running

# ─────────────────────────────────────────────
# AUTH ENDPOINTS
# ─────────────────────────────────────────────

@app.get("/auth/status")
async def auth_status():
    global _auth_cache
    if time.time() - _auth_cache["ts"] < _AUTH_CACHE_TTL:
        return {"logged_in": _auth_cache["logged_in"]}

    try:
        _kill_hailuo_chrome()
        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                user_data_dir=HAILUO_PROFILE_DIR,
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
        extra_args = ["--start-maximized"] if not HEADLESS else []
        _login_ctx = await _login_pw.chromium.launch_persistent_context(
            user_data_dir=HAILUO_PROFILE_DIR,
            headless=HEADLESS,
            args=extra_args + _chrome_launch_args(),
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


@app.post("/hailuo/open")
async def hailuo_open():
    """Open or focus hailuoai.video in the shared automation Chrome context."""
    try:
        context = await get_context()
        url = "https://hailuoai.video/create/image-to-video"

        # If a hailuoai tab is already open, bring it to front
        for p in context.pages:
            if "hailuoai" in p.url:
                await p.bring_to_front()
                return {"success": True}

        # Otherwise open a new tab
        page = await context.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        return {"success": True}
    except Exception as e:
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