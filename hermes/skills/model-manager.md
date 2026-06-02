# Model Manager Skill

## Purpose
Manage the lifecycle of locally-served models on KServe (DGX Spark).
Ensure a model is always available for inference, falling back to DeepSeek API when local models are unavailable.

## Procedure

### 1. Model Inventory
Maintain a registry of known models with their requirements:

```yaml
models:
  - name: hermes-function-calling
    repo: NousResearch/Hermes-4-Function-Calling-70B
    min_vram: 48GB
    runtime: vllm
    priority: primary
  - name: deepseek-coder
    repo: deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct
    min_vram: 16GB
    runtime: vllm
    priority: secondary
  - name: qwen-agent
    repo: Qwen/Qwen2.5-32B-Instruct
    min_vram: 24GB
    runtime: vllm
    priority: tertiary
```

### 2. Startup Check
On Hermes startup:
1. Query KServe for running InferenceServices via `mcp-kserve.list_models()`
2. If a model is loaded and ready → configure Hermes to use it
3. If no model is loaded → pick the highest-priority model that fits GPU memory and load it via `mcp-kserve.load_model()`
4. If KServe is unreachable → log warning, fallback to DeepSeek API

### 3. Health Monitoring (cron: every 5 minutes)
1. Check KServe health via `mcp-kserve.get_model_status()`
2. Check model latency via `mcp-grafana.promql("histogram_quantile(0.95, rate(model_latency_seconds_bucket[5m]))")`
3. If latency > 5s or error rate > 5% → consider swapping model
4. If GPU memory pressure > 90% → unload secondary models

### 4. Fallback Logic
```python
def resolve_provider():
    try:
        status = mcp_kserve.get_model_status("hermes-function-calling")
        if status["ready"]:
            return {"provider": "local", "endpoint": status["url"]}
    except:
        pass
    return {"provider": "deepseek", "model": "deepseek-chat"}
```

### 5. Recovery
If KServe becomes unreachable mid-session:
1. Immediately switch to DeepSeek API (no downtime)
2. Attempt to heal KServe:
   - Check pod status via `mcp-k8s.get_pods("kserve")`
   - If pods are CrashLoopBackOff → get logs, restart
   - If node is unreachable → alert human via Discord
3. Once KServe is healthy, reload models
4. Switch back to local models once they're ready
