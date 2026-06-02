# SOPS Secret Migration — Replace Infisical with Flux SOPS Decryption

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all failing Infisical-backed ExternalSecrets with SOPS-encrypted Kubernetes Secrets decrypted by Flux's built-in SOPS provider.

**Architecture:** Flux's `argocd` Kustomization (which watches `./argocd/clusters/superbloom`) gains SOPS decryption. SOPS-encrypted Secret manifests (`.enc.yaml`) are placed alongside app resources and included in kustomizations. Flux decrypts them before kustomize build, creating regular Kubernetes Secrets. Apps already reference these Secrets by name — no application changes needed.

**Key finding:** ESO v2.0.1 does NOT have a built-in SOPS provider. The `sops-store` ClusterSecretStore manifest in the repo cannot work. Instead, we use Flux's built-in SOPS decryption which is already partially configured (only `infra` Kustomization has it today).

**Tech Stack:** SOPS + age, Flux CD, Kustomize, kubectl

---

### Task 1: Enable SOPS Decryption on the Flux `argocd` Kustomization

**Files:**
- Modify: `sb/flux/clusters/superbloom/argocd.yaml`

- [ ] **Step 1: Add decryption config to argocd Kustomization**

Edit `sb/flux/clusters/superbloom/argocd.yaml` — add the `decryption` block:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: argocd
  namespace: flux-system
spec:
  interval: 10m0s
  path: ./argocd/clusters/superbloom
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: infra
  wait: true
  timeout: 10m
  decryption:
    provider: sops
    secretRef:
      name: sops-age
```

- [ ] **Step 2: Apply the change to the cluster**

```bash
kubectl apply -f sb/flux/clusters/superbloom/argocd.yaml
```

- [ ] **Step 3: Verify Flux reconciliation**

```bash
kubectl -n flux-system get kustomization argocd -o custom-columns=NAME:.metadata.name,DECRYPTION:.spec.decryption.provider,READY:.status.conditions[-1].status --no-headers
```

Expected: `argocd   sops   True`

- [ ] **Step 4: Commit**

```bash
cd sb
git add flux/clusters/superbloom/argocd.yaml
git commit -m "feat: enable SOPS decryption on Flux argocd Kustomization"
```

---

### Task 2: Fix Hermes Secrets

**Files:**
- Modify: `sb/argocd/clusters/superbloom/infra/hermes/resources/kustomization.yaml`
- Create: (regenerate) `sb/argocd/clusters/superbloom/infra/hermes/resources/hermes-env.enc.yaml`
- Delete: `sb/argocd/clusters/superbloom/infra/hermes/resources/external-secret.yaml`

- [ ] **Step 1: Remove ESO ExternalSecret from hermes kustomization**

Edit `sb/argocd/clusters/superbloom/infra/hermes/resources/kustomization.yaml` — remove `external-secret.yaml` from the resources list:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - deployment.yaml
  - pvc.yaml
  - rbac.yaml
  - hermes-env.enc.yaml

configMapGenerator:
  - name: hermes-config
    files:
      - config.yaml
  - name: hermes-soul
    files:
      - SOUL.md
  - name: mcp-kserve
    files:
      - server.py=mcp-kserve-server.py
```

- [ ] **Step 2: Add GRAFANA_API_TOKEN to the encrypted file and re-encrypt**

The current `hermes-env.enc.yaml` is missing `GRAFANA_API_TOKEN` which the deployment references. Re-create it with all three keys.

Create a temp plaintext file (run this on a machine with the age private key):

```bash
cat > /tmp/hermes-env-plain.yaml << 'CEOF'
apiVersion: v1
kind: Secret
metadata:
  name: hermes-env
  namespace: hermes
stringData:
  DISCORD_TOKEN: "<YOUR_DISCORD_BOT_TOKEN>"
  DEEPSEEK_API_KEY: "<YOUR_DEEPSEEK_API_KEY>"
  GRAFANA_API_TOKEN: "<YOUR_GRAFANA_API_TOKEN>"
CEOF

sops --encrypt --age age1776wth2d8psy2swdcuw5t5ptj4hdegnjzh2eppz4gahas6waks7q37cf57 \
  /tmp/hermes-env-plain.yaml > sb/argocd/clusters/superbloom/infra/hermes/resources/hermes-env.enc.yaml

rm /tmp/hermes-env-plain.yaml
```

