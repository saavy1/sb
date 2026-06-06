# Model Catalog CRD Runtime State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace runtime ConfigMap state with `ModelRecipe` and `ModelDeployment` CRDs, and add a background reconciler that updates deployment readiness from KServe status.

**Architecture:** Keep the public MCP tool behavior stable while replacing the backing runtime store. Add typed CRD models in `model-catalog`, use typed Kubernetes APIs in `homelab-mcp-k8s`, wire a background reconciler into `model-catalog-mcp`, and install generated CRD manifests/RBAC through `sb` GitOps.

**Tech Stack:** Rust 2024, `kube` 3.1 `CustomResource` derive, `k8s-openapi`, serde, schemars, KServe dynamic objects, Kubernetes CRDs/status subresource, Argo CD kustomize manifests.

---

## File Structure

App repo: `/home/saavy/dev/homelab/homelab-mcp`

- Modify `crates/model-catalog/Cargo.toml`
  - Add `kube.workspace = true` so CRD types can derive `CustomResource`.
- Create `crates/model-catalog/src/crds.rs`
  - Own CRD specs, status type, conversion helpers, and CRD YAML generation tests.
- Modify `crates/model-catalog/src/lib.rs`
  - Export CRD types and conversion helpers.
- Modify `crates/homelab-mcp-k8s/src/runtime_store.rs`
  - Replace ConfigMap store internals with typed `Api<ModelRecipe>` and `Api<ModelDeployment>`.
- Create `crates/homelab-mcp-k8s/src/reconciler.rs`
  - Map KServe `InferenceService` status into `ModelDeploymentStatus`.
  - Implement one-shot and background reconciliation.
- Modify `crates/homelab-mcp-k8s/src/lib.rs`
  - Export CRD store helpers and reconciler entrypoints.
- Modify `servers/model-catalog-mcp/src/main.rs`
  - Start the background reconciler.
  - Update MCP instructions to describe runtime CRDs instead of ConfigMap-only recipes.
- Modify `servers/model-catalog-mcp/src/tools.rs`
  - Keep current tool API; adjust `stop_model` if a dedicated status helper is introduced.

Config repo: `/home/saavy/dev/homelab/sb`

- Create `argocd/clusters/superbloom/infra/model-catalog-mcp/resources/modelrecipes-crd.yaml`
- Create `argocd/clusters/superbloom/infra/model-catalog-mcp/resources/modeldeployments-crd.yaml`
- Modify `argocd/clusters/superbloom/infra/model-catalog-mcp/resources/rbac.yaml`
- Modify `argocd/clusters/superbloom/infra/model-catalog-mcp/resources/kustomization.yaml`

---

## Task 1: Add CRD Types and Conversions

**Files:**

- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/Cargo.toml`
- Create: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/crds.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/lib.rs`

- [ ] **Step 1: Add kube dependency to model-catalog**

In `crates/model-catalog/Cargo.toml`, add:

```toml
kube.workspace = true
```

- [ ] **Step 2: Create CRD types**

Create `crates/model-catalog/src/crds.rs` with this structure:

