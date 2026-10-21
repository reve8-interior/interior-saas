"""Vertical (9:16) recordings: reels 1-3 and the mobile walkthrough.

Usage: python record_vertical.py <reel1|reel2|reel3|mobile>
"""
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from lib_record import BASE, INIT_JS, Recorder, load_credentials, resolve_client_id

EMAIL, PASSWORD = load_credentials()
CLIENT_ID = resolve_client_id()
OUT = Path(__file__).parent / "video"
OUT.mkdir(exist_ok=True)

KEY = sys.argv[1]
ACCENTS = {"reel1": "#fbbf24", "reel2": "#60a5fa", "reel3": "#34d399", "mobile": "#60a5fa"}

CAP_VARS_JS = """
(() => {
  function set() {
    const s = document.documentElement.style;
    s.setProperty('--cap-sub', '23px');
    s.setProperty('--cap-pop', '42px');
    s.setProperty('--demo-accent', '%ACCENT%');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', set);
  else set();
})();
""".replace("%ACCENT%", ACCENTS[KEY])


def fast_login(page):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.get_by_placeholder("user@example.com").fill(EMAIL)
    page.get_by_placeholder("••••••••").fill(PASSWORD)
    page.get_by_role("button", name=re.compile("Sign In", re.I)).click()
    page.wait_for_url("**/dashboard**", timeout=10000)


def nav_drawer(r, page, link_re, url_glob):
    """Open the mobile hamburger drawer and tap a nav link."""
    r.click_smooth(page.get_by_label("Open sidebar"), 0.6)
    time.sleep(0.5)
    r.nav(page.get_by_role("link", name=link_re), url_glob)


def reel1(r, page):
    cap = lambda seg, start: r.captions("reel1", seg, start, "pop", 3, em=True)
    r.card("STILL TYPING QUOTATIONS<br>BY HAND?", "", "", "44px")
    cap("s1", 0.5)
    r.until(3.0)
    r.hide_card()
    r.until(3.4)
    r.safe("timeline scroll", lambda: (r.scroll_by(300, 1.4), time.sleep(0.4), r.scroll_by(-300, 1.0)))
    r.until(6.6)
    cap("s2", 6.4)
    r.safe("open ai modal", lambda: (
        r.click_smooth(page.get_by_role("button", name=re.compile(r"\+ AI Extract")), 0.6),
        page.get_by_text("AI Extract — New Checkpoint").wait_for(timeout=5000),
    ))
    r.until(8.6)
    r.safe("type notes", lambda: (
        r.click_smooth(page.locator("textarea"), 0.5),
        page.keyboard.type(
            "Walk-in wardrobe in master bedroom, false ceiling with cove lighting, "
            "granite kitchen counters. Budget 19 lakhs.", delay=10),
    ))
    r.until(13.4)
    r.safe("close modal", lambda: r.click_smooth(page.get_by_role("button", name="✕"), 0.5))
    r.until(14.6)
    r.safe("open extract tab", lambda: r.click_smooth(
        page.get_by_role("button", name=re.compile(r"AI Extract \(0")), 0.7))
    r.until(16.4)
    r.safe("scroll items", lambda: r.scroll_by(220, 1.1))
    r.until(18.0)
    cap("s3", 17.6)
    r.safe("verify all", lambda: r.click_smooth(page.get_by_text("Verify all"), 0.7))
    r.until(20.4)
    r.safe("add to quotation", lambda: (
        r.click_smooth(page.get_by_role("button", name=re.compile(r"Add to Quotation \(")), 0.7),
        page.get_by_text("Added to Quotation").filter(visible=True).first.wait_for(timeout=6000),
    ))
    r.until(23.4)
    r.safe("show badge", lambda: r.glide_to(page.get_by_text("Added to Quotation"), 0.6))
    r.until(25.8)
    r.card("<em>reve8</em>", "Less paperwork.<br>More design.", "designer portal", "56px", "26px")
    cap("s4", 25.8)
    r.until(33.5)


