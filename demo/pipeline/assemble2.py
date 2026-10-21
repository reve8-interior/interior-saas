"""Generic muxer: screen recording + scheduled voiceover -> final MP4.

Usage: python assemble2.py <video_key> <webm> <lead_seconds> <out.mp4> <WxH>
"""
import subprocess
import sys
import wave
from pathlib import Path

import imageio_ffmpeg

from narration import TOTALS, VIDEOS

HERE = Path(__file__).parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100


def build_voiceover(video: str, path: Path, total: float) -> None:
    track = bytearray(int(total * SR) * 4)
    for seg, start, _ in VIDEOS[video][2]:
        with wave.open(str(HERE / "audio" / video / f"{seg}.wav"), "rb") as w:
            data = w.readframes(w.getnframes())
        off = int(start * SR) * 4
        track[off:off + len(data)] = data[: len(track) - off]
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(track))


def main(video: str, webm: str, lead: float, out: str, size: str) -> None:
    total = TOTALS[video]
    w, h = size.split("x")
    vo = HERE / f"vo_{video}.wav"
    build_voiceover(video, vo, total)
    cmd = [
        FFMPEG, "-y", "-i", webm, "-i", str(vo),
        "-filter_complex",
        f"[0:v]trim=start={lead:.2f},setpts=PTS-STARTPTS,fps=30,scale={w}:{h},"
        f"fade=t=in:st=0:d=0.5,fade=t=out:st={total - 0.9:.1f}:d=0.9[v];"
        f"[1:a]afade=t=out:st={total - 1.2:.1f}:d=1.2[a]",
        "-map", "[v]", "-map", "[a]",
        "-t", str(total),
        "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        out,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-3000:])
        raise SystemExit(1)
    print("OK", out)


main(sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5])
