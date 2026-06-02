"""Hermes MCP server for Kubernetes and ArgoCD operations."""
import asyncio
import json
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("mcp-k8s")

async def run_kubectl(*args: str) -> str:
    """Execute kubectl with explicit args (no shell)."""
    proc = await asyncio.create_subprocess_exec(
        "kubectl", *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        return f"Error: {stderr.decode()}"
    return stdout.decode()

@mcp.tool()
async def get_pods(namespace: str = "all") -> str:
    """Get pod status across namespaces."""
    args = ["get", "pods", "-o", "json"]
    if namespace != "all":
        args.extend(["-n", namespace])
    else:
        args.append("--all-namespaces")
    result = await run_kubectl(*args)
    pods = json.loads(result)
    return json.dumps([
        {"name": p["metadata"]["name"],
         "namespace": p["metadata"]["namespace"],
         "status": p["status"]["phase"],
         "ready": all(c.get("ready", False) for c in p["status"].get("containerStatuses", []))}
        for p in pods.get("items", [])
    ], indent=2)

@mcp.tool()
async def get_events(namespace: str = "all", limit: int = 20) -> str:
    """Get recent Kubernetes events."""
    args = ["get", "events", "--sort-by=.lastTimestamp", "-o", "json"]
    if namespace != "all":
        args.extend(["-n", namespace])
    else:
        args.append("--all-namespaces")
    result = await run_kubectl(*args)
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

@mcp.tool()
async def restart_deployment(name: str, namespace: str) -> str:
    """Restart a deployment by triggering a rollout restart."""
    return await run_kubectl("rollout", "restart", f"deployment/{name}", "-n", namespace)

@mcp.tool()
async def describe_resource(kind: str, name: str, namespace: str) -> str:
    """Describe a Kubernetes resource."""
    return await run_kubectl("describe", kind, name, "-n", namespace)

@mcp.tool()
async def get_logs(name: str, namespace: str, tail: int = 100) -> str:
    """Get logs from a pod or deployment."""
    return await run_kubectl("logs", f"deployment/{name}", "-n", namespace, f"--tail={tail}")

if __name__ == "__main__":
    mcp.run()
