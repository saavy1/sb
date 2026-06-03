"""Hermes MCP server for KServe model lifecycle management."""
import json
import os
import re
import ssl
import urllib.error
import urllib.request
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("mcp-kserve")

API_GROUP = "serving.kserve.io"
API_VERSION = "v1beta1"
KUBERNETES_HOST = os.environ.get("KUBERNETES_SERVICE_HOST", "kubernetes.default.svc")
KUBERNETES_PORT = os.environ.get("KUBERNETES_SERVICE_PORT_HTTPS", "443")
API_SERVER = f"https://{KUBERNETES_HOST}:{KUBERNETES_PORT}"
TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token"
CA_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
NAME_RE = re.compile(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")


def _token() -> str:
    with open(TOKEN_PATH, "r", encoding="utf-8") as token_file:
        return token_file.read().strip()


def _ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=CA_PATH)


def _request(method: str, path: str, body: dict | None = None, content_type: str = "application/json") -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        f"{API_SERVER}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {_token()}",
            "Accept": "application/json",
            "Content-Type": content_type,
        },
    )
    with urllib.request.urlopen(request, context=_ssl_context(), timeout=30) as response:
        payload = response.read().decode("utf-8")
        return json.loads(payload) if payload else {}


def _safe_name(value: str, field: str) -> str:
    if not NAME_RE.match(value):
        raise ValueError(f"{field} must be a Kubernetes DNS label")
    return value


def _inferenceservice_path(namespace: str | None = None, name: str | None = None) -> str:
    base = f"/apis/{API_GROUP}/{API_VERSION}"
    if namespace:
        base += f"/namespaces/{namespace}"
    base += "/inferenceservices"
    if name:
        base += f"/{name}"
    return base


def _is_ready(service: dict) -> bool:
    for condition in service.get("status", {}).get("conditions", []):
        if condition.get("type") == "Ready":
            return condition.get("status") == "True"
    return False


def _model_summary(service: dict) -> dict:
    model = service.get("spec", {}).get("predictor", {}).get("model", {})
    return {
        "name": service["metadata"]["name"],
        "namespace": service["metadata"]["namespace"],
        "runtime": model.get("modelFormat", {}).get("name", "unknown"),
        "storageUri": model.get("storageUri", ""),
        "ready": _is_ready(service),
        "url": service.get("status", {}).get("url", ""),
    }

@mcp.tool()
async def list_models() -> str:
    """List all InferenceServices and their status."""
    try:
        services = _request("GET", _inferenceservice_path())
        return json.dumps([_model_summary(service) for service in services.get("items", [])], indent=2)
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
    try:
        name = _safe_name(name, "name")
        runtime = _safe_name(runtime, "runtime")
        if not model_uri:
            raise ValueError("model_uri is required")

        body = {
            "apiVersion": f"{API_GROUP}/{API_VERSION}",
            "kind": "InferenceService",
            "metadata": {"name": name, "namespace": "kserve"},
            "spec": {
                "predictor": {
                    "model": {
                        "modelFormat": {"name": runtime},
                        "storageUri": model_uri,
                    }
                }
            },
        }
        try:
            result = _request("PATCH", _inferenceservice_path("kserve", name), body, "application/merge-patch+json")
            action = "updated"
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            result = _request("POST", _inferenceservice_path("kserve"), body)
            action = "created"
        return json.dumps({"action": action, "service": _model_summary(result)}, indent=2)
    except Exception as e:
        return f"Error: {e}"

@mcp.tool()
async def unload_model(name: str) -> str:
    """Remove an InferenceService to free GPU memory."""
    try:
        name = _safe_name(name, "name")
        result = _request("DELETE", _inferenceservice_path("kserve", name))
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"Error: {e}"

@mcp.tool()
async def get_model_status(name: str) -> str:
    """Get detailed status of a specific model."""
    try:
        name = _safe_name(name, "name")
        service = _request("GET", _inferenceservice_path("kserve", name))
        return json.dumps(service.get("status", {}), indent=2)
    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    mcp.run()
