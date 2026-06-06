# Model Catalog CRD Runtime State Design

## Goal

Replace model-catalog runtime ConfigMap state with first-class Kubernetes CRDs and add a readiness reconciler so Hermes can manage model experiments dynamically without GitOps PRs for each model.

GitOps remains responsible for installing infrastructure: CRD definitions, RBAC, the model-catalog MCP deployment, and stable seed configuration. Hermes remains responsible for creating, updating, stopping, and observing runtime model objects through typed MCP tools.

## Decisions

- Runtime recipes and runtime deployments both become CRDs.
- CRDs are namespaced under the API group `models.saavylab.dev`.
- CRD kinds are `ModelRecipe` and `ModelDeployment`.
- Runtime state moves with a big-bang cutover: tools read/write CRDs only, with no ConfigMap fallback.
- CRD definitions are generated from Rust types and committed to `sb` for GitOps installation.
- New model experiments do not require GitOps: Hermes creates `ModelRecipe` and `ModelDeployment` objects dynamically through MCP tools.
- `ModelDeployment` readiness is reconciled from KServe `InferenceService` status conditions, not predictor pods directly.
- The reconciler runs as a background task inside `model-catalog-mcp`.

## Non-Goals

- Do not implement a full operator that creates KServe resources solely from `ModelDeployment` desired state.
- Do not migrate existing ConfigMap runtime state automatically.
- Do not add admission webhooks.
- Do not change local YAML seed recipes; they still provide GitOps-managed baseline recipes.
- Do not require PRs for creating or importing runtime model recipes.

## API Shape

### ModelRecipe

`ModelRecipe` is a namespaced CRD storing runtime-created recipes.

Recommended resource identity:

- Namespace: `MODEL_CATALOG_STATE_NAMESPACE`, currently `hermes`
- Name: sanitized recipe id, prefixed if needed for safety
- Labels:
  - `app.kubernetes.io/part-of: model-catalog-mcp`
  - `models.saavylab.dev/kind: recipe`
  - `models.saavylab.dev/recipe-id: <bounded recipe id>`

Spec:

```yaml
apiVersion: models.saavylab.dev/v1alpha1
kind: ModelRecipe
metadata:
  name: lfm25-350m
  namespace: hermes
spec:
  recipe:
    id: lfm25-350m
    source: spark-arena
    model: {}
    runtime: {}
    hardware: {}
    serving: {}
    provenance: {}
  createdBy: hermes
  createdAt: "2026-06-05T00:00:00Z"
  updatedAt: "2026-06-05T00:00:00Z"
```

The `recipe` field should reuse the existing `model_catalog::Recipe` type.

### ModelDeployment

`ModelDeployment` is a namespaced CRD storing desired deployment metadata in `spec` and observed lifecycle in `status`.

Recommended resource identity:

- Namespace: `MODEL_CATALOG_STATE_NAMESPACE`, currently `hermes`
- Name: sanitized deployment name
- Labels:
  - `app.kubernetes.io/part-of: model-catalog-mcp`
  - `models.saavylab.dev/kind: deployment`
  - `models.saavylab.dev/deployment-name: <bounded deployment name>`
  - `models.saavylab.dev/target: <bounded target>`

Spec:

```yaml
apiVersion: models.saavylab.dev/v1alpha1
kind: ModelDeployment
metadata:
  name: lfm25-350m
  namespace: hermes
spec:
  name: lfm25-350m
  namespace: ai
  recipeId: lfm25-350m
  target: spark
  runtimeArgs: []
  runtimeEnv: []
  resources:
    cpu: "2"
    memory: 16Gi
    gpuCount: 1
  lastPlanDigest: sha256:...
  createdBy: hermes
  createdAt: "2026-06-05T00:00:00Z"
```

Status:

```yaml
status:
  state: applying
  observedGeneration: 1
  lastTransitionTime: "2026-06-05T00:00:00Z"
  failureReason: null
  kserveReady: false
  url: null
```

`state` uses the existing lifecycle values:

- `planned`
- `applying`
- `ready`
- `failed`
- `stopped`

## Rust Type Model

