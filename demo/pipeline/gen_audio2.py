"""Synthesize every narration segment with word-boundary timings (for captions)."""
import asyncio
import json
import subprocess
import wave
from pathlib import Path

import edge_tts
import imageio_ffmpeg

from narration import VIDEOS

HERE = Path(__file__).parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


async def synth(video: str, seg: str, voice: str, rate: str, text: str) -> dict:
    outdir = HERE / "audio" / video
    outdir.mkdir(parents=True, exist_ok=True)
    mp3, wav = outdir / f"{seg}.mp3", outdir / f"{seg}.wav"
    audio = bytearray()
    words = []
    async for chunk in edge_tts.Communicate(text, voice, rate=rate,
                                            boundary="WordBoundary").stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            words.append({
                "t": chunk["offset"] / 1e7,
                "d": chunk["duration"] / 1e7,
                "w": chunk["text"],
            })
    mp3.write_bytes(bytes(audio))
    subprocess.run([FFMPEG, "-y", "-i", str(mp3), "-ar", "44100", "-ac", "2", str(wav)],
                   check=True, capture_output=True)
    with wave.open(str(wav), "rb") as w:
        dur = w.getnframes() / w.getframerate()
    return {"video": video, "seg": seg, "duration": round(dur, 2), "words": words}


async def main() -> None:
    tasks = [synth(v, seg, voice, rate, text)
             for v, (voice, rate, segs) in VIDEOS.items()
             for seg, _, text in segs]
    results = await asyncio.gather(*tasks)
    timings = {}
    for r in results:
        timings.setdefault(r["video"], {})[r["seg"]] = {
            "duration": r["duration"], "words": r["words"]}
    (HERE / "timings.json").write_text(json.dumps(timings))
    for v, segs in timings.items():
        durs = {s: d["duration"] for s, d in segs.items()}
        print(v, durs, "total_vo:", round(sum(durs.values()), 1))


asyncio.run(main())
