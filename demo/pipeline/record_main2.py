"""Main web demo v2 (16:9, 146s): subtitles, curtain transitions, all features.

Scenes: intro/login 0-12 | dashboard 12-23 | clients 23-33 | checkpoints+AI 33-60 |
quotation 60-78 | what-changed 78-93 | theme+approve 93-106 | materials 106-120 |
column setup 120-133 | end card 133-146
"""
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from lib_record import BASE, CARD_JS, INIT_JS, Recorder, load_credentials, resolve_client_id

EMAIL, PASSWORD = load_credentials()
CLIENT_ID = resolve_client_id()
OUT = Path(__file__).parent / "video"
OUT.mkdir(exist_ok=True)

log = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        viewport={"width": 1920, "height": 1080},
        record_video_dir=str(OUT),
        record_video_size={"width": 1920, "height": 1080},
    )
    ctx.add_init_script(INIT_JS)
    page = ctx.new_page()
    page.set_default_timeout(5000)
    rec_start = time.monotonic()
    page.goto(f"{BASE}/login", wait_until="networkidle")
    t0 = time.monotonic()
    lead = t0 - rec_start

    r = Recorder(page, t0, log)
    cap = lambda seg, start, mw=9: r.captions("main", seg, start, "sub", mw)

    # S1 intro + login (0-12)
    r.card("<em>reve8</em> Designer Portal",
           "From client conversations to polished quotations", "a quick tour")
    cap("s1", 0.8)
    r.until(4.4)
    r.hide_card()
    r.until(5.4)
    r.safe("type email", lambda: (
        r.click_smooth(page.get_by_placeholder("user@example.com"), 0.6),
        page.keyboard.type(EMAIL, delay=38),
    ))
    r.safe("type password", lambda: (
        r.click_smooth(page.get_by_placeholder("••••••••"), 0.5),
        page.keyboard.type(PASSWORD, delay=32),
    ))
    r.until(10.2)
    r.safe("sign in", lambda: (
        r.click_smooth(page.get_by_role("button", name=re.compile("Sign In", re.I)), 0.5),
        page.wait_for_url("**/dashboard**", timeout=8000),
    ))

    # S2 dashboard (12-23)
    r.until(12.4)
    r.overlay("Dashboard", "Every client, every phase")
    cap("s2", 12.4)
    r.safe("kanban sweep", lambda: (r.glide(430, 420, 1.4), time.sleep(0.5),
                                    r.glide(1000, 480, 1.5), time.sleep(0.4),
                                    r.glide(1560, 420, 1.5)))
    r.until(19.0)
    r.safe("kanban scroll", lambda: (r.scroll_by(320, 1.2), time.sleep(0.4), r.scroll_by(-320, 0.9)))

    # S3 clients (23-33)
    r.until(22.6)
    r.curtain(lambda: (
        r.safe("nav clients", lambda: r.nav(
            page.get_by_role("link", name=re.compile(r"^Clients$", re.I)),
            "**/dashboard/clients**", smooth=False)),
    ))
    r.overlay("Clients", "One home per client")
    cap("s3", 23.4)
    r.until(24.6)
    r.safe("open client", lambda: (
        r.click_smooth(page.get_by_text("Mohan Reddy"), 0.8),
        page.get_by_role("link", name=re.compile("Checkpoints")).filter(visible=True).first.wait_for(timeout=4000),
    ))
    r.until(27.5)
    r.safe("detail sweep", lambda: (r.scroll_by(280, 1.2), time.sleep(0.5),
                                    r.glide(700, 620, 1.0), time.sleep(0.4), r.glide(1250, 620, 1.1)))

    # S4 checkpoints + AI extract + live add (33-60)
    r.until(32.4)
    r.safe("goto checkpoints", lambda: r.nav(
        page.get_by_role("link", name=re.compile("Checkpoints")), "**/checkpoints**"))
    r.overlay("AI Extract", "Meeting notes in — line items out")
    cap("s4", 33.6)
    r.until(35.0)
    r.safe("open ai modal", lambda: (
        r.click_smooth(page.get_by_role("button", name=re.compile(r"\+ AI Extract")), 0.7),
        page.get_by_text("AI Extract — New Checkpoint").wait_for(timeout=5000),
    ))
    r.until(37.2)
    r.safe("type notes", lambda: (
        r.click_smooth(page.locator("textarea"), 0.5),
        page.keyboard.type(
            "Client wants a walk-in wardrobe in the master bedroom, "
            "false ceiling with cove lighting in the living room, "
            "and granite counters in the kitchen. Budget around 19 lakhs.",
            delay=11,
        ),
    ))
    r.until(42.6)
    r.safe("hover audio tab", lambda: r.glide_to(page.get_by_text("Audio File"), 0.6))
    r.until(44.4)
    r.safe("close modal", lambda: r.click_smooth(page.get_by_role("button", name="✕"), 0.5))
    r.until(46.0)
    r.safe("open card extract tab", lambda: r.click_smooth(
        page.get_by_role("button", name=re.compile(r"AI Extract \(0")), 0.7))
    r.until(48.2)
    r.safe("scroll items", lambda: r.scroll_by(240, 1.1))
    r.until(50.4)
    r.safe("verify all", lambda: r.click_smooth(page.get_by_text("Verify all"), 0.7))
    r.until(53.4)
    r.safe("add to quotation", lambda: (
        r.click_smooth(page.get_by_role("button", name=re.compile(r"Add to Quotation \(")), 0.8),
        page.get_by_text("Added to Quotation").filter(visible=True).first.wait_for(timeout=6000),
    ))
    r.until(57.0)
    r.safe("show locked", lambda: r.glide_to(page.get_by_text("Added to Quotation"), 0.7))

    # S5 quotation + collapse/expand (60-78)
    r.until(59.4)
    r.safe("goto quotation", lambda: r.nav(
        page.get_by_role("link", name=re.compile(r"Quotation")), "**/quotation**"))
    r.overlay("Quotation", "Room by room — totals always current")
    cap("s5", 60.4)
    r.until(62.0)
    r.safe("totals sweep", lambda: (r.glide(700, 260, 1.2), time.sleep(0.4),
                                    r.glide(1100, 260, 1.0), time.sleep(0.3), r.glide(1480, 260, 1.0)))
    r.until(67.0)
    r.safe("collapse all", lambda: r.click_smooth(
        page.get_by_role("button", name=re.compile("Collapse All", re.I)), 0.7))
    r.until(69.4)
    r.safe("collapsed scroll", lambda: (r.scroll_by(500, 1.6), time.sleep(0.3), r.scroll_by(-500, 1.1)))
    r.until(73.0)
    r.safe("expand all", lambda: r.click_smooth(
        page.get_by_role("button", name=re.compile("Expand All", re.I)), 0.7))
    r.safe("rooms scroll", lambda: r.scroll_by(700, 2.4))

    # S6 what changed (78-93)
    r.until(78.0)
    r.safe("scroll top", lambda: r.scroll_by(-4000, 1.0))
    r.overlay("What Changed", "Added · removed · modified — since any checkpoint")
    cap("s6", 78.4)
    r.safe("open diff", lambda: (
        r.click_smooth(page.get_by_role("button", name=re.compile("What Changed", re.I)), 0.8),
        page.get_by_text("Show changes from").wait_for(timeout=5000),
    ))
    r.until(82.4)
    def pick_snapshot():
        sel = page.locator("select").filter(visible=True).first
        r.glide_to(sel, 0.6)
        n = sel.locator("option").count()
        sel.select_option(index=n - 1)
    r.safe("pick snapshot", pick_snapshot)
    r.until(85.4)
    r.safe("diff scroll", lambda: r.scroll_by(260, 1.4))
    r.until(88.4)
    r.safe("click diff row", lambda: r.click_smooth(
        page.locator("button").filter(has_text="@ ₹"), 0.8))
    r.safe("modal really closed", lambda: page.get_by_text("Show changes from")
           .wait_for(state="hidden", timeout=3000))

    # S7 theme + export/approve (93-106)
    r.until(93.0)
    r.overlay("Your Style", "Light or dark — one click")
    cap("s9", 93.4)
    def theme(item):
        target = page.get_by_text(f"{item} Mode")
        for _ in range(4):
            if target.filter(visible=True).count() > 0:
                r.click_smooth(target, 0.5)
                return
            r.glide_to(page.get_by_text("Raghava"), 0.4)
            page.get_by_text("Raghava").filter(visible=True).first.click(timeout=1500)
            time.sleep(0.6)
        raise RuntimeError("user menu never opened")
    r.safe("theme light", lambda: theme("Light"))
    r.until(97.0)
    r.safe("light sweep", lambda: r.glide(1000, 500, 1.4))
    r.until(99.0)
    r.safe("theme dark", lambda: theme("Dark"))
    r.safe("close menus", lambda: page.mouse.click(760, 30))
    r.until(101.0)
    r.safe("hover export", lambda: r.glide_to(
        page.get_by_role("button", name=re.compile("Export Excel", re.I)), 0.8))
    r.until(103.2)
    r.safe("hover approve", lambda: r.glide_to(
        page.get_by_role("button", name=re.compile("Approve Quotation", re.I)), 0.8))

    # S8 materials & rates (106-120)
    r.until(105.6)
    r.curtain(lambda: (
        r.safe("nav materials", lambda: r.nav(
            page.get_by_role("link", name=re.compile("Materials", re.I)),
            "**/materials**", smooth=False)),
    ))
    r.overlay("Materials & Rates", "Your catalogue — Excel, AI, or manual")
    cap("s7", 106.4)
    r.until(107.8)
    r.safe("margins sweep", lambda: (r.glide(700, 380, 1.2), time.sleep(0.4), r.scroll_by(280, 1.2)))
    r.until(111.4)
    r.safe("open add materials", lambda: r.click_smooth(
        page.get_by_role("button", name=re.compile("Add Material")), 0.7))
    r.until(113.6)
    r.safe("tab excel", lambda: r.click_smooth(page.get_by_text("Excel Upload"), 0.6))
    r.until(115.4)
    r.safe("tab ai", lambda: r.click_smooth(page.get_by_text("AI Extract").last, 0.6))
    r.until(117.0)
    r.safe("tab manual", lambda: r.click_smooth(page.get_by_text("Manual"), 0.6))
    r.until(118.4)
    r.safe("close add modal", lambda: (
        r.click_smooth(page.locator("div.fixed.inset-0 button").first, 0.5),
        page.get_by_text("Add Materials").wait_for(state="hidden", timeout=3000),
    ))

    # S9 column setup (120-133)
    r.until(119.6)
    r.curtain(lambda: (
        r.safe("nav columns", lambda: r.nav(
            page.get_by_role("link", name=re.compile("Column Setup", re.I)),
            "**/settings/columns**", smooth=False)),
    ))
    r.overlay("Column Setup", "Make the tables yours")
    cap("s8", 120.4)
    r.until(122.4)
    r.safe("columns sweep", lambda: (r.glide(800, 400, 1.2), time.sleep(0.4), r.scroll_by(280, 1.3)))
    r.until(126.0)
    r.safe("add column", lambda: r.click_smooth(
        page.get_by_role("button", name=re.compile("Add Column", re.I)), 0.7))
    r.until(128.0)
    r.safe("type column", lambda: (
        page.keyboard.type("Warranty", delay=45),
    ))
    r.until(130.5)
    r.safe("hover save", lambda: r.glide_to(
        page.get_by_role("button", name=re.compile("Save Changes", re.I)), 0.8))

    # S10 end card (133-146)
    r.until(133.2)
    r.safe("end card", lambda: r.card(
        "<em>reve8</em> Designer Portal",
        "From conversation to quotation — in minutes.<br>Less paperwork. More design.",
        "get started today"))
    r.until(146.5)

    video_path = page.video.path()
    ctx.close()
    browser.close()

print(f"LEAD={lead:.2f}")
print(f"VIDEO={video_path}")
for line in log:
    print(line.encode("ascii", "replace").decode(), file=sys.stdout)
