import asyncio
from playwright.async_api import async_playwright

async def login():
    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir="./hailuo_profile",
            headless=False,
            channel="chrome",
            args=["--start-maximized"],
            viewport=None
        )
        page = await context.new_page()
        await page.goto("https://hailuoai.video")
        print("👉 Log in manually, then press Enter...")
        input()
        await context.close()

asyncio.run(login())