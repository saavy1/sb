"""Hermes MCP server for KServe model lifecycle management."""
import asyncio
import json
import subprocess

from mcp.server import Server
from mcp.server.stdio import stdio_server

server = Server("mcp-kserve")

async def kubectl_json(command: str) -> dict:
    proc = await asyncio.create_subprocess_shell(
        f"kubectl {command} -o json",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(stderr.decode())
    return json.loads(stdout.decode())

@server.tool()
async def list_models() -> str:
    """List all InferenceServices and their status."""
    try:
        svcs = await kubectl_json("get inferenceservices --all-namespaces")
        return json.dumps([{
            "name": s["metadata"]["name"],
            "namespace": s["metadata"]["namespace"],
            "model": s.get("spec", {}).get("predictor", {}).get("model", {}).get("modelFormat", {}).get("name", "unknown"),
            "ready": s.get("status", {}).get("conditions", [{}])[-1].get("status") == "True",
            "url": s.get("status", {}).get("url", ""),
        } for s in svcs.get("items", [])], indent=2)
    except Exception as e:
        return f"Error: {e}"

@server.tool()
async def load_model(name: str, model_uri: str, runtime: str = "vllm") -> str:
    """Create or update an InferenceService to load a model."""
    yaml = f"""apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: {name}
  namespace: kserve
spec:
  predictor:
    model:
      modelFormat:
        name: {model_uri}
      runtime: {runtime}
      storageUri: {model_uri}
"""
    proc = await asyncio.create_subprocess_shell(
        f"echo '{yaml}' | kubectl apply -f -",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        return f"Failed to load model: {stderr.decode()}"
    return f"Model {name} loading from {model_uri}. Check status with list_models."

@server.tool()
async def unload_model(name: str) -> str:
    """Remove an InferenceService to free GPU memory."""
    proc = await asyncio.create_subprocess_shell(
        f"kubectl delete inferenceservice {name} -n kserve",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        return f"Error: {stderr.decode()}"
    return f"Model {name} unloaded."

@server.tool()
async def get_model_status(name: str) -> str:
    """Get detailed status of a specific model."""
    try:
        svc = await kubectl_json(f"get inferenceservice {name} -n kserve")
        return json.dumps(svc.get("status", {}), indent=2)
    except Exception as e:
        return f"Error: {e}"

async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write)

if __name__ == "__main__":
    asyncio.run(main())
