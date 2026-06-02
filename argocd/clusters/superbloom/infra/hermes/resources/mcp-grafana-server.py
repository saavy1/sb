"""Hermes MCP server for PromStack/Grafana queries."""
import asyncio
import json
import os
import httpx
from mcp.server.fastmcp import FastMCP

GRAFANA_URL = os.environ.get("GRAFANA_URL", "https://grafana.saavylab.dev")
GRAFANA_TOKEN = os.environ.get("GRAFANA_API_TOKEN", "")

mcp = FastMCP("mcp-grafana")

async def grafana_query(query: str) -> dict:
    headers = {
        "Authorization": f"Bearer {GRAFANA_TOKEN}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GRAFANA_URL}/api/ds/query",
            headers=headers,
            content=query,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

@mcp.tool()
async def promql(query: str) -> str:
    """Execute a PromQL query against the cluster Prometheus."""
    payload = {
        "queries": [{
            "refId": "A",
            "datasource": {"type": "prometheus", "uid": "prometheus"},
            "expr": query,
        }],
        "from": "now-5m",
        "to": "now",
    }
    result = await grafana_query(json.dumps(payload))
    return json.dumps(result, indent=2)

@mcp.tool()
async def alert_status() -> str:
    """Get current firing alerts from Prometheus AlertManager."""
    return await promql("ALERTS{alertstate='firing'}")

@mcp.tool()
async def loki_query(query: str, limit: int = 10) -> str:
    """Search logs via Loki."""
    payload = {
        "queries": [{
            "refId": "A",
            "datasource": {"type": "loki", "uid": "loki"},
            "expr": query,
            "maxLines": limit,
        }],
        "from": "now-1h",
        "to": "now",
    }
    result = await grafana_query(json.dumps(payload))
    return json.dumps(result, indent=2)

if __name__ == "__main__":
    mcp.run()
