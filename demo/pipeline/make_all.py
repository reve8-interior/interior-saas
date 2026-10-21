"""One-command demo/social-kit builder.

    python make_all.py                 # everything: 5 videos + 3 posts
    python make_all.py reel1 posts     # just some targets

Targets: main, reel2, reel1, reel3, mobile, posts, all (default).
Checks prerequisites, synthesizes voiceover only when the narration changed,
puts the demo data in the state each recording needs, records, assembles,
and copies the results into demo/.
"""
import glob
import hashlib
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
DEMO = HERE.parent
os.chdir(HERE)
PY = sys.executable

# target -> (record cmd, assemble key, output name, size, required cp2 state)
VIDEO_TARGETS = {
    "main": (["record_main2.py"], "main", "reve8-demo-web.mp4", "1920x1080", "pending"),
    "reel2": (["record_vertical.py", "reel2"], "reel2", "reve8-reel2-what-changed.mp4",
              "1080x1920", "applied"),
    "reel1": (["record_vertical.py", "reel1"], "reel1", "reve8-reel1-ai-extract.mp4",
              "1080x1920", "pending"),
    "reel3": (["record_vertical.py", "reel3"], "reel3", "reve8-reel3-overview.mp4",
              "1080x1920", "applied"),
    "mobile": (["record_vertical.py", "mobile"], "mobile", "reve8-demo-mobile.mp4",
               "1080x1920", "applied"),
}
ORDER = ["main", "reel2", "reel1", "reel3", "mobile", "posts"]


def run(cmd, **kw):
    print(f"\n== RUN: {' '.join(map(str, cmd))}", flush=True)
    r = subprocess.run([PY, *cmd], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", **kw)
    print(r.stdout, flush=True)
    if r.returncode != 0:
        print(r.stderr[-2500:], flush=True)
        raise SystemExit(f"FAILED: {cmd}")
    return r.stdout


def check_prereqs():
    print("== checking prerequisites", flush=True)
    for name, url in [("backend", "http://localhost:8000/health"),
                      ("frontend", "http://localhost:3000")]:
        try:
            urllib.request.urlopen(url, timeout=5)
        except Exception:
            raise SystemExit(
                f"{name} not reachable at {url} — start the dev stack first:\n"
                "  docker compose -f .compose/dev.yml up -d")
    try:
        import edge_tts  # noqa: F401
        import imageio_ffmpeg  # noqa: F401
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise SystemExit(f"missing dependency: {e.name} — "
                         "pip install edge-tts playwright imageio-ffmpeg")
    with sync_playwright() as p:
        if not Path(p.chromium.executable_path).exists():
            print("chromium missing — installing...", flush=True)
            subprocess.run([PY, "-m", "playwright", "install", "chromium"], check=True)
    from lib_record import resolve_client_id
    cid = resolve_client_id()
    print(f"prereqs OK (demo client {cid})", flush=True)


def ensure_audio():
    """Synthesize voiceover only when narration.py changed."""
    digest = hashlib.sha256(Path("narration.py").read_bytes()).hexdigest()
    stamp = HERE / "audio" / ".narration_hash"
    if stamp.exists() and stamp.read_text() == digest and (HERE / "timings.json").exists():
        print("== voiceover up to date", flush=True)
        return
    run(["gen_audio2.py"])
    stamp.write_text(digest)


def set_cp2_state(state):
    """Put demo checkpoint #2 into 'pending' (unverified) or 'applied'."""
    from lib_record import api, api_token, resolve_client_id
    tok = api_token()
    cid = resolve_client_id(tok)
    cps = sorted(api(f"/clients/{cid}/checkpoints", tok), key=lambda c: c["created_at"])
    cp2 = cps[1]
    items = (cp2["structured_diff"] or {}).get("line_items", [])
    if state == "pending":
        if cp2["added_to_quotation"]:
            api(f"/clients/{cid}/quotation/remove-checkpoint/{cp2['id']}", tok, {})
        for it in items:
            it["verified"] = False
        api(f"/checkpoints/{cp2['id']}/extracted-items", tok,
            {"line_items": items}, method="PATCH")
    elif state == "applied" and not cp2["added_to_quotation"]:
        for it in items:
            it["verified"] = True
        api(f"/clients/{cid}/quotation/update-items", tok,
            {"checkpoint_id": cp2["id"], "line_items": items})
    print(f"== cp2 state: {state}", flush=True)


def build_video(target):
    script, key, out_name, size, state = VIDEO_TARGETS[target]
    set_cp2_state(state)
    for f in glob.glob("video/*.webm"):
        os.remove(f)
    stdout = run(script)
    failed = [l for l in stdout.splitlines() if "FAILED" in l]
    if failed:
        print(f"!! {target}: {len(failed)} step(s) failed — review above", flush=True)
    lead = re.search(r"LEAD=([\d.]+)", stdout).group(1)
    webm = glob.glob("video/*.webm")[0]
    (HERE / "out").mkdir(exist_ok=True)
    run(["assemble2.py", key, webm, lead, f"out/{out_name}", size])
    shutil.copy(HERE / "out" / out_name, DEMO / out_name)
    print(f"== delivered demo/{out_name}", flush=True)


def build_posts():
    run(["posts.py"])
    (DEMO / "posts").mkdir(exist_ok=True)
    for png in glob.glob("posts/*.png"):
        shutil.copy(png, DEMO / "posts" / Path(png).name)
    print("== delivered demo/posts/*.png", flush=True)


def main():
    targets = [t.lower() for t in sys.argv[1:]] or ["all"]
    if "all" in targets:
        targets = ORDER
    unknown = set(targets) - set(ORDER)
    if unknown:
        raise SystemExit(f"unknown targets {sorted(unknown)}; choose from {ORDER} or 'all'")
    check_prereqs()
    if any(t in VIDEO_TARGETS for t in targets):
        ensure_audio()
    for t in ORDER:
        if t not in targets:
            continue
        if t == "posts":
            build_posts()
        else:
            build_video(t)
    print("\nALL DONE", flush=True)


main()
