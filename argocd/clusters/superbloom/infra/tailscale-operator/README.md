# Tailscale Operator Setup

## Prerequisites

1. Create an OAuth client in the Tailscale admin console:
   - Go to https://login.tailscale.com/admin/settings/oauth
   - Create a new OAuth client with tags: `tag:k8s-operator`
   - Save the client ID and client secret

## Secret Creation

```bash
# Create namespace and SOPS-encrypted secret
kubectl create namespace tailscale --dry-run=client -o yaml | kubectl apply -f -

cat > /tmp/tailscale-creds.yaml << 'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: operator-oauth
  namespace: tailscale
stringData:
  client_id: "<oauth-client-id>"
  client_secret: "<oauth-client-secret>"
EOF

sops --encrypt --age age1776wth2d8psy2swdcuw5t5ptj4hdegnjzh2eppz4gahas6waks7q37cf57 \
  /tmp/tailscale-creds.yaml > argocd/clusters/superbloom/infra/tailscale-operator/tailscale-creds.enc.yaml

rm /tmp/tailscale-creds.yaml
```