```rust
use crate::state::{DeploymentState, RuntimeDeploymentRecord, RuntimeRecipeRecord};
use crate::types::{EnvVar, Recipe, ResourceRequests};
use kube::CustomResource;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const MODEL_CRD_GROUP: &str = "models.saavylab.dev";
pub const MODEL_CRD_VERSION: &str = "v1alpha1";

#[derive(Clone, Debug, CustomResource, Deserialize, JsonSchema, PartialEq, Serialize)]
#[kube(
    group = "models.saavylab.dev",
    version = "v1alpha1",
    kind = "ModelRecipe",
    plural = "modelrecipes",
    namespaced,
    derive = "PartialEq",
    status = "ModelRecipeStatus"
)]
#[serde(rename_all = "camelCase")]
pub struct ModelRecipeSpec {
    pub recipe: Recipe,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Default, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRecipeStatus {
    pub observed_generation: Option<i64>,
}

#[derive(Clone, Debug, CustomResource, Deserialize, JsonSchema, PartialEq, Serialize)]
#[kube(
    group = "models.saavylab.dev",
    version = "v1alpha1",
    kind = "ModelDeployment",
    plural = "modeldeployments",
    namespaced,
    derive = "PartialEq",
    status = "ModelDeploymentStatus"
)]
#[serde(rename_all = "camelCase")]
pub struct ModelDeploymentSpec {
    pub name: String,
    pub namespace: String,
    pub recipe_id: String,
    pub target: String,
    pub runtime_args: Vec<String>,
    pub runtime_env: Vec<EnvVar>,
    pub resources: ResourceRequests,
    pub last_plan_digest: String,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDeploymentStatus {
    pub state: DeploymentState,
    pub observed_generation: Option<i64>,
    pub last_transition_time: Option<String>,
    pub failure_reason: Option<String>,
    pub kserve_ready: bool,
    pub url: Option<String>,
}

impl Default for ModelDeploymentStatus {
    fn default() -> Self {
        Self {
            state: DeploymentState::Applying,
            observed_generation: None,
            last_transition_time: None,
            failure_reason: None,
            kserve_ready: false,
            url: None,
        }
    }
}

pub fn recipe_record_to_spec(record: &RuntimeRecipeRecord) -> ModelRecipeSpec {
    ModelRecipeSpec {
        recipe: record.recipe.clone(),
        created_by: record.created_by.clone(),
        created_at: record.created_at.clone(),
        updated_at: record.updated_at.clone(),
    }
}

pub fn recipe_spec_to_record(spec: &ModelRecipeSpec) -> RuntimeRecipeRecord {
    RuntimeRecipeRecord {
        recipe: spec.recipe.clone(),
        created_by: spec.created_by.clone(),
        created_at: spec.created_at.clone(),
        updated_at: spec.updated_at.clone(),
    }
}

pub fn deployment_record_to_spec(record: &RuntimeDeploymentRecord) -> ModelDeploymentSpec {
    ModelDeploymentSpec {
        name: record.name.clone(),
        namespace: record.namespace.clone(),
        recipe_id: record.recipe_id.clone(),
        target: record.target.clone(),
        runtime_args: record.runtime_args.clone(),
        runtime_env: record.runtime_env.clone(),
        resources: record.resources.clone(),
        last_plan_digest: record.last_plan_digest.clone(),
        created_by: record.created_by.clone(),
        created_at: record.created_at.clone(),
    }
}

pub fn deployment_record_to_status(record: &RuntimeDeploymentRecord) -> ModelDeploymentStatus {
    ModelDeploymentStatus {
        state: record.status.clone(),
        observed_generation: None,
        last_transition_time: Some(record.created_at.clone()),
        failure_reason: record.failure_reason.clone(),
        kserve_ready: record.status == DeploymentState::Ready,
        url: None,
    }
}

pub fn deployment_parts_to_record(
    spec: &ModelDeploymentSpec,
    status: Option<&ModelDeploymentStatus>,
) -> RuntimeDeploymentRecord {
    let status = status.cloned().unwrap_or_default();
    RuntimeDeploymentRecord {
        name: spec.name.clone(),
        namespace: spec.namespace.clone(),
        recipe_id: spec.recipe_id.clone(),
        target: spec.target.clone(),
        runtime_args: spec.runtime_args.clone(),
        runtime_env: spec.runtime_env.clone(),
        resources: spec.resources.clone(),
        status: status.state,
        last_plan_digest: spec.last_plan_digest.clone(),
        created_by: spec.created_by.clone(),
        created_at: spec.created_at.clone(),
        failure_reason: status.failure_reason,
    }
}
```

- [ ] **Step 3: Add focused tests**

Add tests in `crds.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::RuntimeDeploymentRecord;
    use crate::types::{
        HardwareSpec, ModelSpec, Provenance, RuntimeSpec, ServingSpec, StorageMode,
    };

    fn sample_recipe() -> Recipe {
        Recipe {
            id: "lfm25-350m".into(),
            source: "spark-arena".into(),
            model: ModelSpec {
                id: "LiquidAI/LFM2.5-350M".into(),
                revision: None,
                quantization: None,
                gated: false,
                license: "apache-2.0".into(),
            },
            runtime: RuntimeSpec {
                image: "vllm/vllm-openai:latest".into(),
                args: vec!["--dtype=auto".into()],
                env: vec![],
                tensor_parallel: 1,
                max_model_len: 32768,
                dtype: "auto".into(),
                tool_call_parser: Some("hermes".into()),
                reasoning_parser: None,
            },
            hardware: HardwareSpec {
                gpu_class: "gb10".into(),
                gpu_count: 1,
                estimated_vram_gb: Some(4),
                gpu_memory_utilization: Some(0.8),
            },
            serving: ServingSpec {
                namespace: "ai".into(),
                service_name: "lfm25-350m".into(),
                replicas: 1,
                storage_mode: StorageMode::ModelCache,
                ingress_policy: "cluster-local".into(),
            },
            provenance: Provenance {
                source: "spark-arena".into(),
                path: "spark-arena-recipes.yaml".into(),
                commit: None,
            },
        }
    }

    #[test]
    fn recipe_record_round_trips_through_spec() {
        let record = RuntimeRecipeRecord {
            recipe: sample_recipe(),
            created_by: "hermes".into(),
            created_at: "2026-06-05T00:00:00Z".into(),
            updated_at: "2026-06-05T00:00:00Z".into(),
        };
        let spec = recipe_record_to_spec(&record);
        assert_eq!(recipe_spec_to_record(&spec), record);
    }

    #[test]
    fn deployment_record_round_trips_through_spec_and_status() {
        let record = RuntimeDeploymentRecord {
            name: "lfm25-350m".into(),
            namespace: "ai".into(),
            recipe_id: "lfm25-350m".into(),
            target: "spark".into(),
            runtime_args: vec!["--max-model-len".into(), "8192".into()],
            runtime_env: vec![],
            resources: ResourceRequests {
                cpu: "2".into(),
                memory: "16Gi".into(),
                gpu_count: 1,
            },
            status: DeploymentState::Applying,
            last_plan_digest: "sha256:test".into(),
            created_by: "hermes".into(),
            created_at: "2026-06-05T00:00:00Z".into(),
            failure_reason: None,
        };
        let spec = deployment_record_to_spec(&record);
        let status = deployment_record_to_status(&record);
        assert_eq!(deployment_parts_to_record(&spec, Some(&status)), record);
    }

    #[test]
    fn generated_crds_have_expected_group_and_kind() {
        use kube::CustomResourceExt;
        assert_eq!(ModelRecipe::crd().spec.group, MODEL_CRD_GROUP);
        assert_eq!(ModelDeployment::crd().spec.group, MODEL_CRD_GROUP);
        assert_eq!(ModelRecipe::crd().spec.names.kind, "ModelRecipe");
        assert_eq!(ModelDeployment::crd().spec.names.kind, "ModelDeployment");
    }
}
```

