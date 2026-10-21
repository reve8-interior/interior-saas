"""Whisper audio transcription wrapper."""

from __future__ import annotations

import io
from dataclasses import dataclass

from openai import AsyncOpenAI


@dataclass(frozen=True)
class Transcription:
    text: str
    # Audio length, when the model reports it; used to price the call.
    duration_seconds: float | None


async def transcribe_audio(
    audio_bytes: bytes, filename: str, api_key: str, model: str
) -> Transcription:
    """Send audio bytes to OpenAI and return the transcript text.

    The filename is required — OpenAI uses the file extension to detect the
    audio codec (.mp3, .wav, .m4a, .mp4, .webm, etc.).

    Raises RuntimeError if the call fails.
    """
    client = AsyncOpenAI(api_key=api_key)
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    # Only whisper-1 can return the audio duration (verbose_json); the
    # gpt-4o transcribe models accept plain json/text only.
    verbose = model.startswith("whisper")
    try:
        response = await client.audio.transcriptions.create(
            model=model,
            file=audio_file,
            response_format="verbose_json" if verbose else "json",
        )
    except Exception as exc:
        raise RuntimeError(f"Whisper transcription failed: {exc}") from exc

    duration = getattr(response, "duration", None)
    return Transcription(
        text=str(response.text),
        duration_seconds=float(duration) if duration is not None else None,
    )