- [ ] **Step 3: Delete the old ESO ExternalSecret YAML from the repo**

```bash
rm sb/argocd/clusters/superbloom/infra/hermes/resources/external-secret.yaml
```

- [ ] **Step 4: Commit**

```bash
cd sb
git add argocd/clusters/superbloom/infra/hermes/resources/
git commit -m "fix(hermes): replace ESO ExternalSecret with SOPS-encrypted Secret, add GRAFANA_API_TOKEN"
```

---

### Task 3: Create SOPS-encrypted Secrets for ddns, authelia, zot-push, argo-workflows, home-assistant

**Files to create:**
- `sb/argocd/clusters/superbloom/infra/ddns/resources/ddns-env.enc.yaml`
- `sb/argocd/clusters/superbloom/infra/authelia/resources/authelia-users.enc.yaml`
- `sb/argocd/clusters/superbloom/infra/authelia/resources/authelia-secrets.enc.yaml`
- `sb/argocd/clusters/superbloom/infra/buildkit/resources/zot-push.enc.yaml`
- `sb/argocd/clusters/superbloom/infra/argo-workflows/resources/argo-workflows-webhook-clients.enc.yaml`

**Files to modify:**
- `sb/argocd/clusters/superbloom/infra/ddns/resources/kustomization.yaml`
- `sb/argocd/clusters/superbloom/infra/authelia/resources/kustomization.yaml`
- `sb/argocd/clusters/superbloom/infra/buildkit/resources/kustomization.yaml`
- `sb/argocd/clusters/superbloom/infra/argo-workflows/resources/kustomization.yaml`

- [ ] **Step 1: Create ddns-env encrypted secret**

Create the plaintext and encrypt:

```bash
cat > /tmp/ddns-env-plain.yaml << 'CEOF'
apiVersion: v1
kind: Secret
metadata:
  name: ddns-env
  namespace: ddns
stringData:
  CLOUDFLARE_API_TOKEN: "<YOUR_CLOUDFLARE_API_TOKEN>"
CEOF

sops --encrypt --age age1776wth2d8psy2swdcuw5t5ptj4hdegnjzh2eppz4gahas6waks7q37cf57 \
  /tmp/ddns-env-plain.yaml > sb/argocd/clusters/superbloom/infra/ddns/resources/ddns-env.enc.yaml

rm /tmp/ddns-env-plain.yaml
```

- [ ] **Step 2: Update ddns resources kustomization**

Edit `sb/argocd/clusters/superbloom/infra/ddns/resources/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - ddns-env.enc.yaml
```

- [ ] **Step 3: Create authelia-users encrypted secret**

```bash
cat > /tmp/authelia-users-plain.yaml << 'CEOF'
apiVersion: v1
kind: Secret
metadata:
  name: authelia-users
  namespace: authelia
stringData:
  users.yaml: |
    users:
      <YOUR_USERNAME>:
        disabled: false
        displayname: "<YOUR_DISPLAY_NAME>"
        password: "<ARGON2_HASHED_PASSWORD>"
        email: "<YOUR_EMAIL>"
        groups:
          - admins
          - dev
CEOF

sops --encrypt --age age1776wth2d8psy2swdcuw5t5ptj4hdegnjzh2eppz4gahas6waks7q37cf57 \
  /tmp/authelia-users-plain.yaml > sb/argocd/clusters/superbloom/infra/authelia/resources/authelia-users.enc.yaml

rm /tmp/authelia-users-plain.yaml
```

- [ ] **Step 4: Create authelia-secrets encrypted secret**

