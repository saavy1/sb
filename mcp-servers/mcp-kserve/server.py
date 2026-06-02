"""Hermes MCP server for KServe model lifecycle management."""
import asyncio
import json
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("mcp-kserve")

async def run_kubectl(*args: str, stdin_data: str | None = None) -> str:
    """Execute kubectl with explicit args (no shell). Optionally pipe stdin."""
    proc = await asyncio.create_subprocess_exec(
        "kubectl", *args,
        stdin=asyncio.subprocess.PIPE if stdin_data else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(stdin_data.encode() if stdin_data else None)
    if proc.returncode != 0:
        return f"Error: {stderr.decode()}"
    return stdout.decode()

@mcp.tool()
async def list_models() -> str:
    """List all InferenceServices and their status."""
    try:
        result = await run_kubectl("get", "inferenceservices", "--all-namespaces", "-o", "json")
        svcs = json.loads(result)
        return json.dumps([{
            "name": s["metadata"]["name"],
            "namespace": s["metadata"]["namespace"],
            "model": s.get("spec", {}).get("predictor", {}).get("model", {}).get("modelFormat", {}).get("name", "unknown"),
            "ready": s.get("status", {}).get("conditions", [{}])[-1].get("status") == "True",
            "url": s.get("status", {}).get("url", ""),
        } for s in svcs.get("items", [])], indent=2)
    except Exception as e:
        return f"Error: {e}"

@mcp.tool()
async def load_model(name: str, model_uri: str, runtime: str = "vllm") -> str:
    """Create or update an InferenceService to load a model.

    Args:
        name: Name for the InferenceService
        model_uri: HuggingFace model URI or storage path
        runtime: Serving runtime name (default: vllm)
    """
    yaml = f"""apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: {name}
  namespace: kserve
spec:
  predictor:
    model:
      modelFormat:
        name: {runtime}
      storageUri: {model_uri}
"""
    return await run_kubectl("apply", "-f", "-", stdin_data=yaml)

@mcp.tool()
async def unload_model(name: str) -> str:
    """Remove an InferenceService to free GPU memory."""
    return await run_kubectl("delete", "inferenceservice", name, "-n", "kserve")

@mcp.tool()
async def get_model_status(name: str) -> str:
    """Get detailed status of a specific model."""
    try:
        result = await run_kubectl("get", "inferenceservice", name, "-n", "kserve", "-o", "json")
        svc = json.loads(result)
        return json.dumps(svc.get("status", {}), indent=2)
    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    mcp.run()
