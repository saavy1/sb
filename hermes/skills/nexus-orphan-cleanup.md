# Nexus Orphan Cleanup Skill

## Purpose
Remove cluster resources that outlived the Nexus → Hermes migration. These
objects are no longer described anywhere in Git, so neither Flux nor ArgoCD
tracks them and reconciliation will never prune them. They must be deleted
imperatively, once.

This is a one-shot remediation. After the resources are gone and verified,
the issue is closed and this skill is dormant.

## Background
- The Nexus app manifests were deleted during the Hermes migration. Flux's
  `prune: true` only garbage-collects objects it still owns, so the legacy
  `HelmChart` objects below — created under an earlier Flux layout — were left
  behind, stuck `FAILED` against the deleted `HelmRepository "bjw-s"`.
- Grafana file provisioning does not delete alert rules that are merely absent
  from the provisioning file; the orphaned Nexus rules are removed declaratively
  via the `deleteRules` block in
  `argocd/clusters/superbloom/infra/kube-prometheus-stack/values.yaml`.

## Procedure

### 1. Confirm the orphans exist
1. List the stale Flux HelmCharts via `mcp-k8s.describe_resource` /
   `kubectl get helmcharts.source.toolkit.fluxcd.io -A`:
   - `external-secrets/nexus-nexus`
   - `flux-system/nexus-nexus-agent-worker`
   - `flux-system/nexus-nexus-bot`
   - `flux-system/nexus-nexus-embeddings-worker`
   - `flux-system/nexus-nexus-mc-monitor`
2. Confirm none of them are referenced by a live `HelmRelease` (there should be
   no `nexus-*` HelmRelease in Git or in the cluster).

### 2. Delete the orphaned HelmCharts
Run via Tailscale SSH to `superbloom` (the ops path for kubectl/flux/helm):
```bash
kubectl -n external-secrets delete helmchart.source.toolkit.fluxcd.io nexus-nexus
for c in agent-worker bot embeddings-worker mc-monitor; do
  kubectl -n flux-system delete helmchart.source.toolkit.fluxcd.io "nexus-nexus-$c"
done
```
If a delete hangs, the object is wedged on a finalizer — see Recovery Patterns.

### 3. Trigger the provisioned alert cleanup
1. The `deleteRules` entries land on the next ArgoCD sync of
   `kube-prometheus-stack`. Force Grafana to reload provisioning by restarting
   it: `mcp-k8s.restart_deployment("kube-prometheus-stack-grafana", "monitoring")`.
2. Verify via `mcp-grafana.alert_status()` that `nexus-high-error-rate` and
   `mcp-server-connection-failures` no longer appear.

### 4. Expected outcomes
- `kubectl get helmcharts -A` shows no `nexus-*` entries.
- Grafana's Provisioned folder no longer lists the two Nexus rules.
- No alerts evaluate against the deleted `nexus` namespace.

## Recovery Patterns

**Pattern: HelmChart stuck on finalizer**
1. Confirm the owning HelmRelease is truly gone.
2. Clear the finalizer so the object can be reaped:
   ```bash
   kubectl -n <ns> patch helmchart.source.toolkit.fluxcd.io <name> \
     --type merge -p '{"metadata":{"finalizers":[]}}'
   ```
3. Re-check that the object is deleted.

**Pattern: Provisioned rule reappears after restart**
1. Confirm the rule UID is still listed under `deleteRules` in `values.yaml`
   and that ArgoCD has synced the change.
2. Check for a duplicate UI-created alert with the same name (provenance other
   than `file`); delete it in the UI if present.

## Annotations
After the cleanup, annotate the Grafana dashboard with what was removed, when,
and confirmation that no Nexus orphans remain.
