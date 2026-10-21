# Demo & Social Media Kit

All voiceovers are Microsoft neural TTS (edge-tts); walkthroughs are scripted
Playwright recordings of the live dev app with burned-in captions, animated
cursor, lower-thirds, and curtain transitions.

| File | Format | Length | Voice | Content |
| --- | --- | --- | --- | --- |
| `reve8-demo-web.mp4` | 16:9 1080p | 2:26 | Andrew (US) | Full product tour: login → dashboard → client → AI Extract → live Add-to-Quotation → quotation + collapse/expand → What Changed → light/dark theme → Materials & Rates → Column Setup |
| `reve8-demo-mobile.mp4` | 9:16 1080×1920 | 0:46 | Ryan (UK) | Condensed mobile-layout tour with subtitles |
| `reve8-reel1-ai-extract.mp4` | 9:16 | 0:33 | Neerja (IN) | Hook: "Still typing quotations by hand?" — AI Extract + live add, amber pop captions |
| `reve8-reel2-what-changed.mp4` | 9:16 | 0:29 | Ava (US) | Hook: "Your client changed their mind. Again." — What Changed diff, blue pop captions |
| `reve8-reel3-overview.mp4` | 9:16 | 0:36 | Prabhat (IN) | Hook: "How much of your week goes into paperwork?" — overview, green pop captions |
| `posts/post1-ai-extract.png` | 1080×1080 | — | — | "Meeting notes → quotation. Automatically." |
| `posts/post2-what-changed.png` | 1080×1080 | — | — | "Your client changed their mind. Again." |
| `posts/post3-overview.png` | 1080×1080 | — | — | "Run your studio, not your spreadsheets." |

## Regenerating — one command (`pipeline/`)

```bash
cd demo/pipeline
python make_all.py                # everything: 5 videos + 3 posts -> demo/
python make_all.py reel1 posts    # or just specific targets
```

Targets: `main`, `reel1`, `reel2`, `reel3`, `mobile`, `posts`, `all`.

`make_all.py` handles the rest automatically:
- verifies the dev stack is up (`/health`, `:3000`) and installs Chromium if missing
- finds the demo client ("Mohan Reddy") by name via the API — re-seeding is fine
- synthesizes the voiceover only when `narration.py` changed (hash-stamped)
- puts checkpoint #2 into the state each recording needs (pending vs applied),
  so any single target can be rebuilt standalone and runs are repeatable
- records, assembles, and copies the finished files into `demo/`

Prereqs: `pip install edge-tts playwright imageio-ffmpeg`; dev stack running
(`docker compose -f .compose/dev.yml up`); demo client seeded
(`python -m backend.seed_demo`). Credentials come from `backend/.env.dev`.
Voiceover synthesis needs internet (Microsoft Edge TTS).

Narration text, voices, and segment start times live in `narration.py`;
scene choreography in `record_main2.py` / `record_vertical.py`.

Known quirks:
- Playwright can't upscale recordings, so vertical videos are captured at the
  540×960 viewport size and upscaled to 1080×1920 during assembly.
- edge-tts needs `boundary="WordBoundary"` for caption timings.
- Locators must filter `visible=True`: pages render hidden mobile/desktop
  duplicates of most elements.
