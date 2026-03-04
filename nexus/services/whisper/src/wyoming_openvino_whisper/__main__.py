import argparse
import asyncio
import logging
from functools import partial

import openvino_genai

from wyoming.info import AsrModel, AsrProgram, Attribution, Info
from wyoming.server import AsyncServer

from . import __version__
from .handler import OpenVINOWhisperHandler

_LOGGER = logging.getLogger(__name__)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Wyoming OpenVINO Whisper ASR server")
    parser.add_argument(
        "--uri",
        required=True,
        help="Server URI (e.g., tcp://0.0.0.0:10300)",
    )
    parser.add_argument(
        "--model-dir",
        required=True,
        help="Path to OpenVINO Whisper model directory",
    )
    parser.add_argument(
        "--device",
        default="GPU",
        help="OpenVINO device: CPU, GPU, GPU.0, GPU.1 (default: GPU)",
    )
    parser.add_argument(
        "--language",
        default="en",
        help="Default language code (default: en)",
    )
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    _LOGGER.info(
        "Loading model from %s on device %s", args.model_dir, args.device
    )
    pipeline = openvino_genai.WhisperPipeline(args.model_dir, args.device)
    _LOGGER.info("Model loaded")

    wyoming_info = Info(
        asr=[
            AsrProgram(
                name="openvino-whisper",
                description="Whisper speech-to-text via OpenVINO (Intel GPU)",
                attribution=Attribution(
                    name="OpenAI / OpenVINO",
                    url="https://github.com/openvinotoolkit/openvino.genai",
                ),
                installed=True,
                version=__version__,
                models=[
                    AsrModel(
                        name=args.model_dir.split("/")[-1],
                        description=f"OpenVINO Whisper on {args.device}",
                        attribution=Attribution(
                            name="OpenAI",
                            url="https://github.com/openai/whisper",
                        ),
                        installed=True,
                        languages=["en"],
                        version=__version__,
                    )
                ],
            )
        ],
    )

    server = AsyncServer.from_uri(args.uri)
    _LOGGER.info("Ready on %s", args.uri)

    await server.run(
        partial(
            OpenVINOWhisperHandler,
            wyoming_info,
            pipeline,
            args.language,
        )
    )


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        pass
