# Flux — Bootstrap Layer

Flux CD is used **only for bootstrapping** components that ArgoCD depends on. All other workloads are managed by ArgoCD (see `argocd/README.md`).

## What Flux Manages

| Component | Purpose |
|-----------|---------|
| **ArgoCD** | The primary GitOps engine |
| **Infisical** | Secrets management (External Secrets backend) |
| **CNPG Operator** | CloudNativePG PostgreSQL operator |

## Structure

```
flux/clusters/superbloom/
├── flux-system/        # Flux bootstrap controllers
├── kustomization.yaml  # Root: flux-system, infra, argocd, data
├── infra.yaml          # Infrastructure kustomization
├── argocd.yaml         # ArgoCD kustomization
├── data.yaml           # Data services kustomization
├── infra/
│   ├── argocd/         # ArgoCD Helm chart + config
│   ├── infisical/      # Infisical Helm chart
│   └── cnpg-operator.yaml
└── data/
    └── postgres/       # PostgreSQL cluster (migrating to ArgoCD)
```

## Why Flux for Bootstrap?

ArgoCD can't install itself. Flux handles the chicken-and-egg problem:

1. Flux installs ArgoCD
2. ArgoCD takes over managing everything else
3. Flux continues to reconcile only its bootstrap components

## Common Tasks

```bash
# Check Flux status
flux get all

# Force reconcile
flux reconcile source git flux-system
flux reconcile kustomization flux-system --with-source
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

## Note

For adding new services, see `argocd/README.md`. Flux is not used for application deployments.
