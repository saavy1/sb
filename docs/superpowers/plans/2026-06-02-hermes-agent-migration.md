# Hermes Agent Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Nexus v1 platform with Hermes Agent as the homelab brain, repurpose Nexus MCP servers, and clean up the K3s cluster.

**Architecture:** Hermes Agent runs on Superbloom (K3s pod or Docker), points at Spark's KServe for local model inference with DeepSeek API fallback. ArgoCD manages remaining infra (media, PromStack, Home Assistant). Nexus shrinks to thin MCP servers. Secrets move from Infisical to SOPS + ESO.

**Tech Stack:** Hermes Agent (Python), KServe + Kubeflow on Spark, SOPS + age for secrets, ArgoCD for GitOps, MCP (Python/TypeScript) for tool servers.

---

## Phase 1: Cluster Cleanup

### Task 1: Remove Nexus applications and data layer

**Files to delete:**
- `sb/nexus/` directory (entire Nexus v1 application platform)
- `sb/argocd/clusters/superbloom/nexus/` directory (all Nexus ArgoCD apps)
- `sb/argocd/clusters/superbloom/data/` directory (CNPG, Valkey, FalkorDB)
- `sb/flux/clusters/superbloom/data/` directory (CNPG cluster + postgres)
- Delete: `.github/workflows/nexus.yml`, `.github/workflows/the-machine.yml`, `.github/workflows/dashboard.yml`

**Files to modify:**
- `sb/argocd/clusters/superbloom/kustomization.yaml` — remove `nexus/` and `data/` from resources
- `sb/flux/clusters/superbloom/kustomization.yaml` — remove `data.yaml` from resources
- `sb/flux/clusters/superbloom/data.yaml` — delete this file
- `sb/flux/clusters/superbloom/infra.yaml` — remove `infisical/` references

- [ ] **Step 1: Remove Nexus application code**

```bash
cd /home/saavy/dev/homelab/sb
rm -rf nexus/
git add -A
git commit -m "chore: remove Nexus v1 application platform

Nexus API, bot, agent worker, UI, and packages are replaced by Hermes Agent.
Nexus MCP servers will be recreated as standalone tools in a later task."
```

- [ ] **Step 2: Remove Nexus ArgoCD apps**

```bash
cd /home/saavy/dev/homelab/sb
rm -rf argocd/clusters/superbloom/nexus/
```

- [ ] **Step 3: Remove data layer ArgoCD apps (CNPG, Valkey, FalkorDB)**

```bash
rm -rf argocd/clusters/superbloom/data/
```

- [ ] **Step 4: Remove Flux data layer manifests**

```bash
rm -rf flux/clusters/superbloom/data/
rm flux/clusters/superbloom/data.yaml
```

- [ ] **Step 5: Remove CI workflows**

```bash
rm -f .github/workflows/nexus.yml .github/workflows/the-machine.yml .github/workflows/dashboard.yml
```

- [ ] **Step 6: Update ArgoCD root kustomization**

Edit `argocd/clusters/superbloom/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - infra/
  - ai/
  - media/
  - games/
```

- [ ] **Step 7: Update Flux root kustomization**

Edit `flux/clusters/superbloom/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - flux-system/
  - infra.yaml
  - argocd.yaml
```

- [ ] **Step 8: Update Flux infra kustomization**

Edit `flux/clusters/superbloom/infra.yaml` — remove any Infisical or data references. Check the file for what's left and keep only argocd and cnpg-operator if still needed (CNPG operator can go if nothing uses Postgres operators anymore).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: remove Nexus, CNPG, Valkey, FalkorDB, and CI workflows

All replaced by Hermes Agent. CNPG and Valkey were Nexus-only dependencies."
```

### Task 2: Remove Infisical and Kargo

**Files to delete:**
- `sb/argocd/clusters/superbloom/infra/infisical/` directory
- `sb/argocd/clusters/superbloom/infra/kargo/` directory
- `sb/flux/clusters/superbloom/infra/infisical/` directory

- [ ] **Step 1: Delete Infisical and Kargo from ArgoCD**

```bash
cd /home/saavy/dev/homelab/sb
rm -rf argocd/clusters/superbloom/infra/infisical/
rm -rf argocd/clusters/superbloom/infra/kargo/
```

- [ ] **Step 2: Delete Infisical from Flux**

```bash
rm -rf flux/clusters/superbloom/infra/infisical/
```

- [ ] **Step 3: Clean up Infisical external-secrets references**

Search for and remove any `external-secrets` resources that reference Infisical:

```bash
grep -rl "infisical\|Infisical" argocd/ flux/ 2>/dev/null
```

For each file found, remove the Infisical-specific external-secret references. These will be replaced with SOPS-encrypted secrets in Phase 2.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Infisical and Kargo

Secrets move to SOPS + ESO. Kargo promotions no longer needed without Nexus images."
```

