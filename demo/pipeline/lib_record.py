"""Shared recording toolkit: cursor, captions, transitions, smooth input, scheduling."""
import json
import re
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parents[1]
BASE = "http://localhost:3000"
API = "http://localhost:8000/api/v1"
DEMO_CLIENT_NAME = "Mohan Reddy"


def load_timings():
    return json.loads((HERE / "timings.json").read_text())


def load_credentials():
    env = {}
    for line in (REPO / "backend" / ".env.dev").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env["INITIAL_ADMIN_EMAIL"], env["INITIAL_ADMIN_PASSWORD"]


def api(path, tok=None, data=None, method=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Content-Type": "application/json",
                 **({"Authorization": "Bearer " + tok} if tok else {})},
        method=method)
    return json.load(urllib.request.urlopen(req))


def api_token():
    email, password = load_credentials()
    return api("/auth/login", data={"email": email, "password": password})["access_token"]


def resolve_client_id(tok=None):
    """Find the demo client by name so re-seeding never breaks the scripts."""
    tok = tok or api_token()
    clients = api("/clients", tok)
    for c in clients:
        if c.get("name") == DEMO_CLIENT_NAME:
            return c["id"]
    raise SystemExit(
        f"Demo client {DEMO_CLIENT_NAME!r} not found — seed it first: "
        "python -m backend.seed_demo")


INIT_JS = r"""
(() => {
  function install() {
    if (document.getElementById('--demo-style')) return;
    const style = document.createElement('style');
    style.id = '--demo-style';
    style.textContent = `
      ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
      nextjs-portal { display: none !important; }
      #--demo-cursor {
        position: fixed; z-index: 2147483647; width: 26px; height: 26px;
        border-radius: 50%; background: rgba(30,41,59,.55);
        border: 2.5px solid #fff; box-shadow: 0 2px 10px rgba(0,0,0,.4);
        pointer-events: none; left: -100px; top: -100px;
        transform: translate(-50%,-50%); transition: width .12s, height .12s, background .12s;
      }
      #--demo-cursor.down { width: 18px; height: 18px; background: rgba(37,99,235,.85); }
      #--demo-lt {
        position: fixed; z-index: 2147483600; left: 292px; top: 80px;
        pointer-events: none;
        display: flex; align-items: stretch; gap: 12px;
        background: rgba(15,23,42,.86); backdrop-filter: blur(8px);
        border-radius: 12px; padding: 12px 20px 12px 0; color: #fff;
        font-family: 'Segoe UI', system-ui, sans-serif;
        box-shadow: 0 8px 30px rgba(0,0,0,.35);
        opacity: 0; transform: translateY(-12px);
        transition: opacity .5s ease, transform .5s ease;
      }
      #--demo-lt.show { opacity: 1; transform: translateY(0); }
      #--demo-lt .bar { width: 5px; border-radius: 12px 0 0 12px; background: linear-gradient(180deg, var(--demo-accent, #60a5fa), #2563eb); }
      #--demo-lt .t { font-size: 17px; font-weight: 600; }
      #--demo-lt .s { font-size: 12.5px; color: #cbd5e1; margin-top: 1px; }
      #--demo-cap-sub {
        position: fixed; z-index: 2147483630; left: 50%; bottom: 44px;
        pointer-events: none;
        transform: translateX(-50%); max-width: 72%;
        background: rgba(10,14,26,.82); color: #fff; text-align: center;
        font-family: 'Segoe UI', system-ui, sans-serif; font-size: var(--cap-sub, 26px); font-weight: 500;
        line-height: 1.35; padding: 10px 26px; border-radius: 12px;
        opacity: 0; transition: opacity .22s ease;
        text-shadow: 0 2px 6px rgba(0,0,0,.7);
      }
      #--demo-cap-sub.show { opacity: 1; }
      #--demo-cap-pop {
        position: fixed; z-index: 2147483630; left: 50%; top: 66%;
        transform: translate(-50%,-50%) scale(.7); width: 88%;
        color: #fff; text-align: center;
        font-family: 'Segoe UI', system-ui, sans-serif; font-size: var(--cap-pop, 58px); font-weight: 800;
        line-height: 1.12; letter-spacing: -.5px; text-transform: uppercase;
        text-shadow: 0 3px 14px rgba(0,0,0,.85), 0 0 40px rgba(0,0,0,.5);
        opacity: 0; transition: opacity .16s ease, transform .18s cubic-bezier(.2,1.6,.4,1);
        pointer-events: none;
      }
      #--demo-cap-pop.show { opacity: 1; transform: translate(-50%,-50%) scale(1); }
      #--demo-cap-pop em { font-style: normal; color: var(--demo-accent, #fbbf24); }
      #--demo-curtain {
        position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;
        display: flex;
      }
      #--demo-curtain .p {
        flex: 1; background: var(--demo-curtain-color, #0f172a);
        transform: translateY(-101%); transition: transform .38s cubic-bezier(.7,0,.3,1);
      }
      #--demo-curtain .p:nth-child(2) { transition-delay: .06s; }
      #--demo-curtain .p:nth-child(3) { transition-delay: .12s; }
      #--demo-curtain.on .p { transform: translateY(0); }
      #--demo-card {
        position: fixed; inset: 0; z-index: 2147483640;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: radial-gradient(140% 90% at 50% 35%, #1e293b 0%, #0f172a 70%);
        color: #fff; font-family: 'Segoe UI', system-ui, sans-serif; text-align: center;
        opacity: 0; transition: opacity .8s ease; padding: 0 6%;
      }
      #--demo-card.show { opacity: 1; }
      #--demo-card .logo { font-size: var(--demo-logo-size, 58px); font-weight: 700; letter-spacing: -1px; }
      #--demo-card .logo em { font-style: normal; color: var(--demo-accent, #60a5fa); }
      #--demo-card .tag { font-size: var(--demo-tag-size, 21px); color: #e2e8f0; margin-top: 16px; font-weight: 400; line-height: 1.3; }
      #--demo-card .sub { font-size: 14px; color: #64748b; margin-top: 30px; letter-spacing: 2.5px; text-transform: uppercase; }
      @keyframes demo-pulse { 0%,100% { transform: scale(1);} 50% { transform: scale(1.06);} }
    `;
    document.head.appendChild(style);
    const c = document.createElement('div');
    c.id = '--demo-cursor';
    document.body.appendChild(c);
    document.addEventListener('mousemove', e => {
      c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px';
    }, true);
    document.addEventListener('mousedown', () => c.classList.add('down'), true);
    document.addEventListener('mouseup', () => c.classList.remove('down'), true);

    window.__cap = (cues, style) => {
      const id = style === 'pop' ? '--demo-cap-pop' : '--demo-cap-sub';
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
      (window.__capTimers = window.__capTimers || []).forEach(clearTimeout);
      window.__capTimers = [];
      cues.forEach(cue => {
        window.__capTimers.push(setTimeout(() => {
          el.classList.remove('show');
          void el.offsetWidth;
          el.innerHTML = cue.html;
          el.classList.add('show');
        }, Math.max(cue.at, 0)));
        window.__capTimers.push(setTimeout(() => {
          el.classList.remove('show');
        }, Math.max(cue.at, 0) + cue.dur));
      });
    };
    window.__curtain = (on, color) => {
      let el = document.getElementById('--demo-curtain');
      if (!el) {
        el = document.createElement('div'); el.id = '--demo-curtain';
        el.innerHTML = '<div class="p"></div><div class="p"></div><div class="p"></div>';
        document.body.appendChild(el);
      }
      if (color) el.style.setProperty('--demo-curtain-color', color);
      el.classList.toggle('on', on);
    };
    window.__accent = c => document.documentElement.style.setProperty('--demo-accent', c);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', install);
  else install();
})();
"""

