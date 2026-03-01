---
name: new-argocd-app
description: Scaffold a new ArgoCD application with all infrastructure wiring - ArgoCD app definition, DDNS record, Caddy reverse proxy route, and optional ExternalSecrets. Use when adding a new service to the cluster.
---

# New ArgoCD Application

Scaffold and wire up a new ArgoCD-managed application for the Superbloom cluster.

## What this skill does

When invoked, walk through these steps:

### 1. Gather information

Ask the user for:
- **App name** (e.g., `grafana`, `tempo`) — used for directory name and ArgoCD Application metadata
- **Namespace** — Kubernetes namespace to deploy into
- **Deployment type** — one of:
  - `helm` — Helm chart from a remote repository
  - `helm+resources` — Helm chart + raw resource manifests (ExternalSecrets, ConfigMaps, etc.)
  - `raw` — Raw Kubernetes manifests only
- **Helm chart repo URL** and **chart name** (if Helm)
- **Chart version** (if Helm)
- **Subdomain** (optional) — e.g., `grafana` for `grafana.saavylab.dev`. Skip if the app has no web UI.
- **Auth strategy** (if subdomain provided) — one of:
  - `forward_auth` — Protected by Authelia forward auth
  - `built_in` — App handles its own auth (no forward_auth)
  - `none` — No auth (public)
- **Needs secrets?** — Whether to create an ExternalSecret pulling from Infisical

### 2. Create ArgoCD app directory

Location: `argocd/clusters/superbloom/<category>/<app-name>/`

Categories:
- `infra/` — Infrastructure services (monitoring, networking, storage, auth)
- `nexus/` — Nexus application services
- `games/` — Game server related
- `media/` — Media services (jellyfin, sonarr, etc.)

Create the following files:

#### `app.yaml` — ArgoCD Application CRD

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: <category>-<app-name>  # e.g., infra-tempo
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  destination:
    server: https://kubernetes.default.svc
    namespace: <namespace>
  sources:
    # For Helm deployments:
    - repoURL: <chart-repo-url>
      chart: <chart-name>
      targetRevision: "<chart-version>"
      helm:
        releaseName: <app-name>
        valueFiles:
          - $values/argocd/clusters/superbloom/<category>/<app-name>/values.yaml
    - repoURL: https://github.com/saavy1/sb.git
      targetRevision: main
      ref: values
    # For helm+resources, add a third source:
    - repoURL: https://github.com/saavy1/sb.git
      targetRevision: main
      path: argocd/clusters/superbloom/<category>/<app-name>/resources
  syncPolicy:
    automated:
      prune: false
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ApplyOutOfSyncOnly=true
      - ServerSideApply=true
      - ServerSideDiff=true
```

For apps with ExternalSecrets, also add:
```yaml
  ignoreDifferences:
    - group: external-secrets.io
      kind: ExternalSecret
      jqPathExpressions:
        - .spec.data[].remoteRef.conversionStrategy
        - .spec.data[].remoteRef.decodingStrategy
        - .spec.data[].remoteRef.metadataPolicy
```

And add these syncOptions:
```yaml
      - RespectIgnoreDifferences=true
      - SkipDryRunOnMissingResource=true
```

#### `kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - app.yaml
```

#### `values.yaml` (if Helm)

Start with sensible defaults. Use `local-path` for storageClass. Set reasonable resource requests/limits for a single-node cluster.

#### `resources/` directory (if helm+resources or raw)

Always include:
- `namespace.yaml` — Namespace definition
- `kustomization.yaml` — Lists all resource files

Optionally:
- `external-secrets.yaml` — ExternalSecret pulling from ClusterSecretStore `infisical`
- Any other raw manifests needed

### 3. Register in parent kustomization

Add the new app directory to the appropriate parent kustomization file:
- `argocd/clusters/superbloom/infra/kustomization.yaml` for infra apps
- `argocd/clusters/superbloom/nexus/kustomization.yaml` for nexus apps
- etc.

Keep the list alphabetically sorted.

### 4. Add DDNS record (if subdomain provided)

Add `<subdomain>.saavylab.dev` to the DOMAINS env var in:
`argocd/clusters/superbloom/infra/ddns/values.yaml`

Append to the comma-separated list.

### 5. Add Caddy route (if subdomain provided)

Add a reverse proxy block to the Caddyfile ConfigMap in:
`argocd/clusters/superbloom/infra/caddy/resources/caddyfile.yaml`

Place it alphabetically among existing entries (before the health endpoint).

Templates by auth strategy:

**forward_auth** (protected by Authelia):
```
    # <App Name> - protected with forward_auth
    <subdomain>.saavylab.dev {
        forward_auth authelia.authelia.svc.cluster.local:80 {
            uri /api/authz/forward-auth
            copy_headers Remote-User Remote-Groups Remote-Email Remote-Name
        }
        reverse_proxy <service>.<namespace>.svc.cluster.local:<port>
    }
```

**built_in** (app handles own auth):
```
    # <App Name> - uses built-in auth
    <subdomain>.saavylab.dev {
        reverse_proxy <service>.<namespace>.svc.cluster.local:<port>
    }
```

**Webhook bypass pattern** (if app receives webhooks):
```
    <subdomain>.saavylab.dev {
        @webhook path /webhook/path
        handle @webhook {
            reverse_proxy <service>.<namespace>.svc.cluster.local:<port>
        }
        handle {
            forward_auth authelia.authelia.svc.cluster.local:80 {
                uri /api/authz/forward-auth
                copy_headers Remote-User Remote-Groups Remote-Email Remote-Name
            }
            reverse_proxy <service>.<namespace>.svc.cluster.local:<port>
        }
    }
```

### 6. Summary

After creating all files, output a summary:
- Files created/modified
- What to do next (push to trigger ArgoCD sync)
- Any secrets that need to be added to Infisical
- The URL where the app will be accessible (if subdomain provided)

## Key conventions

- **storageClass**: Always `local-path`
- **Chart versions**: Pin to specific version, never `latest` or `*`
- **Sync policy**: Always `prune: false` (prevent accidental deletion), `selfHeal: true`
- **ServerSideApply + ServerSideDiff**: Use both to avoid field manager conflicts
- **Namespace**: Created via `CreateNamespace=true` sync option or explicit namespace.yaml in resources
- **Secrets**: Never hardcode — always use ExternalSecret + Infisical ClusterSecretStore