If actual type names in `types.rs` differ, adapt only the fixture fields while preserving the test assertions.

- [ ] **Step 4: Export CRD module**

In `crates/model-catalog/src/lib.rs`, add:

```rust
pub mod crds;
pub use crds::*;
```

- [ ] **Step 5: Validate Task 1**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p model-catalog crds::tests
cargo fmt --all -- --check
cargo clippy -p model-catalog --all-targets -- -D warnings
```

Expected: all pass.

- [ ] **Step 6: Commit Task 1**

Before committing:

```bash
git status
git diff --cached
git diff
```

Stage and commit only Task 1 files:

```bash
git add crates/model-catalog/Cargo.toml crates/model-catalog/src/crds.rs crates/model-catalog/src/lib.rs Cargo.lock
git diff --cached
git commit -m "feat: add model catalog runtime CRDs"
```

---

## Task 2: Replace ConfigMap Runtime Store with CRD Store

**Files:**

- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/runtime_store.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/lib.rs`

- [ ] **Step 1: Replace ConfigMap imports**

In `runtime_store.rs`, remove `ConfigMap` and add:

```rust
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::{
    Api, Client,
    api::{DeleteParams, ListParams, Patch, PatchParams},
};
use model_catalog::{
    ModelDeployment, ModelDeploymentStatus, ModelRecipe, RuntimeDeploymentRecord,
    RuntimeRecipeRecord, deployment_parts_to_record, deployment_record_to_spec,
    deployment_record_to_status, recipe_record_to_spec, recipe_spec_to_record,
};
```

Remove `RECIPE_LABEL`, `DEPLOYMENT_LABEL`, and `decode_record`.

- [ ] **Step 2: Keep name and label helpers**

Keep `runtime_name` and `bounded_label_value`, but change the names used by runtime state:

```rust
fn recipe_resource_name(recipe_id: &str) -> String {
    runtime_name("model-recipe", recipe_id)
}

fn deployment_resource_name(name: &str) -> String {
    runtime_name("model-deployment", name)
}
```

- [ ] **Step 3: Implement ModelRecipe store functions**

Replace recipe functions with typed CRD logic:

```rust
pub async fn upsert_runtime_recipe(
    client: Client,
    namespace: &str,
    record: &RuntimeRecipeRecord,
) -> Result<String, kube::Error> {
    let api: Api<ModelRecipe> = Api::namespaced(client, namespace);
    let name = recipe_resource_name(&record.recipe.id);
    let mut recipe = ModelRecipe::new(&name, recipe_record_to_spec(record));
    recipe.metadata = ObjectMeta {
        name: Some(name.clone()),
        namespace: Some(namespace.into()),
        labels: Some(BTreeMap::from([
            ("app.kubernetes.io/part-of".into(), "model-catalog-mcp".into()),
            ("models.saavylab.dev/kind".into(), "recipe".into()),
            (
                "models.saavylab.dev/recipe-id".into(),
                bounded_label_value(&record.recipe.id),
            ),
        ])),
        ..Default::default()
    };
    let patch = Patch::Apply(&recipe);
    let params = PatchParams::apply("model-catalog-mcp").force();
    let applied = api.patch(&name, &params, &patch).await?;
    Ok(applied.metadata.name.unwrap_or(name))
}

pub async fn list_runtime_recipes(
    client: Client,
    namespace: &str,
) -> Result<Vec<RuntimeRecipeRecord>, kube::Error> {
    let api: Api<ModelRecipe> = Api::namespaced(client, namespace);
    let list = api
        .list(&ListParams::default().labels("models.saavylab.dev/kind=recipe"))
        .await?;
    Ok(list.iter().map(|recipe| recipe_spec_to_record(&recipe.spec)).collect())
}

pub async fn get_runtime_recipe(
    client: Client,
    namespace: &str,
    recipe_id: &str,
) -> Result<Option<RuntimeRecipeRecord>, kube::Error> {
    let api: Api<ModelRecipe> = Api::namespaced(client, namespace);
    let name = recipe_resource_name(recipe_id);
    match api.get_opt(&name).await? {
        Some(recipe) => Ok(Some(recipe_spec_to_record(&recipe.spec))),
        None => Ok(None),
    }
}

pub async fn delete_runtime_recipe(
    client: Client,
    namespace: &str,
    recipe_id: &str,
) -> Result<(), kube::Error> {
    let api: Api<ModelRecipe> = Api::namespaced(client, namespace);
    let name = recipe_resource_name(recipe_id);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => Ok(()),
        Err(kube::Error::Api(status)) if status.code == 404 => Ok(()),
        Err(error) => Err(error),
    }
}
```

