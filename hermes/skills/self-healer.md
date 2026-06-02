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
1. Query all pod statuses via `mcp-k8s.get_pods()`
2. Query node resource usage (CPU, memory, disk) via Prometheus
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