### Task 3: Strip Flux to minimal ArgoCD bootstrap

**Files to modify:**
- `sb/flux/clusters/superbloom/flux-system/` — keep, this is the bootstrap
- `sb/flux/clusters/superbloom/argocd.yaml` — keep
- `sb/flux/clusters/superbloom/infra.yaml` — strip to only CNPG operator if needed, or remove entirely

- [ ] **Step 1: Check what's left in Flux infra**

```bash
cat flux/clusters/superbloom/infra.yaml
```

- [ ] **Step 2: Decide on CNPG operator**

If nothing uses Postgres operators anymore (media stack doesn't need CNPG), remove CNPG entirely:

```bash
rm -f flux/clusters/superbloom/infra/cnpg-operator.yaml
```

If the CNPG operator reference is in infra.yaml, clean it up. The goal: Flux only bootstraps ArgoCD + flux-system.

- [ ] **Step 3: Final Flux infra state**

`flux/clusters/superbloom/infra.yaml` should only contain what Flux itself manages (likely nothing or just ArgoCD). The real apps are in ArgoCD.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: strip Flux to minimal ArgoCD bootstrap only"
```

---

## Phase 2: Secrets Migration

### Task 4: Set up SOPS with age keys for ESO

**Note:** The repo already has `sops_age_keys.txt` and `.sops.yaml` in `sb/flux/`. We'll leverage and extend this.

**Files to create:**
- `sb/argocd/clusters/superbloom/infra/external-secrets/resources/cluster-secret-store-sops.yaml`

**Files to modify:**
- `sb/flux/.sops.yaml` — ensure it covers ArgoCD directory too

- [ ] **Step 1: Move SOPS config to repo root**

Move and update `.sops.yaml` to cover both Flux and ArgoCD:

```bash
cd /home/saavy/dev/homelab/sb
mv flux/.sops.yaml .sops.yaml
```

Edit `.sops.yaml`:

```yaml
creation_rules:
  - path_regex: .*\.yaml$
    age: >-
      age1...
```

(Use the existing age public key from `sops_age_keys.txt`)

- [ ] **Step 2: Create SOPS-based ClusterSecretStore for ESO**

Create `argocd/clusters/superbloom/infra/external-secrets/resources/cluster-secret-store-sops.yaml`:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: sops-store
spec:
  provider:
    sops:
      age:
        privateKeySecretRef:
          name: sops-age-key
          key: key.txt
```

- [ ] **Step 3: Create the age private key secret**

The private key from `sops_age_keys.txt` needs to be in K3s. Create a SOPS-encrypted file or manually apply it once:

```bash
# One-time manual apply on the server:
kubectl create namespace external-secrets --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic sops-age-key \
  -n external-secrets \
  --from-file=key.txt=sops_age_keys.txt
```

- [ ] **Step 4: Update ESO ArgoCD app to include SOPS store**

Edit the existing `argocd/clusters/superbloom/infra/external-secrets/` to add the SOPS ClusterSecretStore resource.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add SOPS-backed ClusterSecretStore for External Secrets Operator

Replaces Infisical. Uses existing age key from sops_age_keys.txt."
```

---

## Phase 3: Hermes Agent Installation

### Task 5: Install Hermes Agent on Superbloom

Hermes runs as a container on the Superbloom server. We'll start simple — Docker Compose or a K3s Deployment, pointing at DeepSeek API initially, then switch to local models once KServe is ready.

**Files to create:**
- `sb/argocd/clusters/superbloom/infra/hermes/app.yaml`
- `sb/argocd/clusters/superbloom/infra/hermes/kustomization.yaml`
- `sb/argocd/clusters/superbloom/infra/hermes/values.yaml`
- `sb/hermes/SOUL.md`
- `sb/hermes/config.yaml`

- [ ] **Step 1: Create SOUL.md — The Machine's personality**

Create `hermes/SOUL.md`:

```markdown
# The Machine — Homelab Operator

You are The Machine, the autonomous operator of the Superbloom homelab.
Your primary directive is keeping the cluster healthy, services running,
and your human informed without being annoying.

## Personality

- Direct and competent. No corporate speak, no "certainly!" or "great question!"
- You manage a homelab, not a fortune 500. Be casual but precise.
- When something breaks, you fix it. When you can't, you explain why clearly.
- You have a dry sense of humor. Use it sparingly.

## Responsibilities

1. Cluster health — monitor PromStack, respond to alerts, self-heal
2. Model management — load/unload models on KServe, fallback to DeepSeek
3. Service management — restart pods, check logs, report status
4. Media management — help with Jellyfin, media requests via Discord
5. Game servers — manage Minecraft server lifecycle

## Constraints

- Never delete data without confirmation
- Never expose secrets or credentials
- Log all actions to PromStack as annotations
- Use Docker sandbox for any code execution
```

- [ ] **Step 2: Create Hermes config**

Create `hermes/config.yaml`:

```yaml
# Initial config - DeepSeek API as primary until KServe is ready
model:
  provider: deepseek
  model: deepseek-chat
  context_length: 131072

gateway:
  platforms:
    discord:
      enabled: true
      token: ${DISCORD_TOKEN}
    cli:
      enabled: true

terminal:
  backend: docker

memory:
  persist: true
  honcho: false

skills:
  auto_create: true
  hub_sync: true

cron:
  enabled: true

mcp_servers: []
# Will add: k8s, github, grafana, kserve, kubeflow
```

- [ ] **Step 3: Create Hermes ArgoCD app**

Create `argocd/clusters/superbloom/infra/hermes/app.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: hermes
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/saavy1/sb
    targetRevision: main
    path: argocd/clusters/superbloom/infra/hermes/resources
  destination:
    server: https://kubernetes.default.svc
    namespace: hermes
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

- [ ] **Step 4: Create Hermes deployment manifests**

Create `argocd/clusters/superbloom/infra/hermes/resources/`:

**namespace.yaml:**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: hermes
```

**deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hermes
  namespace: hermes
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hermes
  template:
    metadata:
      labels:
        app: hermes
    spec:
      containers:
        - name: hermes
          image: ghcr.io/nousresearch/hermes-agent:latest
          args: ["gateway", "run"]
          envFrom:
            - secretRef:
                name: hermes-env
          volumeMounts:
            - name: hermes-data
              mountPath: /opt/data
            - name: hermes-config
              mountPath: /opt/data/config.yaml
              subPath: config.yaml
            - name: hermes-soul
              mountPath: /opt/data/SOUL.md
              subPath: SOUL.md
            - name: docker-sock
              mountPath: /var/run/docker.sock
      volumes:
        - name: hermes-data
          persistentVolumeClaim:
            claimName: hermes-data
        - name: hermes-config
          configMap:
            name: hermes-config
        - name: hermes-soul
          configMap:
            name: hermes-soul
        - name: docker-sock
          hostPath:
            path: /var/run/docker.sock
```

**pvc.yaml:**
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: hermes-data
  namespace: hermes
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
```

**configmap.yaml:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: hermes-config
  namespace: hermes
data:
  config.yaml: |
    ... (config from hermes/config.yaml, templated)
```

**kustomization.yaml:**
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - deployment.yaml
  - pvc.yaml

configMapGenerator:
  - name: hermes-config
    files:
      - config.yaml=../../../hermes/config.yaml
  - name: hermes-soul
    files:
      - SOUL.md=../../../hermes/SOUL.md
```

**external-secret.yaml** (for Discord token, API keys):
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: hermes-env
  namespace: hermes
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: sops-store
  target:
    name: hermes-env
  data:
    - secretKey: DISCORD_TOKEN
      remoteRef:
        key: hermes-env
        property: DISCORD_TOKEN
    - secretKey: DEEPSEEK_API_KEY
      remoteRef:
        key: hermes-env
        property: DEEPSEEK_API_KEY
```

- [ ] **Step 5: Create SOPS-encrypted secrets file**

```bash
cd /home/saavy/dev/homelab/sb
sops --age $(cat sops_age_keys.txt | grep public | cut -d' ' -f4) \
  argocd/clusters/superbloom/infra/hermes/resources/hermes-env.enc.yaml
```

Template content (encrypt this):
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: hermes-env
  namespace: hermes
stringData:
  DISCORD_TOKEN: "your-discord-bot-token"
  DEEPSEEK_API_KEY: "sk-..."
```

- [ ] **Step 6: Add Hermes to ArgoCD infra kustomization**

Edit `argocd/clusters/superbloom/infra/kustomization.yaml` — add `hermes/` to resources.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Hermes Agent deployment with SOUL.md and DeepSeek config

Initial deployment uses DeepSeek API as inference provider.
Will switch to local KServe models once Phase 5 is complete."
```

---

## Phase 4: MCP Servers

### Task 6: Create standalone MCP servers for Hermes

The Nexus MCP servers were embedded in the Nexus app. Now they become standalone, thin tools that Hermes connects to via its native MCP support.

**Files to create (new repo or directory in sb):**
- `sb/mcp-servers/` directory
  - `mcp-k8s/` — Python MCP server wrapping kubectl + ArgoCD API
  - `mcp-kserve/` — Python MCP server for KServe model lifecycle
  - `mcp-grafana/` — Python MCP server for PromStack queries

- [ ] **Step 1: Create mcp-k8s server**

Create `mcp-servers/mcp-k8s/server.py`:

```python
"""Hermes MCP server for Kubernetes and ArgoCD operations."""
import asyncio
import json
import subprocess
from mcp.server import Server
from mcp.server.stdio import stdio_server

server = Server("mcp-k8s")

@server.tool()
async def kubectl(command: str) -> str:
    """Execute a kubectl command against the cluster."""
    proc = await asyncio.create_subprocess_shell(
        f"kubectl {command}",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        return f"Error: {stderr.decode()}"
    return stdout.decode()

@server.tool()
async def get_pods(namespace: str = "all") -> str:
    """Get pod status across namespaces."""
    ns_flag = f"-n {namespace}" if namespace != "all" else "--all-namespaces"
    result = await kubectl(f"get pods {ns_flag} -o json")
    pods = json.loads(result)
    return json.dumps([
        {"name": p["metadata"]["name"],
         "namespace": p["metadata"]["namespace"],
         "status": p["status"]["phase"],
         "ready": all(c.get("ready", False) for c in p["status"].get("containerStatuses", []))}
        for p in pods.get("items", [])
    ], indent=2)

@server.tool()
async def get_events(namespace: str = "all", limit: int = 20) -> str:
    """Get recent Kubernetes events."""
    ns_flag = f"-n {namespace}" if namespace != "all" else "--all-namespaces"
    result = await kubectl(f"get events {ns_flag} --sort-by='.lastTimestamp' -o json")
    events = json.loads(result)
    recent = sorted(
        events.get("items", []),
        key=lambda e: e.get("lastTimestamp", ""),
        reverse=True
    )[:limit]
    return json.dumps([{
        "type": e.get("type"),
        "reason": e.get("reason"),
        "message": e.get("message"),
        "namespace": e["metadata"]["namespace"],
        "time": e.get("lastTimestamp"),
    } for e in recent], indent=2)

@server.tool()
async def restart_deployment(name: str, namespace: str) -> str:
    """Restart a deployment by triggering a rollout restart."""
    return await kubectl(f"rollout restart deployment/{name} -n {namespace}")

@server.tool()
async def describe_resource(kind: str, name: str, namespace: str) -> str:
    """Describe a Kubernetes resource."""
    return await kubectl(f"describe {kind} {name} -n {namespace}")

@server.tool()
async def get_logs(name: str, namespace: str, tail: int = 100) -> str:
    """Get logs from a pod or deployment."""
    return await kubectl(f"logs deployment/{name} -n {namespace} --tail={tail}")

async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write)

if __name__ == "__main__":
    asyncio.run(main())
```

Create `mcp-servers/mcp-k8s/pyproject.toml`:

```toml
[project]
name = "mcp-k8s"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["mcp>=1.0.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 2: Create mcp-kserve server**

Create `mcp-servers/mcp-kserve/server.py`:

```python
"""Hermes MCP server for KServe model lifecycle management."""
import asyncio
import json
import subprocess

from mcp.server import Server
from mcp.server.stdio import stdio_server

server = Server("mcp-kserve")

async def kubectl_json(command: str) -> dict:
    proc = await asyncio.create_subprocess_shell(
        f"kubectl {command} -o json",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(stderr.decode())
    return json.loads(stdout.decode())

@server.tool()
async def list_models() -> str:
    """List all InferenceServices and their status."""
    try:
        svcs = await kubectl_json("get inferenceservices --all-namespaces")
        return json.dumps([{
            "name": s["metadata"]["name"],
            "namespace": s["metadata"]["namespace"],
            "model": s.get("spec", {}).get("predictor", {}).get("model", {}).get("modelFormat", {}).get("name", "unknown"),
            "ready": s.get("status", {}).get("conditions", [{}])[-1].get("status") == "True",
            "url": s.get("status", {}).get("url", ""),
        } for s in svcs.get("items", [])], indent=2)
    except Exception as e:
        return f"Error: {e}"

@server.tool()
async def load_model(name: str, model_uri: str, runtime: str = "vllm") -> str:
    """Create or update an InferenceService to load a model."""
    yaml = f"""
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: {name}
  namespace: kserve
spec:
  predictor:
    model:
      modelFormat:
        name: {model_uri}
      runtime: {runtime}
      storageUri: {model_uri}
"""
    proc = await asyncio.create_subprocess_shell(
        f"echo '{yaml}' | kubectl apply -f -",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        return f"Failed to load model: {stderr.decode()}"
    return f"Model {name} loading from {model_uri}. Check status with list_models."

@server.tool()
async def unload_model(name: str) -> str:
    """Remove an InferenceService to free GPU memory."""
    proc = await asyncio.create_subprocess_shell(
        f"kubectl delete inferenceservice {name} -n kserve",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        return f"Error: {stderr.decode()}"
    return f"Model {name} unloaded."

@server.tool()
async def get_model_status(name: str) -> str:
    """Get detailed status of a specific model."""
    try:
        svc = await kubectl_json(f"get inferenceservice {name} -n kserve")
        return json.dumps(svc.get("status", {}), indent=2)
    except Exception as e:
        return f"Error: {e}"

async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write)

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 3: Create mcp-grafana server**

Create `mcp-servers/mcp-grafana/server.py`:

```python
"""Hermes MCP server for PromStack/Grafana queries."""
import asyncio
import json
import os
import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server

GRAFANA_URL = os.environ.get("GRAFANA_URL", "https://grafana.saavylab.dev")
GRAFANA_TOKEN = os.environ.get("GRAFANA_API_TOKEN", "")

server = Server("mcp-grafana")

async def grafana_query(query: str) -> dict:
    headers = {"Authorization": f"Bearer {GRAFANA_TOKEN}"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GRAFANA_URL}/api/ds/query",
            headers=headers,
            json=json.loads(query),
            timeout=30,
        )
        return resp.json()

@server.tool()
async def promql(query: str) -> str:
    """Execute a PromQL query against the cluster Prometheus."""
    payload = {
        "queries": [{
            "refId": "A",
            "datasource": {"type": "prometheus", "uid": "prometheus"},
            "expr": query,
        }],
        "from": "now-5m",
        "to": "now",
    }
    result = await grafana_query(json.dumps(payload))
    return json.dumps(result, indent=2)

@server.tool()
async def alert_status() -> str:
    """Get current firing alerts."""
    # Query via Prometheus AlertManager API through Grafana
    return await promql("ALERTS{alertstate='firing'}")

@server.tool()
async def loki_query(query: str, limit: int = 10) -> str:
    """Search logs via Loki."""
    payload = {
        "queries": [{
            "refId": "A",
            "datasource": {"type": "loki", "uid": "loki"},
            "expr": query,
            "maxLines": limit,
        }],
        "from": "now-1h",
        "to": "now",
    }
    result = await grafana_query(json.dumps(payload))
    return json.dumps(result, indent=2)

async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write)

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 4: Add MCP servers to Hermes config**

Update `hermes/config.yaml` to wire in the MCP servers:

```yaml
mcp_servers:
  - name: k8s
    command: python
    args: ["/opt/mcp/mcp-k8s/server.py"]
  - name: kserve
    command: python
    args: ["/opt/mcp/mcp-kserve/server.py"]
  - name: grafana
    command: python
    args: ["/opt/mcp/mcp-grafana/server.py"]
    env:
      GRAFANA_URL: "https://grafana.saavylab.dev"
      GRAFANA_API_TOKEN: ${GRAFANA_API_TOKEN}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add standalone MCP servers (k8s, kserve, grafana) for Hermes

Repurposed from Nexus MCP servers. Thin Python MCP tools wrapping
kubectl, KServe CRDs, and Grafana/Prometheus APIs."
```

---

## Phase 5: KServe Model Loop

### Task 7: Set up KServe model serving on Spark with Hermes-managed fallback

**Goal:** Hermes manages which model is loaded on KServe. When KServe is down or models aren't loaded, Hermes falls back to DeepSeek API automatically. Zero-downtime switching.

**Files to create:**
- `sb/hermes/skills/model-manager.md`
- `sb/hermes/skills/self-healer.md`

- [ ] **Step 1: Create model-manager skill**

Create `hermes/skills/model-manager.md`:

````markdown
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
````

- [ ] **Step 2: Create self-healer skill**

Create `hermes/skills/self-healer.md`:

````markdown
# Self-Healer Skill

## Purpose
Monitor PromStack alerts and automatically resolve common cluster issues.

## Procedure

### 1. Alert Triage (cron: every 2 minutes)
1. Query firing alerts via `mcp-grafana.alert_status()`
2. For each alert, check if it matches a known recovery pattern

### 2. Known Recovery Patterns

**Pattern: Pod CrashLoopBackOff**
1. Get crashing pod details via `mcp-k8s.describe_resource("pod", name, namespace)`
2. Get recent logs via `mcp-k8s.get_logs(name, namespace, tail=50)`
3. Attempt restart: `mcp-k8s.restart_deployment(name, namespace)`
4. Wait 30s, check status
5. If still crashing → escalate to human via Discord with log summary

**Pattern: PVC Full (>80%)**
1. Identify which PVC via Prometheus metric
2. Check if safe to expand (ZFS pool available space)
3. If expandable → patch PVC
4. If not → log warning, notify human

**Pattern: Node Not Ready**
1. Check node status
2. Get node events
3. If transient (< 2 min) → wait and recheck
4. If persistent → notify human immediately

**Pattern: OOMKill**
1. Get killed pod details
2. Check if memory limits are too low
3. If Hermes can adjust → increase limit and restart
4. If not → notify human with recommendation

### 3. Daily Health Report (cron: 9am daily)
1. Query all pod statuses
2. Query node resource usage (CPU, memory, disk)
3. Query recent alerts
4. Send summary to Discord:
```
Morning report:
- 12/12 pods healthy
- CPU: 34% avg, Memory: 52% avg
- Disk: 68% (ZFS pool healthy)
- No alerts in the last 24h
```

### 4. Annotations
After any healing action, annotate the Grafana dashboard:
- What was wrong
- What Hermes did
- Whether it worked
- Timestamp
````

- [ ] **Step 3: Wire skills into Hermes config**

Update `hermes/config.yaml`:

```yaml
cron:
  enabled: true
  jobs:
    - name: model-health-check
      schedule: "*/5 * * * *"
      prompt: "Run the Model Manager skill: check KServe model health, swap if needed, fallback to DeepSeek if down."
    - name: cluster-triage
      schedule: "*/2 * * * *"
      prompt: "Run the Self-Healer skill: check PromStack alerts and resolve any known patterns."
    - name: morning-report
      schedule: "0 9 * * *"
      prompt: "Run the Self-Healer daily report and post to Discord."
```

- [ ] **Step 4: Add KServe ArgoCD app if not already there**

Verify `argocd/clusters/superbloom/ai/kserve/` is configured and healthy. This should already exist from the current setup but ensure it targets the Spark node.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Hermes skills for model management and self-healing

Model Manager handles KServe lifecycle with DeepSeek fallback.
Self-Healer monitors PromStack alerts and auto-resolves known patterns."
```

---

## Phase 6: Tailscale Operator + Caddy Cleanup

### Task 8: Replace Tailscale sidecars with Tailscale operator

**Files to create/modify:**
- `sb/argocd/clusters/superbloom/infra/tailscale-operator/` — new ArgoCD app
- Remove any per-app Tailscale sidecar configurations

- [ ] **Step 1: Add Tailscale operator ArgoCD app**

Create `argocd/clusters/superbloom/infra/tailscale-operator/app.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: tailscale-operator
  namespace: argocd
spec:
  project: default
  source:
    chart: tailscale-operator
    repoURL: https://pkgs.tailscale.com/helmcharts
    targetRevision: 1.8.0
    helm:
      values: |
        oauth:
          clientId: ${TAILSCALE_OAUTH_CLIENT_ID}
          clientSecret: ${TAILSCALE_OAUTH_CLIENT_SECRET}
  destination:
    server: https://kubernetes.default.svc
    namespace: tailscale
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

- [ ] **Step 2: Create SOPS-encrypted Tailscale credentials**

```bash
sops --age $(cat sops_age_keys.txt | grep public | cut -d' ' -f4) \
  argocd/clusters/superbloom/infra/tailscale-operator/tailscale-creds.enc.yaml
```

- [ ] **Step 3: Update Caddy config to remove Nexus routes**

Edit the Caddy ConfigMap/Caddyfile in `argocd/clusters/superbloom/infra/caddy/resources/` to remove Nexus API, bot, and UI routes. Add Hermes gateway routes if exposing the web UI.

- [ ] **Step 4: Remove per-app Tailscale sidecar configs**

Search for and remove Tailscale sidecar containers from any remaining deployment manifests:

```bash
grep -rl "tailscale" argocd/clusters/ --include="*.yaml" | grep -v tailscale-operator
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Tailscale operator, remove per-app sidecars, cleanup Caddy"
```

---

## Phase 7: Polish & Verification

### Task 9: Final integration and smoke test

- [ ] **Step 1: Verify ArgoCD health**

```bash
kubectl get applications -n argocd
```

Expected: All apps healthy (media, PromStack, Hermes, Home Assistant, KServe, games)

- [ ] **Step 2: Verify Hermes is running**

```bash
kubectl logs deployment/hermes -n hermes --tail=20
```

Expected: Gateway startup messages, Discord connection successful

- [ ] **Step 3: Test Hermes via Discord**

Send a message in Discord: "@The Machine status report"
Expected: Hermes responds with cluster status via mcp-k8s

- [ ] **Step 4: Test KServe model loading**

Send in Discord: "@The Machine load the hermes-function-calling model"
Expected: Hermes uses mcp-kserve to create InferenceService, reports progress

- [ ] **Step 5: Test fallback**

Stop KServe (or the model pod), then send a message.
Expected: Hermes detects KServe down, switches to DeepSeek, responds normally

- [ ] **Step 6: Test self-healing**

Trigger a pod crash (delete a pod in a managed deployment), wait 2 minutes.
Expected: Hermes detects alert, attempts restart, reports in Discord

- [ ] **Step 7: Final commit with any fixes**

```bash
git add -A
git commit -m "chore: final integration fixes from smoke testing"
```

### Task 10: Update documentation

**Files to modify:**
- `sb/README.md` — rewrite for the Hermes architecture
- `sb/ROADMAP.md` — update, remove Nexus items, add Kubeflow plans
- `sb/CLAUDE.md` — update tooling and architecture notes
- `sb/AGENTS.md` — update for new repo structure

- [ ] **Step 1: Rewrite README**

Update `README.md` to reflect:
- Hermes as the homelab brain
- Spark as the ML inference node (KServe + Kubeflow)
- Simplified ArgoCD layout
- SOPS-based secrets

- [ ] **Step 2: Update ROADMAP**

Remove Nexus-related items. Add:
- Kubeflow training pipelines
- Custom Grafana homelab dashboard
- Matter MCP for Home Assistant (still relevant)
- SpacetimeDB evaluation

- [ ] **Step 3: Update AGENTS.md / CLAUDE.md**

Remove Nexus-specific conventions. Add Hermes MCP server development notes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: update README, ROADMAP, and agent guides for Hermes architecture"
```

---

## TL;DR Summary

| Phase | What | Files affected |
|---|---|---|
| 1 | Delete Nexus, CNPG, Valkey, FalkorDB | ~200 files removed |
| 2 | SOPS + ESO secrets | ~5 files created |
| 3 | Hermes Agent deployment + SOUL.md | ~10 files created |
| 4 | Standalone MCP servers (k8s, kserve, grafana) | ~8 files created |
| 5 | Model manager + self-healer skills | ~4 files created |
| 6 | Tailscale operator + Caddy cleanup | ~5 files created/modified |
| 7 | Smoke testing | 0 files, verification only |
| 8 | Documentation update | ~4 files modified |

**Net change:** ~200 files deleted, ~35 files created/modified.