- [ ] **Step 4: Implement ModelDeployment store functions**

Replace deployment functions with typed CRD logic:

```rust
pub async fn upsert_runtime_deployment(
    client: Client,
    namespace: &str,
    record: &RuntimeDeploymentRecord,
) -> Result<String, kube::Error> {
    let api: Api<ModelDeployment> = Api::namespaced(client.clone(), namespace);
    let name = deployment_resource_name(&record.name);
    let mut deployment = ModelDeployment::new(&name, deployment_record_to_spec(record));
    deployment.metadata = ObjectMeta {
        name: Some(name.clone()),
        namespace: Some(namespace.into()),
        labels: Some(BTreeMap::from([
            ("app.kubernetes.io/part-of".into(), "model-catalog-mcp".into()),
            ("models.saavylab.dev/kind".into(), "deployment".into()),
            (
                "models.saavylab.dev/deployment-name".into(),
                bounded_label_value(&record.name),
            ),
            (
                "models.saavylab.dev/target".into(),
                bounded_label_value(&record.target),
            ),
        ])),
        ..Default::default()
    };
    deployment.status = Some(deployment_record_to_status(record));
    let params = PatchParams::apply("model-catalog-mcp").force();
    let applied = api.patch(&name, &params, &patch).await?;
    Ok(applied.metadata.name.unwrap_or(name))
    update_runtime_deployment_status(
        client,
        namespace,
        &record.name,
        &deployment_record_to_status(record),
    )
    .await?;
}

pub async fn list_runtime_deployments(
    client: Client,
    namespace: &str,
) -> Result<Vec<RuntimeDeploymentRecord>, kube::Error> {
    let api: Api<ModelDeployment> = Api::namespaced(client, namespace);
    let list = api
        .list(&ListParams::default().labels("models.saavylab.dev/kind=deployment"))
        .await?;
    Ok(list
        .iter()
        .map(|deployment| deployment_parts_to_record(&deployment.spec, deployment.status.as_ref()))
        .collect())
}

pub async fn get_runtime_deployment(
    client: Client,
    namespace: &str,
    name: &str,
) -> Result<Option<RuntimeDeploymentRecord>, kube::Error> {
    let api: Api<ModelDeployment> = Api::namespaced(client, namespace);
    let name = deployment_resource_name(name);
    match api.get_opt(&name).await? {
        Some(deployment) => Ok(Some(deployment_parts_to_record(
            &deployment.spec,
            deployment.status.as_ref(),
        ))),
        None => Ok(None),
    }
}
```

- [ ] **Step 5: Add dedicated status patch helper**

Add:

```rust
pub async fn update_runtime_deployment_status(
    client: Client,
    namespace: &str,
    name: &str,
    status: &ModelDeploymentStatus,
) -> Result<(), kube::Error> {
    let api: Api<ModelDeployment> = Api::namespaced(client, namespace);
    let resource_name = deployment_resource_name(name);
    let patch = serde_json::json!({ "status": status });
    api.patch_status(
        &resource_name,
        &PatchParams::default(),
        &Patch::Merge(&patch),
    )
    .await?;
    Ok(())
}
```

- [ ] **Step 6: Export the status helper**

In `crates/homelab-mcp-k8s/src/lib.rs`, export `update_runtime_deployment_status`.

- [ ] **Step 7: Update tests**

Keep existing name/label tests. Replace ConfigMap decode tests with:

```rust
#[test]
fn recipe_resource_name_sanitizes_recipe_ids() {
    assert_eq!(
        recipe_resource_name("deepseek-ai/DeepSeek-V4-Flash"),
        "model-recipe-deepseek-ai-deepseek-v4-flash"
    );
}

#[test]
fn deployment_resource_name_sanitizes_names() {
    assert_eq!(
        deployment_resource_name("lfm25-350m"),
        "model-deployment-lfm25-350m"
    );
}

#[test]
fn bounded_label_value_keeps_values_under_limit() {
    let value = bounded_label_value("deepseek-ai/DeepSeek-V4-Flash-with-a-very-long-suffix-that-exceeds-kubernetes-label-limits");
    assert!(value.len() <= 63);
}
```