```bash
cat > /tmp/authelia-secrets-plain.yaml << 'CEOF'
apiVersion: v1
kind: Secret
metadata:
  name: authelia-secrets
  namespace: authelia
stringData:
  identity_validation.reset_password.jwt.hmac.key: "<GENERATE_RANDOM_64_CHAR_KEY>"
  session.encryption.key: "<GENERATE_RANDOM_64_CHAR_KEY>"
  storage.encryption.key: "<GENERATE_RANDOM_64_CHAR_KEY>"
  jwt.token.hmac.key: "<GENERATE_RANDOM_64_CHAR_KEY>"
CEOF

sops --encrypt --age age1776wth2d8psy2swdcuw5t5ptj4hdegnjzh2eppz4gahas6waks7q37cf57 \
  /tmp/authelia-secrets-plain.yaml > sb/argocd/clusters/superbloom/infra/authelia/resources/authelia-secrets.enc.yaml

rm /tmp/authelia-secrets-plain.yaml
```

- [ ] **Step 5: Update authelia resources kustomization**

Edit `sb/argocd/clusters/superbloom/infra/authelia/resources/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - authelia-users.enc.yaml
  - authelia-secrets.enc.yaml
```

- [ ] **Step 6: Create zot-push encrypted secret (for buildkit and argo namespaces)**

Note: Buildkit expects `kubernetes.io/dockerconfigjson` format. Create two copies — one per namespace.

```bash
# For buildkit namespace
kubectl create secret docker-registry zot-push \
  --namespace=buildkit \
  --docker-server=registry.saavylab.dev \
  --docker-username="<ZOT_USERNAME>" \
  --docker-password="<ZOT_PASSWORD>" \
  --dry-run=client -o yaml > /tmp/zot-push-buildkit-plain.yaml

sops --encrypt --age age1776wth2d8psy2swdcuw5t5ptj4hdegnjzh2eppz4gahas6waks7q37cf57 \
  /tmp/zot-push-buildkit-plain.yaml > sb/argocd/clusters/superbloom/infra/buildkit/resources/zot-push.enc.yaml

# For argo namespace
kubectl create secret docker-registry zot-push \
  --namespace=argo \
  --docker-server=registry.saavylab.dev \
  --docker-username="<ZOT_USERNAME>" \
  --docker-password="<ZOT_PASSWORD>" \
  --dry-run=client -o yaml > /tmp/zot-push-argo-plain.yaml

sops --encrypt --age age1776wth2d8psy2swdcuw5t5ptj4hdegnjzh2eppz4gahas6waks7q37cf57 \
  /tmp/zot-push-argo-plain.yaml > sb/argocd/clusters/superbloom/infra/argo-workflows/resources/zot-push.enc.yaml

rm /tmp/zot-push-buildkit-plain.yaml /tmp/zot-push-argo-plain.yaml
```

- [ ] **Step 7: Update buildkit and argo-workflows kustomizations**

Edit `sb/argocd/clusters/superbloom/infra/buildkit/resources/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - configmap.yaml
  - statefulset.yaml
  - service.yaml
  - zot-push.enc.yaml
```

Edit `sb/argocd/clusters/superbloom/infra/argo-workflows/resources/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - argo-workflows-server-rbac.yaml
  - github-webhook-rbac.yaml
  - github-webhook-token-secret.yaml
  - workflow-runner-rbac.yaml
  - zot-push.enc.yaml
  - argo-workflows-webhook-clients.enc.yaml
```

- [ ] **Step 8: Create argo-workflows-webhook-clients encrypted secret**

```bash
cat > /tmp/argo-webhook-plain.yaml << 'CEOF'
apiVersion: v1
kind: Secret
metadata:
  name: argo-workflows-webhook-clients
  namespace: argo
stringData:
  githubWebhookSecret: "<YOUR_GITHUB_WEBHOOK_SECRET>"
CEOF

sops --encrypt --age age1776wth2d8psy2swdcuw5t5ptj4hdegnjzh2eppz4gahas6waks7q37cf57 \
  /tmp/argo-webhook-plain.yaml > sb/argocd/clusters/superbloom/infra/argo-workflows/resources/argo-workflows-webhook-clients.enc.yaml

rm /tmp/argo-webhook-plain.yaml
```

- [ ] **Step 9: Create home-assistant registry pull secret**

Home Assistant's `ha-registry-pull` is referenced via `imagePullSecrets` in values.yaml. Create it as a dockerconfigjson:

