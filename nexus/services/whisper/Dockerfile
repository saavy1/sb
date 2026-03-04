FROM openvino/ubuntu24_runtime:2025.3.0 AS base

USER root

# Upgrade Intel GPU compute runtime for Arc GPU support
# Uses direct .deb installs (same approach as official OpenVINO Dockerfiles)
RUN dpkg --remove --force-depends intel-level-zero-gpu level-zero intel-opencl-icd && \
    mkdir /tmp/gpu_deps && cd /tmp/gpu_deps && \
    curl -L -O https://github.com/intel/intel-graphics-compiler/releases/download/v2.28.4/intel-igc-core-2_2.28.4+20760_amd64.deb && \
    curl -L -O https://github.com/intel/intel-graphics-compiler/releases/download/v2.28.4/intel-igc-opencl-2_2.28.4+20760_amd64.deb && \
    curl -L -O https://github.com/intel/compute-runtime/releases/download/26.05.37020.3/intel-opencl-icd_26.05.37020.3-0_amd64.deb && \
    curl -L -O https://github.com/intel/compute-runtime/releases/download/26.05.37020.3/libigdgmm12_22.9.0_amd64.deb && \
    curl -L -O https://github.com/intel/compute-runtime/releases/download/26.05.37020.3/libze-intel-gpu1_26.05.37020.3-0_amd64.deb && \
    dpkg -i ./*.deb && \
    rm -rf /tmp/gpu_deps

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Install into OpenVINO's virtualenv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install dependencies
COPY pyproject.toml .
RUN uv pip install --no-cache .

# Copy source
COPY src/ src/
RUN uv pip install --no-cache --no-deps .

# Download model at build time
ARG WHISPER_MODEL=OpenVINO/whisper-base-int8-ov
RUN uv pip install --no-cache huggingface-hub && \
    python3 -c "from huggingface_hub import snapshot_download; snapshot_download('${WHISPER_MODEL}', local_dir='/models/whisper')" && \
    uv pip uninstall huggingface-hub

USER openvino

ENTRYPOINT ["wyoming-openvino-whisper"]
CMD ["--uri", "tcp://0.0.0.0:10300", "--model-dir", "/models/whisper", "--device", "GPU"]