- [ ] **Step 8: Validate Task 2**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p homelab-mcp-k8s runtime_store::tests
cargo test -p model-catalog-mcp
cargo fmt --all -- --check
cargo clippy -p homelab-mcp-k8s --all-targets -- -D warnings
```

Expected: all pass.

- [ ] **Step 9: Commit Task 2**

```bash
git status
git add crates/homelab-mcp-k8s/src/runtime_store.rs crates/homelab-mcp-k8s/src/lib.rs
git diff --cached
git commit -m "feat: store model runtime state in CRDs"
```

---

## Task 3: Add KServe Status Reconciler

**Files:**

- Create: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/reconciler.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/lib.rs`

- [ ] **Step 1: Create KServe condition mapping**

Create `reconciler.rs`:

```rust
use std::time::Duration;

use k8s_openapi::apimachinery::pkg::apis::meta::v1::Condition;
use kube::{
    Api, Client,
    api::{ApiResource, DynamicObject, GroupVersionKind, ListParams},
};
use model_catalog::{DeploymentState, ModelDeployment, ModelDeploymentStatus};

use crate::runtime_store::update_runtime_deployment_status;

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn status_from_kserve_conditions(
    existing: Option<&ModelDeploymentStatus>,
    observed_generation: Option<i64>,
    conditions: &[Condition],
    url: Option<String>,
) -> ModelDeploymentStatus {
    let ready = conditions.iter().find(|condition| condition.type_ == "Ready");
    let mut next = existing.cloned().unwrap_or_default();
    next.observed_generation = observed_generation;
    next.url = url;

    match ready.map(|condition| condition.status.as_str()) {
        Some("True") => {
            next.state = DeploymentState::Ready;
            next.kserve_ready = true;
            next.failure_reason = None;
        }
        Some("False") => {
            next.state = DeploymentState::Failed;
            next.kserve_ready = false;
            next.failure_reason = ready.and_then(|condition| {
                condition
                    .message
                    .clone()
                    .or_else(|| condition.reason.clone())
            });
        }
        _ => {
            next.state = DeploymentState::Applying;
            next.kserve_ready = false;
        }
    }

    if existing.map(|status| &status.state) != Some(&next.state) {
        next.last_transition_time = Some(now_rfc3339());
    }
    next
}

pub fn missing_inferenceservice_status(
    existing: Option<&ModelDeploymentStatus>,
    observed_generation: Option<i64>,
) -> ModelDeploymentStatus {
    let mut next = existing.cloned().unwrap_or_default();
    next.state = DeploymentState::Failed;
    next.kserve_ready = false;
    next.observed_generation = observed_generation;
    next.failure_reason = Some("KServe InferenceService not found".into());
    if existing.map(|status| &status.state) != Some(&DeploymentState::Failed) {
        next.last_transition_time = Some(now_rfc3339());
    }
    next
}
```

- [ ] **Step 2: Add dynamic KServe helpers**

Add to `reconciler.rs`:

```rust
fn inferenceservice_api(client: Client, namespace: &str) -> Api<DynamicObject> {
    let gvk = GroupVersionKind::gvk("serving.kserve.io", "v1beta1", "InferenceService");
    let ar = ApiResource::from_gvk(&gvk);
    Api::namespaced_with(client, namespace, &ar)
}

fn dynamic_conditions(object: &DynamicObject) -> Vec<Condition> {
    object
        .data
        .get("status")
        .and_then(|status| status.get("conditions"))
        .and_then(|conditions| serde_json::from_value(conditions.clone()).ok())
        .unwrap_or_default()
}

fn dynamic_url(object: &DynamicObject) -> Option<String> {
    object
        .data
        .get("status")
        .and_then(|status| status.get("url"))
        .and_then(|url| url.as_str())
        .map(str::to_string)
}
```

- [ ] **Step 3: Implement one-shot reconciliation**

Add:

```rust
pub async fn reconcile_model_deployments_once(
    client: Client,
    state_namespace: &str,
) -> Result<(), kube::Error> {
    let deployments: Api<ModelDeployment> = Api::namespaced(client.clone(), state_namespace);
    let list = deployments
        .list(&ListParams::default().labels("models.saavylab.dev/kind=deployment"))
        .await?;

    for deployment in list {
        if deployment
            .status
            .as_ref()
            .map(|status| status.state == DeploymentState::Stopped)
            .unwrap_or(false)
        {
            continue;
        }

        let isvc_api = inferenceservice_api(client.clone(), &deployment.spec.namespace);
        let observed_generation = deployment.metadata.generation;
        let next_status = match isvc_api.get_opt(&deployment.spec.name).await? {
            Some(isvc) => status_from_kserve_conditions(
                deployment.status.as_ref(),
                observed_generation,
                &dynamic_conditions(&isvc),
                dynamic_url(&isvc),
            ),
            None => missing_inferenceservice_status(deployment.status.as_ref(), observed_generation),
        };

        update_runtime_deployment_status(
            client.clone(),
            state_namespace,
            &deployment.spec.name,
            &next_status,
        )
        .await?;
    }

    Ok(())
}
```

