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
