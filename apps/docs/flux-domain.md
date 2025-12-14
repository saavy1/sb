# Flux Domain: Rationale & Goals

## Context

[Capacitor](https://github.com/gimlet-io/capacitor) exists as a general-purpose FluxCD UI. Rather than deploying it separately, we're building Flux visibility directly into the Superbloom Dashboard.

## Why Not Use Capacitor?

| Concern | Capacitor | Integrated Approach |
|---------|-----------|---------------------|
| **Runtime** | Deno + Go | Bun (matches our stack) |
| **Auth** | Separate or kubeconfig | Authelia SSO (already configured) |
| **UX** | Second website to bookmark | Single dashboard for everything |
| **Features** | 100% of Flux features | Only what we actually need |
| **Maintenance** | External dependency | We control the code |

## Goals

Build a `flux` domain in Nexus that provides:

1. **Visibility** - See Flux resource status at a glance when AFK
2. **Debugging** - Quickly identify what's failing and why
3. **Actions** - Trigger reconciliation without SSH/kubectl access
4. **Unified** - One dashboard for game servers, system info, and Flux

## MVP Scope

### Read Operations
- List all Kustomizations with status (Ready/Failed/Progressing)
- List all HelmReleases with status
- Show last reconcile time and any error messages
- Show suspended state

### Write Operations
- Trigger reconcile on a Kustomization
- Trigger reconcile on a HelmRelease

### Dashboard
- Status cards/table showing health at a glance
- Color-coded status (green/yellow/red)
- One-click reconcile buttons

## Future (If Needed)

- Suspend/resume resources
- GitRepository and OCIRepository status
- Recent Kubernetes events for failed resources
- Flux controller pod logs
- Diff between cluster state and git (complex, probably skip)

## Implementation Notes

- Follow existing domain pattern: `apps/nexus/src/domains/flux/`
- Reuse k8s client patterns from `game-servers` domain
- Flux CRDs are in `kustomize.toolkit.fluxcd.io` and `helm.toolkit.fluxcd.io` API groups
- Dashboard consumes via Eden Treaty (no type duplication)

## References

- [Flux CRD API Reference](https://fluxcd.io/flux/components/)
- [Capacitor source](https://github.com/gimlet-io/capacitor) - reference for what's possible
