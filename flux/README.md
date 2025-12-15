# Flux GitOps

Flux CD configuration for managing Kubernetes deployments on the Superbloom K3s cluster.

## Overview

This directory contains Flux CD GitOps manifests that automatically reconcile Kubernetes resources from this Git repository to the cluster. All infrastructure and application deployments are managed declaratively through Git commits.

### Stack

- **Flux CD:** v2.7.3 - GitOps continuous deployment
- **Helm:** Package management via HelmRelease CRD
- **Kustomize:** Manifest composition and patching
- **SOPS:** Secrets encryption using age

## Directory Structure

```
flux/
├── .sops.yaml              # SOPS encryption configuration
├── clusters/
│   └── superbloom/         # Superbloom cluster configuration
│       ├── flux-system/    # Flux bootstrap and core config
│       │   ├── gotk-components.yaml    # Flux controllers
│       │   ├── gotk-sync.yaml          # GitRepository + Kustomization
│       │   └── kustomization.yaml
│       ├── infra/          # Infrastructure services
│       │   ├── caddy/              # Ingress controller
│       │   ├── authelia/           # SSO/authentication
│       │   ├── ddns/               # Cloudflare DDNS
│       │   ├── alloy/              # Grafana Alloy (logging)
│       │   └── kustomization.yaml
│       └── apps/           # Application deployments
│           ├── nexus/              # Nexus API
│           ├── nexus-worker/       # Nexus background worker
│           ├── postgres/           # PostgreSQL database
│           ├── valkey/             # Valkey (Redis-compatible)
│           └── kustomization.yaml
└── README.md
```

## Deployed Applications

### Infrastructure (infra/)

| Application | Purpose | Chart |
|-------------|---------|-------|
| **Caddy** | Ingress controller and reverse proxy | bjw-s/app-template |
| **Authelia** | Single sign-on and authentication | authelia/authelia |
| **DDNS** | Dynamic DNS for Cloudflare | favonia/cloudflare-ddns |
| **Alloy** | Log collection and forwarding | grafana/alloy |

### Applications (apps/)

| Application | Purpose | Notes |
|-------------|---------|-------|
| **Nexus** | Elysia API control plane | API mode deployment |
| **Nexus Worker** | Background job processor | Worker mode deployment |
| **PostgreSQL** | Agent state database | CloudNativePG operator |
| **Valkey** | Redis-compatible queue backend | For BullMQ job queues |

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ Git Repository (sb monorepo)                                │
│ └─ flux/clusters/superbloom/                                │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Flux CD Control Plane (flux-system namespace)               │
│ ├─ source-controller (watches Git repo every 1m)            │
│ ├─ kustomize-controller (applies manifests every 10m)       │
│ ├─ helm-controller (manages Helm releases)                  │
│ └─ notification-controller (reports status)                 │
└─────────────────────────────────┬───────────────────────────┘
                                  │
        ┌─────────────────────────┴─────────────────────────┐
        │                                                   │
        ▼ Infrastructure                                    ▼ Applications
┌──────────────────────────┐              ┌────────────────────────────────┐
│ Caddy • Authelia • DDNS  │              │ Nexus API • Nexus Worker       │
│ Alloy                    │              │ PostgreSQL • Valkey            │
└──────────────────────────┘              └────────────────────────────────┘
```

## Common Tasks

### Adding a New Application

1. Create a new directory under the appropriate category:
   ```bash
   # For infrastructure (ingress, auth, etc.)
   mkdir -p flux/clusters/superbloom/infra/my-app

   # For applications (Nexus services, databases, etc.)
   mkdir -p flux/clusters/superbloom/apps/my-app
   ```

2. Create the necessary manifests:
   - `ns.yaml` - Namespace definition
   - `release.yaml` - HelmRelease or Deployment
   - `kustomization.yaml` - Kustomize resources list
   - `secrets.yaml` (optional) - SOPS-encrypted secrets

3. Add the app to the parent kustomization:
   ```yaml
   # flux/clusters/superbloom/apps/kustomization.yaml (or infra/)
   resources:
     - my-app/
   ```

4. Commit and push - Flux will reconcile automatically

### Managing Secrets

Secrets are encrypted with SOPS using age encryption:

```bash
# Create a secret file
cat > secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: default
stringData:
  key: value
EOF

# Encrypt with SOPS
sops --encrypt --in-place secret.yaml

# Commit the encrypted file
git add secret.yaml
git commit -m "Add encrypted secret"
```

### Forcing Reconciliation

```bash
# Reconcile Flux system
flux reconcile source git flux-system

# Reconcile a specific kustomization
flux reconcile kustomization flux-system --with-source

# Reconcile a specific Helm release
flux reconcile helmrelease caddy -n caddy-system
```

### Checking Status

```bash
# Check all Flux resources
flux get all

# Check specific resource types
flux get sources git
flux get kustomizations
flux get helmreleases --all-namespaces
```

## Bootstrap

To bootstrap Flux on a new cluster:

```bash
flux bootstrap github \
  --owner=saavy1 \
  --repository=sb \
  --branch=main \
  --path=flux/clusters/superbloom \
  --personal
```

## Related Components

This directory is part of the Superbloom monorepo:
- **`../nixos/`** - NixOS system configuration (installs K3s)
- **`../apps/`** - Custom applications (Nexus, The Machine, Dashboard)
- **`../.github/workflows/`** - CI/CD for building container images

## Important Notes

- **GitOps:** All changes must go through Git - direct `kubectl` changes will be reverted
- **Secrets:** Never commit plaintext secrets - use SOPS encryption
- **Reconciliation:** Flux checks Git every 1 minute and reconciles every 10 minutes
- **Domain:** All apps are configured for `saavylab.dev`