OVERLAY_JS = """
([title, sub]) => {
  document.getElementById('--demo-lt')?.remove();
  if (!title) return;
  const d = document.createElement('div');
  d.id = '--demo-lt';
  d.innerHTML = `<div class="bar"></div><div><div class="t"></div><div class="s"></div></div>`;
  d.querySelector('.t').textContent = title;
  d.querySelector('.s').textContent = sub || '';
  document.body.appendChild(d);
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('show')));
}
"""

CARD_JS = """
([logoHtml, tag, sub, logoSize, tagSize]) => {
  document.getElementById('--demo-card')?.remove();
  if (!logoHtml) return;
  const d = document.createElement('div');
  d.id = '--demo-card';
  if (logoSize) d.style.setProperty('--demo-logo-size', logoSize);
  if (tagSize) d.style.setProperty('--demo-tag-size', tagSize);
  d.innerHTML = `<div class="logo">${logoHtml}</div>` +
    (tag ? `<div class="tag">${tag}</div>` : '') +
    (sub ? `<div class="sub">${sub}</div>` : '');
  document.body.appendChild(d);
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('show')));
}
"""

HIDE_CARD_JS = "() => { const d = document.getElementById('--demo-card'); if (d) { d.classList.remove('show'); setTimeout(() => d.remove(), 900); } }"


def chunk_words(words, max_words, gap=0.55):
    """Group word timings into caption cues [(start, end, text)]."""
    chunks, cur = [], []
    for w in words:
        if cur and (len(cur) >= max_words or w["t"] - (cur[-1]["t"] + cur[-1]["d"]) > gap
                    or cur[-1]["w"].rstrip().endswith((".", "?", "!", ","))
                    and len(cur) >= max(2, max_words - 2)):
            chunks.append(cur)
            cur = []
        cur.append(w)
    if cur:
        chunks.append(cur)
    out = []
    for i, ch in enumerate(chunks):
        start = ch[0]["t"]
        end = chunks[i + 1][0]["t"] - 0.06 if i + 1 < len(chunks) else ch[-1]["t"] + ch[-1]["d"] + 0.5
        text = " ".join(w["w"].strip() for w in ch)
        out.append((start, min(end, start + 5.0), text))
    return out