- [ ] **Step 4: Implement background loop**

Add:

```rust
pub async fn run_model_deployment_reconciler(
    client: Client,
    state_namespace: String,
    interval: Duration,
) {
    let mut ticker = tokio::time::interval(interval);
    loop {
        ticker.tick().await;
        if let Err(error) = reconcile_model_deployments_once(client.clone(), &state_namespace).await {
            tracing::warn!(%error, %state_namespace, "model deployment reconciliation failed");
        }
    }
}
```

- [ ] **Step 5: Export reconciler**

In `crates/homelab-mcp-k8s/src/lib.rs`, add:

```rust
pub mod reconciler;
pub use reconciler::{reconcile_model_deployments_once, run_model_deployment_reconciler};
```

- [ ] **Step 6: Add mapping tests**

Add tests in `reconciler.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn condition(status: &str, message: Option<&str>) -> Condition {
        Condition {
            type_: "Ready".into(),
            status: status.into(),
            message: message.map(str::to_string),
            reason: None,
            last_transition_time: Default::default(),
            observed_generation: None,
        }
    }

    #[test]
    fn ready_true_maps_to_ready() {
        let status = status_from_kserve_conditions(None, Some(7), &[condition("True", None)], Some("http://model".into()));
        assert_eq!(status.state, DeploymentState::Ready);
        assert!(status.kserve_ready);
        assert_eq!(status.observed_generation, Some(7));
        assert_eq!(status.url, Some("http://model".into()));
    }

    #[test]
    fn ready_false_maps_to_failed_with_reason() {
        let status = status_from_kserve_conditions(None, Some(7), &[condition("False", Some("Image pull failed"))], None);
        assert_eq!(status.state, DeploymentState::Failed);
        assert!(!status.kserve_ready);
        assert_eq!(status.failure_reason, Some("Image pull failed".into()));
    }

    #[test]
    fn missing_ready_condition_maps_to_applying() {
        let status = status_from_kserve_conditions(None, Some(7), &[], None);
        assert_eq!(status.state, DeploymentState::Applying);
        assert!(!status.kserve_ready);
    }

    #[test]
    fn missing_inferenceservice_maps_to_failed() {
        let status = missing_inferenceservice_status(None, Some(7));
        assert_eq!(status.state, DeploymentState::Failed);
        assert_eq!(
            status.failure_reason,
            Some("KServe InferenceService not found".into())
        );
    }
}
```

Adapt the `Condition` fixture if the exact k8s-openapi fields differ.

- [ ] **Step 7: Validate Task 3**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p homelab-mcp-k8s reconciler::tests
cargo fmt --all -- --check
cargo clippy -p homelab-mcp-k8s --all-targets -- -D warnings
```

Expected: all pass.

- [ ] **Step 8: Commit Task 3**

```bash
git status
git add crates/homelab-mcp-k8s/src/reconciler.rs crates/homelab-mcp-k8s/src/lib.rs
git diff --cached
git commit -m "feat: reconcile model deployment readiness"
```

---

## Task 4: Wire MCP Server to CRD Reconciler and Status Store

**Files:**

- Modify: `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/src/main.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/src/tools.rs`

- [ ] **Step 1: Update MCP instructions**

In `main.rs`, replace the tool-handler instructions sentence that says recipes require editing the ConfigMap with:

```rust
instructions = "Imperative model deployer for the Superbloom homelab. \
    Workflow: search_recipes → plan_deploy → ensure_weights → deploy_model → list_deployments. \
    Stable recipes are loaded from mounted YAML files. Runtime recipes and deployments are \
    stored as models.saavylab.dev CRDs and managed through typed MCP tools. \
    Recipe env vars must be {name, value} objects, not KEY=VALUE strings."
```

- [ ] **Step 2: Start reconciler at server startup**

In `main.rs`, after reading `runtime_state_namespace`, create a Kubernetes client and spawn the loop:

```rust
let reconciler_namespace = runtime_state_namespace.clone();
match homelab_mcp_k8s::k8s_client().await {
    Ok(client) => {
        tokio::spawn(homelab_mcp_k8s::run_model_deployment_reconciler(
            client,
            reconciler_namespace,
            std::time::Duration::from_secs(15),
        ));
    }
    Err(error) => {
        tracing::warn!(%error, "model deployment reconciler disabled: Kubernetes client unavailable");
    }
}
```

This must not prevent local tests or local server startup without Kubernetes.

- [ ] **Step 3: Update stop_model to patch status directly**

If Task 2 added `update_runtime_deployment_status`, replace the current read-modify-upsert in `stop_model` with a status patch:

```rust
let status = model_catalog::ModelDeploymentStatus {
    state: model_catalog::DeploymentState::Stopped,
    observed_generation: None,
    last_transition_time: Some(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)),
    failure_reason: None,
    kserve_ready: false,
    url: None,
};
let client = homelab_mcp_k8s::k8s_client()
    .await
    .map_err(|error| error.to_string())?;
