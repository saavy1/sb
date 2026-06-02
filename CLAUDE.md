# Claude Code Guide

Development patterns and conventions for the Superbloom homelab.

## Philosophy

This is a personal homelab project. **Do things properly, not quickly.** There are no deadlines. Prefer clean, correct solutions over hacks or workarounds. If something requires more setup to do right, take the time to do it right. Don't apply band-aid fixes when a proper solution exists.

## Repository Structure

```
sb/
├── nixos/              # NixOS system configuration (K3s, ZFS, Tailscale)
├── argocd/             # Primary GitOps — ArgoCD application definitions
├── flux/               # Bootstrap-only — installs ArgoCD
├── hermes/             # Hermes Agent config, skills, and SOUL
├── mcp-servers/        # Standalone Python MCP servers
└── docs/               # Documentation and research notes
```

## NixOS

- Uses Nix Flakes with Home Manager
- Modular configuration in `nixos/modules/` directory
- Rebuild command: `sudo nixos-rebuild switch --flake ./nixos#superbloom`
- Keep modules focused and single-purpose

## Hermes Agent

Hermes is the autonomous operator of the homelab. Configuration lives in `hermes/`:

```
hermes/
├── config.yaml       # Runtime config: model provider, MCP servers, cron jobs
├── SOUL.md           # Personality, directives, constraints
└── skills/           # Procedure documents Hermes can execute
    ├── self-healer.md
    └── model-manager.md
```

### Configuring Hermes

Edit `hermes/config.yaml` to adjust:
- **Model provider** — `deepseek` or local KServe endpoint
- **MCP servers** — List of stdio-based MCP servers with commands and env
- **Cron jobs** — Scheduled prompts (e.g. cluster triage every 2 minutes)
- **Skills** — `auto_create: true` lets Hermes generate new skills on demand

ArgoCD deploys Hermes; push to `main` and the agent redeploys automatically.

### Creating a Skill

Skills are Markdown files in `hermes/skills/`:

```markdown
# Skill Name

## Purpose
What this skill does and when to use it.

## Procedure
1. Step one
2. Step two
3. Expected outcomes

## Recovery Patterns
**Pattern: Something Bad**
1. Detect via MCP
2. Attempt fix
3. Escalate if unresolved

## Annotations
After execution, annotate Grafana with what happened.
```

Skills should be procedural, not imperative. Hermes reads them and decides how to execute.

## MCP Server Development

MCP servers are standalone Python tools in `mcp-servers/`. Each exposes capabilities via the Model Context Protocol over stdio.

### Conventions

- One server per domain (k8s, kserve, grafana)
- Use `asyncio` for I/O — Hermes may call multiple tools in parallel
- Return structured JSON; include error context, not just messages
- Keep servers stateless; Hermes handles state in MEMORY.md
- Log to stderr, return JSON on stdout

### Adding a New MCP Server

1. Create directory under `mcp-servers/mcp-<name>/`
2. Implement `server.py` with MCP protocol handlers
3. Add to `hermes/config.yaml` under `mcp_servers`
4. Add ArgoCD app in `argocd/clusters/superbloom/hermes/` if it should be deployed alongside Hermes
5. Push to main — ArgoCD deploys

### Existing MCP Servers

| Server | Tools | Purpose |
|--------|-------|---------|
| `mcp-k8s` | get_pods, get_logs, describe_resource, restart_deployment | Cluster operations |
| `mcp-kserve` | list_models, load_model, get_model_status | Model serving lifecycle |
| `mcp-grafana` | promql, alert_status, annotate_dashboard | Monitoring and alerts |

## Ops Architecture

All infrastructure operations (kubectl, flux, helm) execute via **Tailscale SSH** to the `superbloom` host. The Tailscale operator handles cluster networking; individual apps no longer need sidecars.

```bash
# Example: run kubectl via Tailscale SSH
ssh superbloom "kubectl get pods -A"
```

## Shell Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `rg` (ripgrep) | Fast text search | `rg "pattern" --type py` |
| `fd` | Fast file finder | `fd "server.py" mcp-servers/` |
| `fzf` | Fuzzy finder | `fd \| fzf` |
| `eza` | Better ls | `eza --tree --level=2 mcp-servers/` |

### Useful Searches

```bash
# Find all MCP server entry points
fd "server.py" mcp-servers/

# Find all Hermes skills
fd "*.md" hermes/skills/

# Find Hermes config references
rg "mcp_servers" hermes/

# Find ArgoCD app definitions
fd "app.yaml" argocd/

# Find SOPS-encrypted secrets
rg "sops" argocd/
```

## Key Files

| File | Purpose |
|------|---------|
| `hermes/config.yaml` | Agent runtime configuration |
| `hermes/SOUL.md` | Agent personality and directives |
| `hermes/skills/*.md` | Executable procedures |
| `argocd/clusters/superbloom/infra/caddy/resources/caddyfile.yaml` | Reverse proxy routes |
| `argocd/clusters/superbloom/infra/ddns/values.yaml` | Dynamic DNS domains |
| `.sops.yaml` | SOPS encryption configuration |
