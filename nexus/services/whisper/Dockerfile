FROM openvino/ubuntu24_runtime:2025.0.0 AS base

USER root

# Install Intel GPU compute runtime for Arc GPU support
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
  && add-apt-repository -y ppa:kobuk-team/intel-graphics \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
     intel-opencl-icd \
     libze-intel-gpu1 \
     libze1 \
     ocl-icd-libopencl1 \
  && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Install dependencies
COPY pyproject.toml .
RUN uv pip install --system --no-cache .

# Copy source
COPY src/ src/
RUN uv pip install --system --no-cache --no-deps .

# Download model at build time
ARG WHISPER_MODEL=OpenVINO/whisper-base-int8-ov
RUN uv pip install --system --no-cache huggingface-hub && \
    python -c "from huggingface_hub import snapshot_download; snapshot_download('${WHISPER_MODEL}', local_dir='/models/whisper')" && \
    uv pip uninstall --system huggingface-hub

USER openvino

ENTRYPOINT ["wyoming-openvino-whisper"]
CMD ["--uri", "tcp://0.0.0.0:10300", "--model-dir", "/models/whisper", "--device", "GPU"]