```bash
kubectl create secret docker-registry ha-registry-pull \
  --namespace=home-assistant \
  --docker-server=registry.saavylab.dev \
  --docker-username="<ZOT_USERNAME>" \
  --docker-password="<ZOT_PASSWORD>" \
  --dry-run=client -o yaml > /tmp/ha-registry-plain.yaml

sops --encrypt --age age1776wth2d8psy2swdcuw5t5ptj4hdegnjzh2eppz4gahas6waks7q37cf57 \
  /tmp/ha-registry-plain.yaml > sb/argocd/clusters/superbloom/infra/home-assistant/resources/ha-registry-pull.enc.yaml

rm /tmp/ha-registry-plain.yaml
```

- [ ] **Step 10: Update home-assistant resources kustomization**

Edit `sb/argocd/clusters/superbloom/infra/home-assistant/resources/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - ha-registry-pull.enc.yaml
```

- [ ] **Step 11: Commit**

```bash
cd sb
git add argocd/clusters/superbloom/infra/ddns/resources/ddns-env.enc.yaml \
        argocd/clusters/superbloom/infra/ddns/resources/kustomization.yaml \
        argocd/clusters/superbloom/infra/authelia/resources/authelia-users.enc.yaml \
        argocd/clusters/superbloom/infra/authelia/resources/authelia-secrets.enc.yaml \
        argocd/clusters/superbloom/infra/authelia/resources/kustomization.yaml \
        argocd/clusters/superbloom/infra/buildkit/resources/zot-push.enc.yaml \
        argocd/clusters/superbloom/infra/buildkit/resources/kustomization.yaml \
        argocd/clusters/superbloom/infra/argo-workflows/resources/zot-push.enc.yaml \
        argocd/clusters/superbloom/infra/argo-workflows/resources/argo-workflows-webhook-clients.enc.yaml \
        argocd/clusters/superbloom/infra/argo-workflows/resources/kustomization.yaml \
        argocd/clusters/superbloom/infra/home-assistant/resources/ha-registry-pull.enc.yaml \
        argocd/clusters/superbloom/infra/home-assistant/resources/kustomization.yaml
git commit -m "feat: add SOPS-encrypted secrets for all apps replacing Infisical ESO"
```

---

### Task 4: Push Changes and Verify Flux Decrypts Secrets

- [ ] **Step 1: Push to main**

```bash
cd sb
git push origin main
```

- [ ] **Step 2: Wait for Flux to reconcile the argocd Kustomization**

```bash
kubectl -n flux-system wait kustomization/argocd --for=condition=ready --timeout=5m
```

- [ ] **Step 3: Verify secrets are created in each namespace**

```bash
for ns in ddns authelia buildkit argo home-assistant hermes; do
  echo "=== $ns ==="
  kubectl -n $ns get secrets --field-selector type=Opaque -o custom-columns=NAME:.metadata.name --no-headers
done
```

Expected: All the newly created secret names appear in each namespace.

- [ ] **Step 4: Spot-check one decrypted secret to confirm values are correct**

```bash
kubectl -n hermes get secret hermes-env -o jsonpath='{.data.DISCORD_TOKEN}' | base64 -d | head -c 5
```

