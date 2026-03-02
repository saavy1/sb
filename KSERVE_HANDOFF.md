# KServe + LiteLLM on DGX Spark — Handoff Context

## Background

Setting up a DGX Spark (GB10, 128GB unified memory, ARM64, SM121) as a k3s agent node on an existing Superbloom cluster. Goal is to serve LLMs via vLLM with a clean programmatic interface from Nexus (the existing TypeScript monorepo).

## Hardware

- **DGX Spark**: NVIDIA Grace Blackwell GB10, 128GB unified memory, aarch64
- **Tailscale IP**: 100.115.255.14 (hostname: `spark`)
- **QSFP port**: For future multi-Spark tensor parallelism
- **Docker**: Working (had buildkit DB corruption, fixed with `rm -rf /var/lib/docker/buildkit`)
- **Tailscale SSH**: Working

## Current Cluster

- Single-node k3s on NixOS (Tailscale IP: 100.66.91.56)
- Flux bootstraps ArgoCD, Infisical, CNPG
- ArgoCD manages everything else
- Full observability: Prometheus, Grafana, Loki, Tempo, Alloy
- Intel Arc GPU on current node (i915, for Jellyfin transcoding)

## Target Architecture

```
Apps / Nexus agent worker → LiteLLM gateway (:4000, OpenAI-compatible)
                                ├→ vLLM: nemotron-3-nano-30b (FP8)
                                ├→ vLLM: gpt-oss-120b (MXFP4)
                                └→ vLLM: qwen3.5-35b-a3b (BF16, NVFP4 broken on SM121)
                                    (1-2 running at a time, 128GB shared)

Nexus UI  →  create/delete KServe InferenceService CRDs
KServe    →  handles Deployment, Service, scaling, health
```

## Plan Outline

### 1. Join Spark to k3s cluster
- Install k3s agent on Spark over Tailscale
- Label node: `nvidia.com/gpu.product=gb10` or similar
- Install NVIDIA device plugin (DaemonSet, node-affinity to Spark)
- Verify GPU is visible to k8s (`kubectl describe node spark`)

### 2. Install KServe
- KServe on k3s (serverless mode or raw deployment mode)
- Raw deployment mode is simpler — no Knative/Istio dependency
- Add as ArgoCD app under `argocd/clusters/superbloom/ai/kserve/`

### 3. Deploy LiteLLM
- Single pod, always-on, routes to vLLM backends
- ArgoCD app under `argocd/clusters/superbloom/ai/litellm/`
- Config points to KServe model service endpoints
- Exposed at litellm.saavylab.dev via Caddy

### 4. Nexus AI Models Domain
- New domain: `nexus/packages/core/src/domains/ai-models/`
- Same pattern as game-servers but thin: just CRUD on InferenceService CRDs
- schema.ts — models table (name, model_id, status, huggingface_uri, etc.)
- types.ts — Elysia schemas
- repository.ts — DB access
- functions.ts — create/start/stop via k8s API (create/delete InferenceService)
- routes.ts — REST API
- UI components for model management

### 5. Model-Specific Notes

| Model | HF ID | Quantization | Notes |
|-------|--------|-------------|-------|
| Nemotron 3 Nano 30B | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8` | FP8 | Needs `--trust-remote-code`, Mamba-2 hybrid |
| GPT-OSS 120B | `openai/gpt-oss-120b` | MXFP4 | 5.1B active, fits 80GB, needs vLLM gptoss build |
| Qwen 3.5 35B-A3B | `Qwen/Qwen3.5-35B-A3B` | BF16 only | NVFP4 broken on SM121 ([issue](https://github.com/vllm-project/vllm/issues/35519)) |

### 6. Docker Image Concern
- Standard vLLM images are x86_64
- DGX Spark needs aarch64 + SM121
- Official NVIDIA image: `nvcr.io/nvidia/vllm:26.01-py3`
- KServe's default serving runtime may not have Spark-compatible images
- May need custom ServingRuntime CRD pointing to NVIDIA's image

## Key Decisions Still Needed

1. **KServe mode**: Raw Deployment (simpler) vs Serverless (Knative, scale-to-zero but heavier)
2. **vLLM image strategy**: Custom ServingRuntime pointing to `nvcr.io/nvidia/vllm:26.01-py3` vs building custom images
3. **LiteLLM config management**: Static config file vs dynamic (Nexus updates config when models change)
4. **Nexus PR**: Already has open PR to rewrite to OpenAI adapter — LiteLLM endpoint becomes the target

## Existing Compose File

A docker-compose.yml was written at `~/.config/spark/docker-compose.yml` as a fallback/testing option. Can be used to validate models work on the Spark before wiring up KServe.

## References

- [KServe docs](https://kserve.github.io/website/)
- [vLLM KServe integration](https://docs.vllm.ai/en/latest/serving/deploying_with_kserve.html)
- [NVIDIA vLLM for Spark](https://build.nvidia.com/spark/vllm)
- [Qwen3.5 SM121 bug](https://github.com/vllm-project/vllm/issues/35519)
- [gpt-oss vLLM support](https://blog.vllm.ai/2025/08/05/gpt-oss.html)
