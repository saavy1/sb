# Hermes Deployment

The `hermes-env` ExternalSecret references a SOPS-encrypted secret created manually.

## Creating the encrypted secret

On a machine with `sops` and the age private key:

```bash
cat > /tmp/hermes-env.yaml << 'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: hermes-env
  namespace: hermes
stringData:
  DISCORD_TOKEN: "your-discord-bot-token"
  DEEPSEEK_API_KEY: "sk-your-deepseek-key"
EOF

sops --encrypt --age age1776wth2d8psy2swdcuw5t5ptj4hdegnjzh2eppz4gahas6waks7q37cf57 \
  /tmp/hermes-env.yaml > argocd/clusters/superbloom/infra/hermes/resources/hermes-env.enc.yaml

rm /tmp/hermes-env.yaml
```

Then commit the encrypted file.

## MCP Servers

Only the custom `mcp-kserve` server is bundled. Community MCP servers for Kubernetes and Grafana should be added to the Hermes container image or installed at runtime.