Add CRD wrapper types in `model-catalog`, deriving `CustomResource`, `Serialize`, `Deserialize`, `JsonSchema`, and `Clone`:

- `ModelRecipeSpec`
- `ModelDeploymentSpec`
- `ModelDeploymentStatus`

Keep existing domain structs for MCP responses:

- `RuntimeRecipeRecord`
- `RuntimeDeploymentRecord`
- `DeploymentState`

Add conversion functions between CRD types and the existing runtime record types. This avoids leaking Kubernetes object metadata through MCP responses while still exposing clean runtime state to callers.

`RuntimeDeploymentRecord.status` should remain for MCP compatibility, but the CRD-backed store should source it from `ModelDeployment.status.state`.

## Store Interface

Preserve the current runtime store function names and signatures where possible:

- `upsert_runtime_recipe`
- `list_runtime_recipes`
- `get_runtime_recipe`
- `delete_runtime_recipe`
- `upsert_runtime_deployment`
- `list_runtime_deployments`
- `get_runtime_deployment`

Internally, replace `Api<ConfigMap>` with typed CRD APIs:

- `Api<ModelRecipe>`
- `Api<ModelDeployment>`

Use server-side apply for spec upserts. Use the `/status` subresource for reconciler status patches.

The big-bang cutover means these functions must not read old ConfigMaps.

## MCP Tool Behavior

### Recipe tools

- `create_recipe` creates or updates a `ModelRecipe`.
- `delete_recipe` deletes the `ModelRecipe` and remains idempotent for missing objects.
- `import_spark_arena_recipe` writes a `ModelRecipe`.
- `search_recipes` and `show_recipe` merge local YAML seed recipes with runtime `ModelRecipe` objects.
- Runtime `ModelRecipe` objects continue to override local recipes with the same id.

### Deployment tools

- `deploy_model` keeps the current flow:
  1. Load merged recipe.
  2. Build `DeployOverrides`.
  3. Run `plan_deploy`.
  4. Reject validation issues.
  5. Render KServe `InferenceService`.
  6. Server-side dry-run the KServe object.
  7. Create or update the KServe object.
  8. Create or update `ModelDeployment` with initial status `applying`.

- `stop_model`:
  1. Deletes the KServe `InferenceService`.
  2. Treats KServe 404 as success.
  3. Updates `ModelDeployment.status.state = stopped`.
  4. Clears `failureReason`.

- `list_deployments` lists `ModelDeployment` CRDs and returns MCP-friendly runtime records, optionally filtering by target.

## Readiness Reconciler

Run a background reconciler inside `model-catalog-mcp` after the MCP server initializes.

Loop behavior:

1. List or watch `ModelDeployment` objects in `MODEL_CATALOG_STATE_NAMESPACE`.
2. Ignore deployments whose status state is `stopped`.
3. For each active deployment, read the matching KServe `InferenceService` from `spec.namespace` and `spec.name`.
4. Map KServe status conditions to `ModelDeployment.status`.
5. Patch only the status subresource.
6. Log errors and retry; do not crash the MCP server on transient Kubernetes failures.

Recommended KServe mapping:

- `Ready=True`:
  - `state = ready`
  - `kserveReady = true`
  - `failureReason = null`
  - `url = status.url` if present
- `Ready=False` with a reason/message:
  - `state = failed` only when the condition indicates a terminal or clearly failed state
  - `failureReason = <reason/message>`
- `Ready=Unknown` or no Ready condition:
  - `state = applying`
  - preserve or clear failure reason based on observed conditions
- Missing KServe `InferenceService` while deployment is not stopped:
  - `state = failed`
  - `failureReason = "KServe InferenceService not found"`

The reconciler should update `observedGeneration` and `lastTransitionTime` whenever the state changes.

## CRD Manifests and GitOps

Generate CRD YAML from Rust types and commit the rendered CRDs into `sb`, under the model-catalog MCP infrastructure manifests.

Expected files:

- `argocd/clusters/superbloom/infra/model-catalog-mcp/resources/modelrecipes-crd.yaml`
- `argocd/clusters/superbloom/infra/model-catalog-mcp/resources/modeldeployments-crd.yaml`

