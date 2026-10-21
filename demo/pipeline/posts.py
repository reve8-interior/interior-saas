"""Generate 3 social posts (1080x1080 PNG): app screenshot + catchy headline."""
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from lib_record import BASE, load_credentials, resolve_client_id

EMAIL, PASSWORD = load_credentials()
CLIENT_ID = resolve_client_id()
HERE = Path(__file__).parent
SHOTS = HERE / "shots"
POSTS = HERE / "posts"
SHOTS.mkdir(exist_ok=True)
POSTS.mkdir(exist_ok=True)

POST_TMPL = """<!doctype html><html><head><meta charset="utf-8"><style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{
    width:1080px; height:1080px; overflow:hidden;
    font-family:'Segoe UI', system-ui, sans-serif; color:#fff;
    background: radial-gradient(120% 100% at 20% 0%, #1e293b 0%, #0f172a 60%, #0a0f1c 100%);
    display:flex; flex-direction:column;
  }}
  .kicker {{
    margin:64px 72px 0; font-size:21px; letter-spacing:4px; font-weight:600;
    color:{accent}; text-transform:uppercase;
  }}
  h1 {{ margin:22px 72px 0; font-size:64px; font-weight:800; line-height:1.08; letter-spacing:-1px; }}
  h1 em {{ font-style:normal; color:{accent}; }}
  .sub {{ margin:26px 72px 0; font-size:27px; line-height:1.4; color:#cbd5e1; max-width:900px; }}
  .shot {{
    position:absolute; left:72px; right:-120px; bottom:-150px; top:470px;
    border-radius:18px; overflow:hidden; border:1px solid rgba(148,163,184,.25);
    box-shadow:0 30px 90px rgba(0,0,0,.6); transform:rotate(-1.2deg);
    background:#0b1220;
  }}
  .shot img {{ width:100%; display:block; }}
  .footer {{
    position:absolute; left:0; right:0; bottom:0; height:74px;
    background:rgba(8,12,22,.92); display:flex; align-items:center; justify-content:space-between;
    padding:0 72px; z-index:5; border-top:1px solid rgba(148,163,184,.18);
  }}
  .brand {{ font-size:26px; font-weight:700; }}
  .brand em {{ font-style:normal; color:{accent}; }}
  .tag {{ font-size:19px; color:#94a3b8; letter-spacing:1px; }}
</style></head><body>
  <div class="kicker">{kicker}</div>
  <h1>{headline}</h1>
  <div class="sub">{sub}</div>
  <div class="shot"><img src="{img}"></div>
  <div class="footer"><div class="brand"><em>reve8</em> designer portal</div>
  <div class="tag">{tag}</div></div>
</body></html>"""

POSTS_SPEC = [
    {
        "name": "post1-ai-extract", "accent": "#fbbf24", "shot": "extract",
        "kicker": "AI-powered quotations",
        "headline": "Meeting notes → quotation. <em>Automatically.</em>",
        "sub": "Paste your notes or upload a voice memo — the AI extracts rooms, "
               "sizes and rates straight into your quotation.",
        "tag": "less paperwork · more design",
    },
    {
        "name": "post2-what-changed", "accent": "#60a5fa", "shot": "diff",
        "kicker": "Every change, tracked",
        "headline": "Your client changed their mind. <em>Again.</em>",
        "sub": "See exactly what was added, removed or modified — since any "
               "checkpoint. One click, total transparency.",
        "tag": "never lose track again",
    },
    {
        "name": "post3-overview", "accent": "#34d399", "shot": "dash",
        "kicker": "One portal for your studio",
        "headline": "Run your studio, <em>not your spreadsheets.</em>",
        "sub": "Clients, checkpoints, designs and quotations — every phase of "
               "every project, in one place.",
        "tag": "get your evenings back",
    },
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1500, "height": 950}, device_scale_factor=2)
    page = ctx.new_page()
    page.set_default_timeout(8000)
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.get_by_placeholder("user@example.com").fill(EMAIL)
    page.get_by_placeholder("••••••••").fill(PASSWORD)
    page.get_by_role("button", name=re.compile("Sign In", re.I)).click()
    page.wait_for_url("**/dashboard**", timeout=10000)
    time.sleep(2)
    page.screenshot(path=str(SHOTS / "dash.png"))

    page.goto(f"{BASE}/dashboard/clients/{CLIENT_ID}/checkpoints", wait_until="networkidle")
    time.sleep(1.5)
    page.get_by_role("button", name=re.compile(r"AI Extract \(")).first.click()
    time.sleep(1.2)
    page.screenshot(path=str(SHOTS / "extract.png"))

    page.goto(f"{BASE}/dashboard/clients/{CLIENT_ID}/quotation", wait_until="networkidle")
    time.sleep(1.5)
    page.get_by_role("button", name=re.compile("What Changed", re.I)).first.click()
    page.get_by_text("Show changes from").wait_for(timeout=5000)
    sel = page.locator("select").first
    n = sel.locator("option").count()
    if n > 1:
        sel.select_option(index=n - 1)
    time.sleep(1.2)
    page.screenshot(path=str(SHOTS / "diff.png"))

    # compose posts
    post_page = ctx.new_page()
    post_page.set_viewport_size({"width": 1080, "height": 1080})
    for spec in POSTS_SPEC:
        html = POST_TMPL.format(
            accent=spec["accent"], kicker=spec["kicker"], headline=spec["headline"],
            sub=spec["sub"], tag=spec["tag"],
            img=(SHOTS / f"{spec['shot']}.png").as_uri(),
        )
        f = HERE / f"_{spec['name']}.html"
        f.write_text(html, encoding="utf-8")
        post_page.goto(f.as_uri())
        post_page.wait_for_load_state("networkidle")
        time.sleep(0.4)
        post_page.screenshot(path=str(POSTS / f"{spec['name']}.png"))
        print("post:", spec["name"])
    browser.close()
print("done")
