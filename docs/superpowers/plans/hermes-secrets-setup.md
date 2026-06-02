# Hermes Secrets Setup

## One-time manual steps (run on the server)

### 1. Create the age private key secret for ESO

```bash
kubectl create namespace external-secrets --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic sops-age-key \
  -n external-secrets \
  --from-file=key.txt=sops_age_keys.txt
```

### 2. Create Hermes environment secrets

```bash
# Create a temp file with the secrets
cat > /tmp/hermes-env.yaml << 'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: hermes-env
  namespace: hermes
stringData:
  DISCORD_TOKEN: "<your-discord-bot-token>"
  DEEPSEEK_API_KEY: "<your-deepseek-api-key>"
EOF

# Encrypt with SOPS
sops --encrypt --age age1776wth2d8psy2swdcuw5t5ptj4hdegnjzh2eppz4gahas6waks7q37cf57 \
  /tmp/hermes-env.yaml > argocd/clusters/superbloom/infra/hermes/resources/hermes-env.enc.yaml

# Clean up
rm /tmp/hermes-env.yaml
```
