"""Hermes MCP server for PromStack/Grafana queries."""
import asyncio
import json
import os
import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server

GRAFANA_URL = os.environ.get("GRAFANA_URL", "https://grafana.saavylab.dev")
GRAFANA_TOKEN = os.environ.get("GRAFANA_API_TOKEN", "")

server = Server("mcp-grafana")

async def grafana_query(query: str) -> dict:
    headers = {"Authorization": f"Bearer {GRAFANA_TOKEN}"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GRAFANA_URL}/api/ds/query",
            headers=headers,
            json=json.loads(query),
            timeout=30,
        )
        return resp.json()

@server.tool()
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

@server.tool()
async def alert_status() -> str:
    """Get current firing alerts from Prometheus AlertManager."""
    return await promql("ALERTS{alertstate='firing'}")

@server.tool()
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

async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write)

if __name__ == "__main__":
    asyncio.run(main())