def reel2(r, page):
    cap = lambda seg, start: r.captions("reel2", seg, start, "pop", 3, em=True)
    r.card("YOUR CLIENT CHANGED<br>THEIR MIND. <em>AGAIN.</em>", "", "", "40px")
    cap("s1", 0.5)
    r.until(3.0)
    r.hide_card()
    r.until(3.4)
    r.safe("totals scroll", lambda: (r.scroll_by(380, 1.6), time.sleep(0.5), r.scroll_by(-380, 1.1)))
    r.until(7.6)
    cap("s2", 7.4)
    r.safe("open diff", lambda: (
        r.click_smooth(page.get_by_role("button", name=re.compile("What Changed", re.I)), 0.7),
        page.get_by_text("Show changes from").wait_for(timeout=5000),
    ))
    r.until(10.4)
    def pick():
        sel = page.locator("select").filter(visible=True).first
        r.glide_to(sel, 0.6)
        sel.select_option(index=sel.locator("option").count() - 1)
    r.safe("pick snapshot", pick)
    r.until(13.0)
    r.safe("diff scroll", lambda: (r.scroll_by(240, 1.5), time.sleep(0.6), r.scroll_by(180, 1.2)))
    r.until(17.6)
    cap("s3", 15.4)
    r.safe("click diff row", lambda: r.click_smooth(
        page.locator("button").filter(has_text="@ ₹"), 0.8))
    r.until(21.0)
    r.safe("flash settle", lambda: time.sleep(0.8))
    r.until(23.4)
    r.card("<em>reve8</em>", "Never lose track<br>again.", "designer portal", "56px", "26px")
    cap("s4", 23.4)
    r.until(29.5)


def reel3(r, page):
    cap = lambda seg, start: r.captions("reel3", seg, start, "pop", 3, em=True)
    r.card("HOW MUCH OF YOUR WEEK<br>GOES INTO <em>PAPERWORK?</em>", "", "", "36px")
    cap("s1", 0.5)
    r.until(3.0)
    r.hide_card()
    r.until(3.4)
    r.safe("dashboard scroll", lambda: (r.scroll_by(420, 1.6), time.sleep(0.4), r.scroll_by(-420, 1.1)))
    cap("s2", 5.9)
    r.until(7.0)
    r.safe("nav clients", lambda: nav_drawer(r, page, re.compile(r"^Clients$", re.I),
                                             "**/dashboard/clients**"))
    r.until(9.8)
    r.safe("open client", lambda: (
        r.click_smooth(page.get_by_text("Mohan Reddy"), 0.7),
        page.get_by_role("link", name=re.compile("Checkpoints")).filter(visible=True).first.wait_for(timeout=4000),
    ))
    r.until(12.4)
    r.safe("detail scroll", lambda: r.scroll_by(320, 1.4))
    r.until(16.6)
    cap("s3", 16.4)
    r.safe("goto checkpoints", lambda: r.nav(
        page.get_by_role("link", name=re.compile("Checkpoints")), "**/checkpoints**"))
    r.until(19.0)
    r.safe("timeline scroll", lambda: r.scroll_by(400, 2.0))
    r.until(23.6)
    cap("s4", 23.4)
    r.safe("goto quotation", lambda: (
        r.scroll_by(-2000, 0.8),
        r.nav(page.get_by_role("link", name=re.compile("Quotation")), "**/quotation**"),
    ))
    r.until(26.4)
    r.safe("totals scroll", lambda: r.scroll_by(420, 2.2))
    r.until(30.0)
    r.card("<em>reve8</em>", "Get your evenings<br>back.", "designer portal", "56px", "26px")
    cap("s5", 30.0)
    r.until(37.0)


