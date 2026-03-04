import asyncio
import logging
import os
import tempfile
import wave
from typing import Optional

import numpy as np
import openvino_genai

from wyoming.asr import Transcribe, Transcript
from wyoming.audio import AudioChunk, AudioChunkConverter, AudioStart, AudioStop
from wyoming.event import Event
from wyoming.info import AsrModel, AsrProgram, Attribution, Describe, Info
from wyoming.server import AsyncEventHandler

_LOGGER = logging.getLogger(__name__)

WHISPER_RATE = 16000
WHISPER_WIDTH = 2  # 16-bit
WHISPER_CHANNELS = 1  # mono


class OpenVINOWhisperHandler(AsyncEventHandler):
    """Wyoming ASR handler using OpenVINO Whisper inference."""

    def __init__(
        self,
        wyoming_info: Info,
        pipeline: openvino_genai.WhisperPipeline,
        language: str,
        *args,
        **kwargs,
    ) -> None:
        super().__init__(*args, **kwargs)
        self.wyoming_info_event = wyoming_info.event()
        self._pipeline = pipeline
        self._language = language

        self._audio_converter = AudioChunkConverter(
            rate=WHISPER_RATE, width=WHISPER_WIDTH, channels=WHISPER_CHANNELS
        )

        self._wav_dir = tempfile.TemporaryDirectory()
        self._wav_path = os.path.join(self._wav_dir.name, "speech.wav")
        self._wav_file: Optional[wave.Wave_write] = None

    async def handle_event(self, event: Event) -> bool:
        if Describe.is_type(event.type):
            await self.write_event(self.wyoming_info_event)
            return True

        if Transcribe.is_type(event.type):
            transcribe = Transcribe.from_event(event)
            if transcribe.language:
                self._language = transcribe.language
            return True

        if AudioStart.is_type(event.type):
            return True

        if AudioChunk.is_type(event.type):
            chunk = self._audio_converter.convert(AudioChunk.from_event(event))
            if self._wav_file is None:
                self._wav_file = wave.open(self._wav_path, "wb")
                self._wav_file.setframerate(chunk.rate)
                self._wav_file.setsampwidth(chunk.width)
                self._wav_file.setnchannels(chunk.channels)
            self._wav_file.writeframes(chunk.audio)
            return True

        if AudioStop.is_type(event.type):
            if self._wav_file is None:
                return False

            self._wav_file.close()
            self._wav_file = None

            _LOGGER.debug("Transcribing audio")
            text = await asyncio.to_thread(self._transcribe, self._wav_path)
            _LOGGER.info("Transcript: %s", text)

            await self.write_event(Transcript(text=text).event())
            return False

        return True

    def _transcribe(self, wav_path: str) -> str:
        """Run OpenVINO Whisper inference on a WAV file (blocking)."""
        with wave.open(wav_path, "rb") as wf:
            raw = wf.readframes(wf.getnframes())
            audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

        result = self._pipeline.generate(
            audio.tolist(),
            max_new_tokens=448,
            language=f"<|{self._language}|>",
            task="transcribe",
        )

        return str(result).strip()

    async def disconnect(self) -> None:
        if self._wav_file is not None:
            self._wav_file.close()
            self._wav_file = None
        self._wav_dir.cleanup()
