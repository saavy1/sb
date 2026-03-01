# ArgoCD — Primary GitOps

ArgoCD manages all Kubernetes workloads on the Superbloom K3s cluster. Flux handles only the bootstrap layer (ArgoCD itself, Infisical, CNPG operator).

## Structure

```
argocd/clusters/superbloom/
├── infra/                    # Infrastructure services
│   ├── alloy/                # Grafana Alloy — OTLP collector, log/metrics shipping
│   ├── argo-workflows/       # Argo Workflows — CI/CD pipeline engine
│   ├── authelia/             # SSO/authentication portal
│   ├── caddy/                # Reverse proxy + TLS termination
│   ├── ddns/                 # Cloudflare Dynamic DNS
│   ├── external-secrets/     # External Secrets Operator
│   ├── infisical/            # Infisical app (secrets UI)
│   ├── kargo/                # Kargo — GitOps promotion engine
│   ├── kube-prometheus-stack/ # Prometheus + Grafana + Alertmanager
│   ├── loki/                 # Log storage (Grafana Loki)
│   ├── tempo/                # Trace storage (Grafana Tempo)
│   └── zot/                  # OCI container registry
├── nexus/                    # Nexus application platform
│   ├── core/                 # Shared resources: namespace, RBAC, secrets, Kargo pipeline
│   ├── api/                  # Nexus API (Elysia control plane)
│   ├── bot/                  # Discord bot (The Machine)
│   ├── agent-worker/         # AI agent background worker
│   └── mc-monitor/           # Minecraft server status poller
├── media/                    # Media services
│   ├── jellyfin/             # Media server
│   ├── sonarr/               # TV show management
│   ├── radarr/               # Movie management
│   ├── sabnzbd/              # Download client
│   ├── prowlarr/             # Indexer management
│   ├── bazarr/               # Subtitle management
│   └── jellyseerr/           # Media request management
├── games/                    # Game server infrastructure
│   └── (Minecraft LoadBalancer service, namespace)
└── data/                     # Data services
    ├── core/                 # Shared data namespace
    └── valkey/               # Valkey (Redis-compatible, BullMQ backend)
```

## App Pattern

Every ArgoCD app follows the same structure:

```
<app-name>/
├── app.yaml              # ArgoCD Application CRD
├── kustomization.yaml    # References app.yaml (+ resources/ if present)
├── values.yaml           # Helm values (if Helm chart)
└── resources/            # Raw manifests (optional)
    ├── kustomization.yaml
    ├── namespace.yaml
    ├── external-secrets.yaml
    └── ...
```

### Deployment Types

| Type | Sources | Example |
|------|---------|---------|
| **Helm** | Chart + values ref | `authelia`, `zot`, `loki` |
| **Helm + Resources** | Chart + values ref + raw manifests | `nexus/api`, `alloy` |
| **Raw** | Git path to manifests only | `caddy`, `games` |

### Sync Policy

All apps use:
```yaml
syncPolicy:
  automated:
    prune: false      # Never auto-delete resources
    selfHeal: true    # Auto-fix drift
  syncOptions:
    - CreateNamespace=true
    - ServerSideApply=true
    - ServerSideDiff=true
```

## Secrets

Secrets are managed via **External Secrets Operator** pulling from **Infisical**:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: my-secret
spec:
  secretStoreRef:
    name: infisical
    kind: ClusterSecretStore
  data:
    - secretKey: API_KEY
      remoteRef:
        key: API_KEY
```

No SOPS, no plaintext secrets in Git.

## Image Promotion (Kargo)

Nexus images flow through a Kargo pipeline:

```
Zot Registry (Warehouse) → prod Stage → ArgoCD apps update
```

Kargo watches for new image tags in the Zot registry and promotes them to the ArgoCD apps by updating image digests.

## Networking

All web services are exposed via:
1. **Caddy** reverse proxy at `*.saavylab.dev`
2. **Authelia** SSO for protected routes
3. **Cloudflare DDNS** for dynamic IP updates

When adding a new web-facing app, update:
- `infra/ddns/values.yaml` — Add domain to DOMAINS list
- `infra/caddy/resources/caddyfile.yaml` — Add reverse proxy route

## Adding a New App

Use the Claude Code skill: `/new-argocd-app`

Or manually:
1. Create app directory with `app.yaml`, `kustomization.yaml`, `values.yaml`
2. Add to parent `kustomization.yaml`
3. Add DDNS record (if web-facing)
4. Add Caddy route (if web-facing)
5. Add secrets to Infisical (if needed)
6. Push to main — ArgoCD syncs automatically

## Monitoring Stack

```
nexus pods ──OTLP──► Alloy ──► Tempo (traces)
                           ──► Prometheus (metrics)
pod logs ──────────► Alloy ──► Loki (logs)
kube metrics ──────► Prometheus (via kube-prometheus-stack)

Grafana UI queries all three backends
Alertmanager ──webhook──► Nexus API ──► AI Agent
```

Accessible at `grafana.saavylab.dev`.