def mobile(r, page):
    cap = lambda seg, start: r.captions("mobile", seg, start, "sub", 7)
    r.card("<em>reve8</em>", "Your studio.<br>On your phone.", "", "56px", "26px")
    cap("s1", 0.6)
    r.until(2.6)
    r.hide_card()
    r.until(3.0)
    r.safe("dashboard scroll", lambda: (r.scroll_by(420, 1.8), time.sleep(0.5), r.scroll_by(-420, 1.2)))
    r.until(7.4)
    cap("s2", 7.4)
    r.safe("nav clients", lambda: nav_drawer(r, page, re.compile(r"^Clients$", re.I),
                                             "**/dashboard/clients**"))
    r.until(10.2)
    r.safe("open client", lambda: (
        r.click_smooth(page.get_by_text("Mohan Reddy"), 0.7),
        page.get_by_role("link", name=re.compile("Checkpoints")).filter(visible=True).first.wait_for(timeout=4000),
    ))
    r.until(12.4)
    r.safe("detail scroll", lambda: r.scroll_by(300, 1.3))
    r.until(14.6)
    cap("s3", 14.4)
    r.safe("goto checkpoints", lambda: r.nav(
        page.get_by_role("link", name=re.compile("Checkpoints")), "**/checkpoints**"))
    r.until(16.8)
    r.safe("open ai modal", lambda: (
        r.click_smooth(page.get_by_role("button", name=re.compile(r"\+ AI Extract")), 0.6),
        page.get_by_text("AI Extract — New Checkpoint").wait_for(timeout=5000),
    ))
    r.until(18.4)
    r.safe("type notes", lambda: (
        r.click_smooth(page.locator("textarea"), 0.5),
        page.keyboard.type("Walk-in wardrobe, false ceiling, granite counters.", delay=14),
    ))
    r.until(22.0)
    r.safe("close modal", lambda: r.click_smooth(page.get_by_role("button", name="✕"), 0.5))
    r.until(23.4)
    r.safe("open extract tab", lambda: r.click_smooth(
        page.get_by_role("button", name=re.compile(r"AI Extract \(")), 0.7))
    r.until(25.2)
    r.safe("scroll items", lambda: r.scroll_by(220, 1.0))
    r.until(27.4)
    cap("s4", 27.4)
    r.safe("goto quotation", lambda: (
        r.scroll_by(-2000, 0.8),
        r.nav(page.get_by_role("link", name=re.compile("Quotation")), "**/quotation**"),
    ))
    r.until(30.0)
    r.safe("totals scroll", lambda: r.scroll_by(420, 2.0))
    r.until(34.6)
    cap("s5", 34.4)
    r.safe("open diff", lambda: (
        r.scroll_by(-2000, 0.7),
        r.click_smooth(page.get_by_role("button", name=re.compile("What Changed", re.I)), 0.7),
        page.get_by_text("Show changes from").wait_for(timeout=5000),
    ))
    r.until(38.0)
    def pick():
        sel = page.locator("select").filter(visible=True).first
        sel.select_option(index=sel.locator("option").count() - 1)
    r.safe("pick snapshot", pick)
    r.safe("diff scroll", lambda: r.scroll_by(200, 1.3))
    r.until(41.4)
    r.card("<em>reve8</em>", "Get your evenings<br>back.", "designer portal", "56px", "26px")
    cap("s6", 41.4)
    r.until(46.5)


START_PAGES = {
    "reel1": f"/dashboard/clients/{CLIENT_ID}/checkpoints",
    "reel2": f"/dashboard/clients/{CLIENT_ID}/quotation",
    "reel3": "/dashboard",
    "mobile": "/dashboard",
}
SCRIPTS = {"reel1": reel1, "reel2": reel2, "reel3": reel3, "mobile": mobile}

log = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    # record at native viewport size — Playwright does not upscale small
    # viewports to a larger record_video_size (it pads instead); the
    # assembly step scales 540x960 -> 1080x1920.
    ctx = browser.new_context(
        viewport={"width": 540, "height": 960},
        record_video_dir=str(OUT),
        record_video_size={"width": 540, "height": 960},
    )
    ctx.add_init_script(INIT_JS)
    ctx.add_init_script(CAP_VARS_JS)
    page = ctx.new_page()
    page.set_default_timeout(5000)
    rec_start = time.monotonic()
    fast_login(page)
    page.goto(f"{BASE}{START_PAGES[KEY]}", wait_until="networkidle")
    time.sleep(0.8)
    t0 = time.monotonic()
    lead = t0 - rec_start

    r = Recorder(page, t0, log)
    r.cur = {"x": 270, "y": 480}
    SCRIPTS[KEY](r, page)

    video_path = page.video.path()
    ctx.close()
    browser.close()

print(f"LEAD={lead:.2f}")
print(f"VIDEO={video_path}")
for line in log:
    print(line.encode("ascii", "replace").decode())