Add both files to `kustomization.yaml`.

The model-catalog MCP deployment must not attempt to create CRD definitions at runtime. It should fail clearly if the CRDs are not installed.

## RBAC

Update model-catalog MCP RBAC:

```yaml
- apiGroups: ["models.saavylab.dev"]
  resources: ["modelrecipes"]
  verbs: ["get", "list", "watch", "create", "patch", "update", "delete"]
- apiGroups: ["models.saavylab.dev"]
  resources: ["modeldeployments"]
  verbs: ["get", "list", "watch", "create", "patch", "update", "delete"]
- apiGroups: ["models.saavylab.dev"]
  resources: ["modeldeployments/status"]
  verbs: ["get", "patch", "update"]
- apiGroups: ["serving.kserve.io"]
  resources: ["inferenceservices", "inferenceservices/status"]
  verbs: ["get", "list", "watch"]
```

Keep existing permissions needed for KServe create/delete, jobs, pods, logs, events, nodes, secrets, and Prometheus-independent capacity reporting.

## Migration and Rollout

This is a big-bang runtime-state cutover:

1. Commit CRD definitions and RBAC to `sb`.
2. Let Argo install CRDs and RBAC.
3. Deploy the updated `model-catalog-mcp` image.
4. Runtime recipe/deployment tools now read and write CRDs only.
5. Existing runtime ConfigMaps are ignored.

Seed recipes from local YAML ConfigMaps remain valid because they are not runtime state.

If preserving old runtime ConfigMap data becomes necessary, perform a manual one-time import before the cutover. The implementation does not include automatic migration.

## Error Handling

- Missing CRDs should return actionable MCP errors such as `ModelRecipe CRD is not installed`.
- Delete operations should remain idempotent on 404.
- Status patch conflicts should retry with a fresh object.
- Reconciler failures should be logged with deployment name, namespace, and target.
- A failed status update must not block deployment creation.
- A failed deployment record write after KServe creation should return an error and leave the operator a clear cleanup path through `stop_model`.

## Testing Plan

### Unit tests

- CRD spec to runtime record conversion.
- Runtime record to CRD spec conversion.
- Recipe merge behavior with CRD-backed runtime recipes.
- KServe condition mapping:
  - Ready true maps to `ready`.
  - Ready unknown maps to `applying`.
  - terminal false maps to `failed`.
  - missing InferenceService maps to `failed`.
- Status transition timestamp only changes when state changes.

### Kubernetes crate tests

- CRD object names are sanitized and stable.
- Label values are bounded.
- Store list/get/upsert/delete helpers compile and build expected typed objects.
- Status patch builder targets the `/status` subresource.

### MCP tests

- Existing recipe and deployment tools still serialize valid `ToolResult`s.
- `list_deployments` filters by target using CRD-backed records.
- `deploy_model` creates a `ModelDeployment` with initial status `applying`.
- `stop_model` updates status to `stopped`.

### Manifest validation

- `cargo test --workspace`
- `cargo fmt --all -- --check`
- `cargo clippy --all-targets -- -D warnings`
- Generate CRD YAML from Rust types.
- `kubectl kustomize` on the model-catalog MCP resources.
- `kubectl apply --dry-run=server -k` on the model-catalog MCP resources.

## Risks and Tradeoffs

- Big-bang cutover is simpler but ignores existing runtime ConfigMaps.
- Running a reconciler inside the MCP server is pragmatic, but less isolated than a dedicated operator.
- CRD schemas must remain compatible with existing recipe/deployment structs.
- KServe condition semantics may need tuning after observing real failures.
- Status updates are eventually consistent; MCP calls should not assume immediate readiness.

## Success Criteria

- `kubectl get modelrecipes -n hermes` lists runtime recipes imported by Hermes.
- `kubectl get modeldeployments -n hermes` lists deployments created by Hermes.
- New model experiments require only MCP tool calls, not GitOps PRs.
- `list_deployments` reflects `applying`, `ready`, `failed`, and `stopped` states from CRD status.
- Existing Spark Arena import, recipe merge, capacity estimate, deploy, stop, and list flows continue to work through MCP.