Expected: First 5 chars of the discord token (confirms it's not still encrypted).

- [ ] **Step 5: Verify ArgoCD app health after secrets are available**

```bash
kubectl -n argocd get applications.argoproj.io -o custom-columns=NAME:.metadata.name,HEALTH:.status.health.status,SYNC:.status.sync.status --no-headers | grep -E 'hermes|ddns|authelia|buildkit|argo-workflows|home-assistant'
```

Expected: All apps show Healthy/Progressing (may take a sync cycle after secrets appear).

---

### Task 5: Delete Remaining Infisical ExternalSecrets and ClusterSecretStores

Note: Once Flux has created the SOPS-backed Secrets, the Infisical ExternalSecrets are no longer needed but still fail in the cluster.

- [ ] **Step 1: Remove ESO ExternalSecrets (keep the destination Secrets, just remove the ExternalSecret CRs)**

The `deletionPolicy: Retain` on all these ExternalSecrets means deleting the ExternalSecret CR will NOT delete the underlying Kubernetes Secret. This is safe.

```bash
kubectl delete externalsecret -n argo argo-workflows-webhook-clients zot-push
kubectl delete externalsecret -n authelia authelia-secrets authelia-users
kubectl delete externalsecret -n buildkit zot-push
kubectl delete externalsecret -n ddns ddns-env
kubectl delete externalsecret -n home-assistant ha-registry-pull
kubectl delete externalsecret -n hermes hermes-env
```

- [ ] **Step 2: Remove Infisical ClusterSecretStores**

```bash
kubectl delete clustersecretstore infisical-data infisical-infra infisical-media infisical-nexus
```

- [ ] **Step 3: Verify clean state**

```bash
kubectl get externalsecret -A
kubectl get clustersecretstore
```

Expected: Only `sops-store` may remain (see Task 6), or empty output. No Infisical references.

- [ ] **Step 4: Commit (optional — these are live cluster changes only)**

No repo changes for this task; these are live cleanup commands only.

---

### Task 6: Remove Non-Working ESO ClusterSecretStore Manifest

The `sops-store` ClusterSecretStore manifest at `sb/argocd/clusters/superbloom/infra/external-secrets/resources/cluster-secret-store-sops.yaml` cannot work because ESO v2.0.1 does not include a SOPS provider. Remove it from the repo.

**Files:**
- Delete: `sb/argocd/clusters/superbloom/infra/external-secrets/resources/cluster-secret-store-sops.yaml`
- Modify: `sb/argocd/clusters/superbloom/infra/external-secrets/resources/kustomization.yaml`

- [ ] **Step 1: Delete the manifest**

```bash
rm sb/argocd/clusters/superbloom/infra/external-secrets/resources/cluster-secret-store-sops.yaml
```

- [ ] **Step 2: Update the kustomization to remove the reference**

Edit `sb/argocd/clusters/superbloom/infra/external-secrets/resources/kustomization.yaml` — remove the `cluster-secret-store-sops.yaml` entry, leaving an empty resources list:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources: []
```

- [ ] **Step 3: Delete the stale ClusterSecretStore from the cluster**

```bash
kubectl delete clustersecretstore sops-store --ignore-not-found
```

- [ ] **Step 4: Commit**

```bash
cd sb
git rm argocd/clusters/superbloom/infra/external-secrets/resources/cluster-secret-store-sops.yaml
git add argocd/clusters/superbloom/infra/external-secrets/resources/kustomization.yaml
git commit -m "chore: remove non-working ESO SOPS ClusterSecretStore (SOPS provider not in ESO v2.0.1)"
```

- [ ] **Step 5: Push and verify ArgoCD reconciles**

```bash
git push origin main
kubectl -n argocd wait application/infra-external-secrets --for=jsonpath='{.status.health.status}'=Healthy --timeout=5m
```

---

### Task 7: Final End-to-End Verification

- [ ] **Step 1: All Flux Kustomizations healthy**

```bash
kubectl -n flux-system get kustomizations -o custom-columns=NAME:.metadata.name,READY:.status.conditions[-1].status,DECRYPTION:.spec.decryption.provider --no-headers
```

Expected: All three (flux-system, infra, argocd) show `True`, with `argocd` showing `sops` decryption.

- [ ] **Step 2: All ArgoCD applications healthy**

```bash
kubectl -n argocd get applications.argoproj.io -o custom-columns=NAME:.metadata.name,HEALTH:.status.health.status,SYNC:.status.sync.status --no-headers
```

Expected: All apps Healthy and Synced.

- [ ] **Step 3: All SOPS-backed secrets present**

```bash
for ns in ddns authelia buildkit argo home-assistant hermes; do
  echo "=== $ns ==="
  kubectl -n $ns get secrets --field-selector type=Opaque -o name
done
```

- [ ] **Step 4: Verify a secret was actually decrypted (not still SOPS-encrypted)**

```bash
# Check that a secret's data is valid base64 (decrypted), not SOPS format
kubectl -n hermes get secret hermes-env -o jsonpath='{.data.DISCORD_TOKEN}' | base64 -d 2>/dev/null | head -c 1 > /dev/null && echo "PASS: Secret is decrypted" || echo "FAIL: Secret may still be encrypted"
```

Expected: `PASS: Secret is decrypted`