match homelab_mcp_k8s::update_runtime_deployment_status(
    client,
    &self.runtime_state_namespace,
    &params.name,
    &status,
)
.await
{
    Ok(()) => {}
    Err(kube::Error::Api(status)) if status.code == 404 => {}
    Err(error) => return Err(error.to_string()),
}
```

Keep KServe delete first and keep KServe 404 idempotent through `delete_inferenceservice`.

- [ ] **Step 4: Validate MCP tests**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p model-catalog-mcp
cargo fmt --all -- --check
cargo clippy -p model-catalog-mcp --all-targets -- -D warnings
```

Expected: all pass. Local tests must not require installed CRDs.

- [ ] **Step 5: Commit Task 4**

```bash
git status
git add servers/model-catalog-mcp/src/main.rs servers/model-catalog-mcp/src/tools.rs
git diff --cached
git commit -m "feat: run model deployment reconciler"
```

---

## Task 5: Generate and Install CRD Manifests

**Files:**

- Create: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/examples/print_crds.rs`
- Create: `/home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources/modelrecipes-crd.yaml`
- Create: `/home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources/modeldeployments-crd.yaml`
- Modify: `/home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources/kustomization.yaml`
- Modify: `/home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources/rbac.yaml`

- [ ] **Step 1: Add CRD generation example**

Create `crates/model-catalog/examples/print_crds.rs`:

```rust
use kube::CustomResourceExt;
use model_catalog::{ModelDeployment, ModelRecipe};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("{}", serde_yaml::to_string(&ModelRecipe::crd())?);
    println!("---");
    println!("{}", serde_yaml::to_string(&ModelDeployment::crd())?);
    Ok(())
}
```

- [ ] **Step 2: Generate CRD YAML**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo run -p model-catalog --example print_crds > /tmp/model-catalog-crds.yaml
```

Split `/tmp/model-catalog-crds.yaml` into two files in `sb`:

- `modelrecipes-crd.yaml`: first document, `metadata.name: modelrecipes.models.saavylab.dev`
- `modeldeployments-crd.yaml`: second document, `metadata.name: modeldeployments.models.saavylab.dev`

Do not edit schemas by hand except to remove generation comments if present.

- [ ] **Step 3: Add CRDs to kustomization**

In `sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources/kustomization.yaml`, add CRDs before the deployment:

```yaml
resources:
  - modelrecipes-crd.yaml
  - modeldeployments-crd.yaml
  - configmap.yaml
  - spark-arena-recipes.yaml
  - rbac.yaml
  - deployment.yaml
  - service.yaml
```

- [ ] **Step 4: Update RBAC from ConfigMaps to CRDs**

In `rbac.yaml`, remove the runtime ConfigMap CRUD rule:

```yaml
# ConfigMaps (runtime recipe/deployment ConfigMaps)
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list", "watch", "create", "patch", "update", "delete"]
```

Add:

```yaml
  # Model Catalog runtime CRDs
  - apiGroups: ["models.saavylab.dev"]
    resources: ["modelrecipes"]
    verbs: ["get", "list", "watch", "create", "patch", "update", "delete"]
  - apiGroups: ["models.saavylab.dev"]
    resources: ["modeldeployments"]
    verbs: ["get", "list", "watch", "create", "patch", "update", "delete"]
  - apiGroups: ["models.saavylab.dev"]
    resources: ["modeldeployments/status"]
    verbs: ["get", "patch", "update"]
```

Keep the existing KServe, jobs, pods/log/events, secrets, and nodes rules.

- [ ] **Step 5: Validate manifests**

Run:

```bash
cd /home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources
kubectl kustomize .
kubectl apply --dry-run=server -k .
```

Expected:

- Render includes `CustomResourceDefinition/modelrecipes.models.saavylab.dev`.
- Render includes `CustomResourceDefinition/modeldeployments.models.saavylab.dev`.
- Server dry-run succeeds.

- [ ] **Step 6: Validate Rust example**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo run -p model-catalog --example print_crds >/tmp/model-catalog-crds-check.yaml
cargo fmt --all -- --check
cargo clippy -p model-catalog --all-targets -- -D warnings
```

Expected: all pass.

- [ ] **Step 7: Commit Task 5 in homelab-mcp**

```bash
cd /home/saavy/dev/homelab/homelab-mcp
git status
git add crates/model-catalog/examples/print_crds.rs
git diff --cached
git commit -m "chore: add model catalog CRD generator"
```

- [ ] **Step 8: Commit Task 5 in sb**

```bash
cd /home/saavy/dev/homelab/sb
git status
git add \
  argocd/clusters/superbloom/infra/model-catalog-mcp/resources/modelrecipes-crd.yaml \
  argocd/clusters/superbloom/infra/model-catalog-mcp/resources/modeldeployments-crd.yaml \
  argocd/clusters/superbloom/infra/model-catalog-mcp/resources/kustomization.yaml \
  argocd/clusters/superbloom/infra/model-catalog-mcp/resources/rbac.yaml