HIGHLIGHT = re.compile(
    r"\b(AI|quotation|quotations?|checkpoint|checkpoints?|changed|minutes?|hours?|"
    r"one click|reve8|paperwork|design|phase|verify|added|removed|evenings)\b", re.I)


def emphasize(text: str) -> str:
    """Wrap key words in <em> for the pop caption accent colour."""
    return HIGHLIGHT.sub(lambda m: f"<em>{m.group(0)}</em>", text)


class Recorder:
    def __init__(self, page, t0, log):
        self.page, self.t0, self.log = page, t0, log
        self.cur = {"x": 400, "y": 400}

    def now(self):
        return time.monotonic() - self.t0

    def until(self, t):
        d = t - self.now()
        if d > 0:
            time.sleep(d)

    def safe(self, label, fn):
        try:
            fn()
        except Exception as e:
            msg = str(e).replace("\n", " ")[:130]
            self.log.append(f"[{self.now():6.1f}s] FAILED {label}: {type(e).__name__}: {msg}")
        else:
            self.log.append(f"[{self.now():6.1f}s] ok {label}")

    def glide(self, x, y, dur=0.7):
        x0, y0 = self.cur["x"], self.cur["y"]
        start = time.monotonic()
        while True:
            k = min((time.monotonic() - start) / dur, 1.0)
            e = k * k * (3 - 2 * k)
            self.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
            if k >= 1.0:
                break
            time.sleep(0.016)
        self.cur["x"], self.cur["y"] = x, y

    def glide_to(self, locator, dur=0.7):
        # pages render hidden mobile/desktop duplicates — only target visible ones
        target = locator.filter(visible=True).first
        target.wait_for(state="visible", timeout=5000)
        target.scroll_into_view_if_needed(timeout=5000)
        time.sleep(0.25)
        box = target.bounding_box()
        self.glide(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, dur)
        return target

    def click_smooth(self, locator, dur=0.7):
        self.glide_to(locator, dur)
        time.sleep(0.12)
        self.page.mouse.down()
        time.sleep(0.09)
        self.page.mouse.up()

    def scroll_by(self, dy, dur=1.2):
        start, done = time.monotonic(), 0.0
        while True:
            k = min((time.monotonic() - start) / dur, 1.0)
            step = dy * k - done
            self.page.mouse.wheel(0, step)
            done += step
            if k >= 1.0:
                break
            time.sleep(0.03)

    def overlay(self, title, sub=""):
        self.safe(f"overlay:{title}", lambda: self.page.evaluate(OVERLAY_JS, [title, sub]))

    def card(self, logo, tag="", sub="", logo_size=None, tag_size=None):
        self.page.evaluate(CARD_JS, [logo, tag, sub, logo_size, tag_size])

    def hide_card(self):
        self.page.evaluate(HIDE_CARD_JS)

    def curtain(self, fn, color="#0f172a", hold=0.45):
        """Cover the screen, run fn (client-side nav etc), reveal."""
        self.safe("curtain-on", lambda: self.page.evaluate("c => window.__curtain(true, c)", color))
        time.sleep(hold)
        fn()
        time.sleep(0.15)
        self.safe("curtain-off", lambda: self.page.evaluate("() => window.__curtain(false)"))

    def captions(self, video, seg, seg_start, style="sub", max_words=9, em=False):
        """Push caption cues for a narration segment; call at/after scene start."""
        words = load_timings()[video][seg]["words"]
        cues = []
        t_inj = self.now()
        for start, end, text in chunk_words(words, max_words):
            html = emphasize(text) if em else text
            cues.append({"at": int((seg_start + start - t_inj) * 1000),
                         "dur": int((end - start) * 1000), "html": html})
        self.safe(f"cap:{seg}", lambda: self.page.evaluate(
            "([cues, style]) => window.__cap(cues, style)", [cues, style]))

    def accent(self, color):
        self.safe("accent", lambda: self.page.evaluate("c => window.__accent(c)", color))

    def nav(self, locator, url_glob, smooth=True, attempts=3):
        """Click a link and confirm the URL changed; retry, then hard-goto fallback."""
        target = locator.filter(visible=True).first
        for i in range(attempts):
            try:
                if i == 0 and smooth:
                    self.click_smooth(target, 0.7)
                else:
                    target.click(timeout=1800)
                self.page.wait_for_url(url_glob, timeout=2000)
                self.page.wait_for_load_state("networkidle", timeout=3000)
                return
            except Exception:
                continue
        href = target.get_attribute("href")
        if href:
            self.page.goto(BASE + href if href.startswith("/") else href,
                           wait_until="networkidle")