git diff --cached
git commit -m "feat: install model catalog runtime CRDs"
```

---

## Task 6: End-to-End Validation and Cutover Smoke Test

**Files:**

- No source edits unless validation fails.

- [ ] **Step 1: Run full Rust validators**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --all-targets -- -D warnings
cargo build --release -p model-catalog-mcp
```

Expected: all pass.

- [ ] **Step 2: Run manifest validation**

Run:

```bash
cd /home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources
kubectl kustomize .
kubectl apply --dry-run=server -k .
```

Expected: CRDs, RBAC, deployment, service, and ConfigMaps validate server-side.

- [ ] **Step 3: Check CRD installation readiness after GitOps sync**

After the CRD manifest commit is deployed by Argo CD, run:

```bash
kubectl get crd modelrecipes.models.saavylab.dev
kubectl get crd modeldeployments.models.saavylab.dev
kubectl auth can-i create modelrecipes.models.saavylab.dev --as=system:serviceaccount:hermes:model-catalog-mcp -n hermes
kubectl auth can-i patch modeldeployments.models.saavylab.dev/status --as=system:serviceaccount:hermes:model-catalog-mcp -n hermes
```

Expected:

- Both CRDs exist.
- ServiceAccount can create `modelrecipes`.
- ServiceAccount can patch `modeldeployments/status`.

- [ ] **Step 4: Smoke test runtime CRD tools**

Use Hermes or an MCP client to call:

```text
search_spark_arena_recipes({"query":"lfm"})
import_spark_arena_recipe({"id":"lfm25-350m","created_by":"hermes-smoke-test"})
search_recipes({"query":"lfm"})
capacity_report({"target":"spark"})
estimate_fit({"recipe_id":"lfm25-350m","target":"spark"})
deploy_model({"recipe_id":"lfm25-350m","target":"spark","name":"lfm25-350m","namespace":"ai","runtime_args":["--max-model-len","8192"]})
list_deployments({})
```

Expected:

- Spark Arena search returns `lfm25-350m`.
- Import creates `ModelRecipe/lfm25-350m` in `hermes`.
- Merged recipe search sees the imported runtime recipe.
- Capacity report returns Spark node readiness.
- Estimate fit returns a fit verdict and risks.
- Deploy creates KServe `InferenceService/lfm25-350m` in `ai`.
- `list_deployments` returns `lfm25-350m` with `status: applying` initially.

- [ ] **Step 5: Verify reconciler transitions status**

Run:

```bash
kubectl get modeldeployments -n hermes
kubectl get modeldeployment model-deployment-lfm25-350m -n hermes -o yaml
kubectl get inferenceservice lfm25-350m -n ai -o yaml
```

Expected:

- `ModelDeployment.status.state` eventually becomes `ready` if KServe reports `Ready=True`.
- If KServe fails, `ModelDeployment.status.state` becomes `failed` with `failureReason`.
- `observedGeneration` is set.
- `lastTransitionTime` is set after the state changes.

- [ ] **Step 6: Stop smoke deployment**

Run MCP:

```text
stop_model({"namespace":"ai","name":"lfm25-350m"})
list_deployments({})
```

Expected:

- KServe `InferenceService/lfm25-350m` is deleted or absent.
- `ModelDeployment.status.state` becomes `stopped`.
- `list_deployments` reports stopped.

- [ ] **Step 7: Commit validation fixes only if needed**

If validation required source changes:

```bash
git status
git add <changed-files>
git diff --cached
git commit -m "fix: stabilize model catalog CRD runtime state"
```

Expected: no unrelated files staged.

---

## Self-Review

- Spec coverage:
  - CRD scope, group, names, big-bang cutover: Tasks 1, 2, 5.
  - Runtime recipes and deployments as CRDs: Tasks 1 and 2.
  - KServe-status reconciler: Tasks 3 and 4.
  - CRD manifests and RBAC in `sb`: Task 5.
  - End-to-end smoke test: Task 6.
- Placeholder scan:
  - No `TBD`, `TODO`, or unspecified implementation steps remain.
  - Every task includes concrete file paths, commands, and expected outcomes.
- Type consistency:
  - `ModelRecipe`, `ModelDeployment`, `ModelDeploymentStatus`, `RuntimeRecipeRecord`, and `RuntimeDeploymentRecord` names match the approved spec.
  - Store function names preserve the existing MCP-facing integration points.
  - Status values reuse existing `DeploymentState`.
