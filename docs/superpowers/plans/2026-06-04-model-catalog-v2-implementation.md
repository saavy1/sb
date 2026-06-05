# Model Catalog v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build model-catalog into Hermes' bounded runtime control plane for model search, import, capacity-aware planning, and policy-bounded deployment without PRs for normal model experiments.

**Architecture:** Keep GitOps for stable infrastructure and move mutable model state into Kubernetes-backed runtime objects controlled by `model-catalog-mcp`. Hermes interacts only through typed MCP tools; `model-catalog` validates policy, estimates capacity, renders KServe resources, records runtime state, and refuses arbitrary manifests.

**Tech Stack:** Rust 2024, `rmcp`, `kube`, `k8s-openapi`, `serde`, `schemars`, `serde_yaml`, KServe InferenceService dynamic objects, Kubernetes ConfigMaps for v1 runtime state, Prometheus HTTP API for metrics, Argo CD manifests in `sb`.

---

## Starting Context

Repositories:

- App code: `/home/saavy/dev/homelab/homelab-mcp`
- Deployment/config: `/home/saavy/dev/homelab/sb`
- Approved spec: `/home/saavy/dev/homelab/sb/docs/superpowers/specs/2026-06-04-model-catalog-v2-design.md`

Important current behavior:

- `servers/model-catalog-mcp` currently loads YAML recipes from `MODEL_CATALOG_RECIPE_DIR`.
- `plan_deploy` creates a `DeploymentPlan`.
- `apply_plan` creates a KServe `InferenceService`.
- Runtime args/env plumbing has local in-progress changes in `homelab-mcp`; Task 1 finishes and commits that work.
- Do not give Hermes raw manifest apply for model operations.

Execution rule:

- Commit after every task.
- Before every commit, run `git diff --cached`, `git status`, and inspect for secrets.
- Do not stage unrelated local changes from prior work unless that task explicitly owns them.

---

## File Structure

### `homelab-mcp`

Modify:

- `Cargo.toml` — add workspace dependencies used by capacity metrics.
- `crates/model-catalog/src/types.rs` — add deployment overrides, runtime profiles, capacity types, runtime state types.
- `crates/model-catalog/src/planner.rs` — merge runtime overrides and policy validation.
- `crates/model-catalog/src/render.rs` — render args/env/resources/tolerations from plans.
- `crates/model-catalog/src/lib.rs` — export new modules/types.
- `crates/model-catalog/src/profile.rs` — add runtime profile defaults and allowed model roots.
- `crates/model-catalog/src/recipe.rs` — keep local recipe parsing/search; merge runtime recipe sources at MCP layer.
- `crates/homelab-mcp-k8s/src/live.rs` — add delete/list/dry-run InferenceService helpers.
- `crates/homelab-mcp-k8s/src/lib.rs` — export new helpers.
- `servers/model-catalog-mcp/src/main.rs` — add env vars for runtime namespace, Spark Arena dir, Prometheus URL.
- `servers/model-catalog-mcp/src/tools.rs` — add runtime recipe, capacity, deploy, stop, list, and policy tools.

Create:

- `crates/model-catalog/src/policy.rs` — pure policy validation.
- `crates/model-catalog/src/state.rs` — runtime state structs.
- `crates/model-catalog/src/arena.rs` — Spark Arena recipe directory search/import normalization.
- `crates/model-catalog/src/capacity.rs` — capacity report structs and fit estimation.
- `crates/homelab-mcp-k8s/src/runtime_store.rs` — ConfigMap-backed runtime recipe/deployment store.
- `crates/homelab-mcp-k8s/src/capacity.rs` — Kubernetes and Prometheus capacity collection.

### `sb`

Modify:

- `argocd/clusters/superbloom/infra/model-catalog-mcp/resources/deployment.yaml` — add env vars and mounts.
- `argocd/clusters/superbloom/infra/model-catalog-mcp/resources/rbac.yaml` — allow ConfigMaps, nodes, pods, and InferenceService delete/patch.
- `argocd/clusters/superbloom/infra/model-catalog-mcp/resources/configmap.yaml` — keep baseline recipes; do not make this the only source of truth.

Create:

- `argocd/clusters/superbloom/infra/model-catalog-mcp/resources/spark-arena-recipes.yaml` — initial Spark Arena seed ConfigMap if no external cache exists yet.

---

## Task 1: Stabilize runtime overrides and KServe rendering

**Files:**

- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/types.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/planner.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/render.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/src/tools.rs`
- Test: existing tests in `crates/model-catalog/src/planner.rs`, `crates/model-catalog/src/render.rs`, `servers/model-catalog-mcp/src/tools.rs`

- [ ] **Step 1: Inspect current local changes**

Run:

```bash
git -C /home/saavy/dev/homelab/homelab-mcp status --short
git -C /home/saavy/dev/homelab/homelab-mcp diff -- crates/model-catalog/src/types.rs crates/model-catalog/src/planner.rs crates/model-catalog/src/render.rs servers/model-catalog-mcp/src/tools.rs
```

Expected: local changes already include some runtime image/args/env plumbing. Keep useful work; do not discard it.

- [ ] **Step 2: Add/confirm override fields in `DeployOverrides`**

In `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/planner.rs`, make `DeployOverrides` exactly:

```rust
#[derive(Clone, Debug, PartialEq)]
pub struct DeployOverrides {
    pub name: Option<String>,
    pub namespace: Option<String>,
    pub replicas: Option<u32>,
    pub runtime_args: Vec<String>,
    pub runtime_env: Vec<EnvVar>,
    pub env_overrides: Vec<EnvVar>,
    pub resource_requests: Option<ResourceRequests>,
    pub readiness_timeout_seconds: Option<u32>,
}

impl DeployOverrides {
    pub fn empty() -> Self {
        Self {
            name: None,
            namespace: None,
            replicas: None,
            runtime_args: Vec::new(),
            runtime_env: Vec::new(),
            env_overrides: Vec::new(),
            resource_requests: None,
            readiness_timeout_seconds: None,
        }
    }
}
```

- [ ] **Step 3: Add readiness timeout to `DeploymentPlan`**

In `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/types.rs`, add this field to `DeploymentPlan`:

```rust
pub readiness_timeout_seconds: u32,
```

Place it after `resource_requests`.

- [ ] **Step 4: Merge runtime args/env/resource overrides in `plan_deploy`**

In `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/planner.rs`, add helper functions above `plan_deploy`:

```rust
fn merge_args(default_args: &[String], override_args: &[String]) -> Vec<String> {
    let mut merged = default_args.to_vec();
    for arg in override_args {
        if !merged.contains(arg) {
            merged.push(arg.clone());
        }
    }
    merged
}

fn merge_env(default_env: &[EnvVar], override_env: &[EnvVar]) -> Vec<EnvVar> {
    let mut merged = default_env.to_vec();
    for item in override_env {
        merged.retain(|existing| existing.name != item.name);
        merged.push(item.clone());
    }
    merged
}
```

Then set these fields in `DeploymentPlan`:

```rust
runtime_args: merge_args(&recipe.runtime.args, &overrides.runtime_args),
runtime_env: merge_env(&recipe.runtime.env, &overrides.runtime_env),
env_overrides: overrides.env_overrides,
resource_requests: overrides.resource_requests.unwrap_or(ResourceRequests {
    cpu: "2".into(),
    memory: "16Gi".into(),
    gpu_count: recipe.hardware.gpu_count,
}),
readiness_timeout_seconds: overrides.readiness_timeout_seconds.unwrap_or(900),
```

- [ ] **Step 5: Update all existing `DeployOverrides` literals**

Replace existing literals like:

```rust
DeployOverrides {
    name,
    namespace,
    replicas: None,
    env_overrides: Vec::new(),
}
```

with:

```rust
DeployOverrides {
    name,
    namespace,
    replicas: None,
    runtime_args: Vec::new(),
    runtime_env: Vec::new(),
    env_overrides: Vec::new(),
    resource_requests: None,
    readiness_timeout_seconds: None,
}
```

Use `DeployOverrides::empty()` in tests where no override is needed.

- [ ] **Step 6: Add planner tests for runtime overrides**

Append these tests to the `#[cfg(test)]` module in `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/planner.rs`:

```rust
#[test]
fn plan_deploy_merges_runtime_args_and_env_overrides() {
    let recipe = parse_recipe_yaml(include_str!(
        "../tests/fixtures/local-recipes/deepseek-v4-flash.yaml"
    ))
    .expect("recipe parses");
    let result = plan_deploy(
        &recipe,
        &ClusterProfile::superbloom_default(),
        DeployOverrides {
            name: None,
            namespace: None,
            replicas: None,
            runtime_args: vec![
                "--kv-cache-dtype".into(),
                "fp8".into(),
                "--tool-call-parser".into(),
                "hermes".into(),
            ],
            runtime_env: vec![EnvVar {
                name: "VLLM_TEST".into(),
                value: "enabled".into(),
            }],
            env_overrides: Vec::new(),
            resource_requests: Some(ResourceRequests {
                cpu: "4".into(),
                memory: "32Gi".into(),
                gpu_count: 1,
            }),
            readiness_timeout_seconds: Some(1200),
        },
    );

    assert!(result.data.runtime_args.contains(&"--kv-cache-dtype".into()));
    assert!(result.data.runtime_args.contains(&"fp8".into()));
    assert!(result
        .data
        .runtime_env
        .iter()
        .any(|item| item.name == "VLLM_TEST" && item.value == "enabled"));
    assert_eq!(result.data.resource_requests.memory, "32Gi");
    assert_eq!(result.data.readiness_timeout_seconds, 1200);
}
```

- [ ] **Step 7: Render GPU taints with value `true` and both effects**

In `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/render.rs`, replace the `tolerations` array with:

```rust
"tolerations": [
    {
        "key": "nvidia.com/gpu",
        "operator": "Equal",
        "value": "true",
        "effect": "NoSchedule"
    },
    {
        "key": "nvidia.com/gpu",
        "operator": "Equal",
        "value": "true",
        "effect": "NoExecute"
    }
],
```

- [ ] **Step 8: Add render tests for DS4 args and GPU tolerations**

Append these tests to `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/render.rs`:

```rust
#[test]
fn renders_runtime_args_from_plan() {
    let recipe = parse_recipe_yaml(include_str!(
        "../tests/fixtures/local-recipes/deepseek-v4-flash.yaml"
    ))
    .expect("recipe parses");
    let plan = plan_deploy(
        &recipe,
        &ClusterProfile::superbloom_default(),
        DeployOverrides {
            runtime_args: vec!["--kv-cache-dtype".into(), "fp8".into()],
            ..DeployOverrides::empty()
        },
    )
    .data;

    let value = render_kserve_value(&plan);
    let args = value["spec"]["predictor"]["containers"][0]["args"]
        .as_array()
        .expect("args array");

    assert!(args.iter().any(|arg| arg == "--kv-cache-dtype"));
    assert!(args.iter().any(|arg| arg == "fp8"));
}

#[test]
fn renders_gpu_tolerations_with_required_value() {
    let recipe = parse_recipe_yaml(include_str!(
        "../tests/fixtures/local-recipes/qwen3-8b.yaml"
    ))
    .expect("recipe parses");
    let plan = plan_deploy(
        &recipe,
        &ClusterProfile::superbloom_default(),
        DeployOverrides::empty(),
    )
    .data;
    let value = render_kserve_value(&plan);
    let tolerations = value["spec"]["predictor"]["tolerations"]
        .as_array()
        .expect("tolerations array");

    assert!(tolerations.iter().any(|tol| {
        tol["key"] == "nvidia.com/gpu"
            && tol["operator"] == "Equal"
            && tol["value"] == "true"
            && tol["effect"] == "NoSchedule"
    }));
    assert!(tolerations.iter().any(|tol| {
        tol["key"] == "nvidia.com/gpu"
            && tol["operator"] == "Equal"
            && tol["value"] == "true"
            && tol["effect"] == "NoExecute"
    }));
}
```

- [ ] **Step 9: Add runtime overrides to MCP plan/apply params**

In `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/src/tools.rs`, update `PlanDeployParams`, `EnsureWeightsParams`, and `ApplyPlanParams`:

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PlanDeployParams {
    pub recipe_id: String,
    pub name: Option<String>,
    pub namespace: Option<String>,
    pub runtime_args: Option<Vec<String>>,
    pub runtime_env: Option<Vec<model_catalog::EnvVar>>,
    pub env_overrides: Option<Vec<model_catalog::EnvVar>>,
    pub cpu: Option<String>,
    pub memory: Option<String>,
    pub gpu_count: Option<u32>,
    pub readiness_timeout_seconds: Option<u32>,
}
```

Use the same additional optional fields in `EnsureWeightsParams` and `ApplyPlanParams`.

- [ ] **Step 10: Add a helper to build overrides from MCP params**

In `tools.rs`, add:

```rust
fn resource_requests_from_params(
    cpu: Option<String>,
    memory: Option<String>,
    gpu_count: Option<u32>,
) -> Option<model_catalog::ResourceRequests> {
    match (cpu, memory, gpu_count) {
        (None, None, None) => None,
        (cpu, memory, gpu_count) => Some(model_catalog::ResourceRequests {
            cpu: cpu.unwrap_or_else(|| "2".into()),
            memory: memory.unwrap_or_else(|| "16Gi".into()),
            gpu_count: gpu_count.unwrap_or(1),
        }),
    }
}
```

Then use `DeployOverrides` with all new fields in `plan_deploy`, `ensure_weights`, `apply_plan`, and `derive_plan`.

- [ ] **Step 11: Run focused tests**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p model-catalog planner::tests::plan_deploy_merges_runtime_args_and_env_overrides
cargo test -p model-catalog render::tests::renders_runtime_args_from_plan
cargo test -p model-catalog render::tests::renders_gpu_tolerations_with_required_value
```

Expected: all three pass.

- [ ] **Step 12: Update snapshots**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
INSTA_UPDATE=always cargo test -p model-catalog render::tests::snapshot_qwen3_8b_inferenceservice render::tests::snapshot_deepseek_v4_flash_inferenceservice
```

Expected: snapshots update to include `Equal` GPU tolerations and runtime args.

- [ ] **Step 13: Run validators**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo fmt --all -- --check
cargo test -p model-catalog -p model-catalog-mcp
cargo clippy --all-targets -- -D warnings
```

Expected: all pass.

- [ ] **Step 14: Commit Task 1**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
git status
git diff --cached
git add crates/model-catalog/src/types.rs crates/model-catalog/src/planner.rs crates/model-catalog/src/render.rs crates/model-catalog/src/snapshots servers/model-catalog-mcp/src/tools.rs
git diff --cached
git commit -m "fix: plumb runtime overrides into model deployments"
```

Expected: one commit with runtime args/env/resources/toleration fixes.

---

## Task 2: Add pure policy validation

**Files:**

- Create: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/policy.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/lib.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/planner.rs`

- [ ] **Step 1: Create `policy.rs` with actionable validators**

Create `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/policy.rs`:

```rust
use homelab_mcp_core::ValidationIssue;

use crate::{ClusterProfile, DeploymentPlan, Recipe};

pub fn validate_plan_policy(
    recipe: &Recipe,
    profile: &ClusterProfile,
    plan: &DeploymentPlan,
) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    if enables_auto_tool_choice(plan) && !has_tool_call_parser(plan) {
        issues.push(ValidationIssue {
            field: "runtime.args".into(),
            message: "--enable-auto-tool-choice requires --tool-call-parser".into(),
            allowed: Some("--tool-call-parser hermes or --tool-call-parser=hermes".into()),
        });
    }

    if recipe.model.id.eq_ignore_ascii_case("deepseek-ai/DeepSeek-V4-Flash")
        && !has_kv_cache_dtype_fp8(plan)
    {
        issues.push(ValidationIssue {
            field: "runtime.args".into(),
            message: "DeepSeek V4 Flash requires fp8 KV cache on the current vLLM runtime".into(),
            allowed: Some("--kv-cache-dtype fp8 or --kv-cache-dtype=fp8".into()),
        });
    }

    if plan.resource_requests.gpu_count > profile.max_gpu_per_pod {
        issues.push(ValidationIssue {
            field: "resources.gpu_count".into(),
            message: format!(
                "deployment requests {} GPUs, profile permits {} per pod",
                plan.resource_requests.gpu_count, profile.max_gpu_per_pod
            ),
            allowed: Some(format!("0..={}", profile.max_gpu_per_pod)),
        });
    }

    let allowed_root = &profile.model_storage.gpu_node_path;
    if !plan.model_path.starts_with(allowed_root) {
        issues.push(ValidationIssue {
            field: "model_path".into(),
            message: format!("model path {} is outside approved root", plan.model_path),
            allowed: Some(allowed_root.clone()),
        });
    }

    issues
}

fn enables_auto_tool_choice(plan: &DeploymentPlan) -> bool {
    plan.runtime_args
        .iter()
        .any(|arg| arg == "--enable-auto-tool-choice")
}

fn has_tool_call_parser(plan: &DeploymentPlan) -> bool {
    has_arg_value(&plan.runtime_args, "--tool-call-parser", "hermes")
        || plan.runtime_args
            .iter()
            .any(|arg| arg.starts_with("--tool-call-parser="))
}

fn has_kv_cache_dtype_fp8(plan: &DeploymentPlan) -> bool {
    has_arg_value(&plan.runtime_args, "--kv-cache-dtype", "fp8")
        || plan
            .runtime_args
            .iter()
            .any(|arg| arg == "--kv-cache-dtype=fp8")
}

fn has_arg_value(args: &[String], flag: &str, value: &str) -> bool {
    args.windows(2)
        .any(|window| window[0] == flag && window[1] == value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ClusterProfile, DeployOverrides, parse_recipe_yaml, plan_deploy};

    #[test]
    fn rejects_auto_tool_choice_without_parser() {
        let recipe = parse_recipe_yaml(include_str!(
            "../tests/fixtures/local-recipes/deepseek-v4-flash.yaml"
        ))
        .expect("recipe parses");
        let mut plan = plan_deploy(
            &recipe,
            &ClusterProfile::superbloom_default(),
            DeployOverrides::empty(),
        )
        .data;
        plan.runtime_args = vec!["--enable-auto-tool-choice".into(), "--kv-cache-dtype=fp8".into()];

        let issues = validate_plan_policy(&recipe, &ClusterProfile::superbloom_default(), &plan);

        assert!(issues.iter().any(|issue| {
            issue.field == "runtime.args"
                && issue.message.contains("requires --tool-call-parser")
        }));
    }

    #[test]
    fn rejects_deepseek_without_fp8_kv_cache() {
        let recipe = parse_recipe_yaml(include_str!(
            "../tests/fixtures/local-recipes/deepseek-v4-flash.yaml"
        ))
        .expect("recipe parses");
        let mut plan = plan_deploy(
            &recipe,
            &ClusterProfile::superbloom_default(),
            DeployOverrides::empty(),
        )
        .data;
        plan.runtime_args = vec!["--tool-call-parser=hermes".into()];

        let issues = validate_plan_policy(&recipe, &ClusterProfile::superbloom_default(), &plan);

        assert!(issues.iter().any(|issue| {
            issue.field == "runtime.args" && issue.message.contains("requires fp8 KV cache")
        }));
    }

    #[test]
    fn accepts_deepseek_with_fp8_and_parser() {
        let recipe = parse_recipe_yaml(include_str!(
            "../tests/fixtures/local-recipes/deepseek-v4-flash.yaml"
        ))
        .expect("recipe parses");
        let mut plan = plan_deploy(
            &recipe,
            &ClusterProfile::superbloom_default(),
            DeployOverrides::empty(),
        )
        .data;
        plan.runtime_args = vec![
            "--enable-auto-tool-choice".into(),
            "--tool-call-parser".into(),
            "hermes".into(),
            "--kv-cache-dtype".into(),
            "fp8".into(),
        ];

        let issues = validate_plan_policy(&recipe, &ClusterProfile::superbloom_default(), &plan);

        assert!(issues.is_empty());
    }
}
```

- [ ] **Step 2: Export policy validator**

In `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/lib.rs`, add:

```rust
pub mod policy;
pub use policy::validate_plan_policy;
```

- [ ] **Step 3: Call policy validation from `plan_deploy`**

In `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/planner.rs`, import:

```rust
use crate::policy::validate_plan_policy;
```

Then replace:

```rust
let issues = validate_fit(recipe, profile, &plan);
```

with:

```rust
let mut issues = validate_fit(recipe, profile, &plan);
issues.extend(validate_plan_policy(recipe, profile, &plan));
```

- [ ] **Step 4: Run focused policy tests**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p model-catalog policy::tests
```

Expected: all policy tests pass.

- [ ] **Step 5: Run validators**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo fmt --all -- --check
cargo test -p model-catalog
cargo clippy -p model-catalog --all-targets -- -D warnings
```

Expected: all pass.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
git status
git add crates/model-catalog/src/lib.rs crates/model-catalog/src/planner.rs crates/model-catalog/src/policy.rs
git diff --cached
git commit -m "feat: validate model deployment policy"
```

---

## Task 3: Add runtime state types

**Files:**

- Create: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/state.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/lib.rs`

- [ ] **Step 1: Create runtime state structs**

Create `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/state.rs`:

```rust
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{Recipe, ResourceRequests};

#[derive(Clone, Debug, Deserialize, Eq, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RendererMode {
    Kserve,
    DirectVllm,
    ExternalOpenAiCompatible,
    MacMiniMlx,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
pub struct RuntimeProfile {
    pub id: String,
    pub target: String,
    pub renderer_mode: RendererMode,
    pub allowed_images: Vec<String>,
    pub allowed_model_roots: Vec<String>,
    pub max_resources: ResourceRequests,
    pub default_resources: ResourceRequests,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
pub struct RuntimeRecipeRecord {
    pub recipe: Recipe,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DeploymentState {
    Planned,
    Applying,
    Ready,
    Failed,
    Stopped,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
pub struct RuntimeDeploymentRecord {
    pub name: String,
    pub namespace: String,
    pub recipe_id: String,
    pub target: String,
    pub runtime_args: Vec<String>,
    pub runtime_env: Vec<crate::EnvVar>,
    pub resources: ResourceRequests,
    pub status: DeploymentState,
    pub last_plan_digest: String,
    pub created_by: String,
    pub created_at: String,
    pub failure_reason: Option<String>,
}

impl RuntimeProfile {
    pub fn spark_vllm_medium() -> Self {
        Self {
            id: "spark-vllm-medium".into(),
            target: "spark".into(),
            renderer_mode: RendererMode::Kserve,
            allowed_images: vec!["vllm/vllm-openai:latest".into()],
            allowed_model_roots: vec!["/mnt/nas/models".into()],
            max_resources: ResourceRequests {
                cpu: "16".into(),
                memory: "96Gi".into(),
                gpu_count: 1,
            },
            default_resources: ResourceRequests {
                cpu: "2".into(),
                memory: "16Gi".into(),
                gpu_count: 1,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spark_profile_is_kserve_and_allowlisted() {
        let profile = RuntimeProfile::spark_vllm_medium();
        assert_eq!(profile.target, "spark");
        assert_eq!(profile.renderer_mode, RendererMode::Kserve);
        assert!(profile.allowed_images.contains(&"vllm/vllm-openai:latest".into()));
        assert!(profile.allowed_model_roots.contains(&"/mnt/nas/models".into()));
    }
}
```

- [ ] **Step 2: Export runtime state types**

In `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/lib.rs`, add:

```rust
pub mod state;
pub use state::{
    DeploymentState, RendererMode, RuntimeDeploymentRecord, RuntimeProfile, RuntimeRecipeRecord,
};
```

- [ ] **Step 3: Run tests**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p model-catalog state::tests
cargo fmt --all -- --check
```

Expected: tests and formatting pass.

- [ ] **Step 4: Commit Task 3**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
git add crates/model-catalog/src/lib.rs crates/model-catalog/src/state.rs
git diff --cached
git commit -m "feat: add runtime model state types"
```

---

## Task 4: Add Kubernetes ConfigMap runtime store

**Files:**

- Create: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/runtime_store.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/lib.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/Cargo.toml`

- [ ] **Step 1: Add `model-catalog` dependency to k8s crate**

In `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/Cargo.toml`, add:

```toml
model-catalog = { path = "../model-catalog" }
serde_yaml.workspace = true
```

- [ ] **Step 2: Create ConfigMap-backed runtime store**

Create `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/runtime_store.rs`:

```rust
use std::collections::BTreeMap;

use k8s_openapi::api::core::v1::ConfigMap;
use kube::{
    Api, Client,
    api::{DeleteParams, ListParams, Patch, PatchParams, PostParams},
};
use model_catalog::{RuntimeDeploymentRecord, RuntimeRecipeRecord};

const RECIPE_LABEL: &str = "homelab.saavylab.dev/model-catalog-kind=runtime-recipe";
const DEPLOYMENT_LABEL: &str = "homelab.saavylab.dev/model-catalog-kind=runtime-deployment";

fn runtime_name(prefix: &str, id: &str) -> String {
    format!("{}-{}", prefix, homelab_mcp_core::sanitize_dns_name(id))
}

pub async fn upsert_runtime_recipe(
    client: Client,
    namespace: &str,
    record: &RuntimeRecipeRecord,
) -> Result<String, kube::Error> {
    let api: Api<ConfigMap> = Api::namespaced(client, namespace);
    let name = runtime_name("model-recipe", &record.recipe.id);
    let mut labels = BTreeMap::new();
    labels.insert(
        "homelab.saavylab.dev/model-catalog-kind".into(),
        "runtime-recipe".into(),
    );
    labels.insert("homelab.saavylab.dev/recipe-id".into(), record.recipe.id.clone());
    let mut data = BTreeMap::new();
    data.insert(
        "record.yaml".into(),
        serde_yaml::to_string(record).map_err(|error| kube::Error::Service(error.to_string()))?,
    );
    let cm = ConfigMap {
        metadata: kube::core::ObjectMeta {
            name: Some(name.clone()),
            namespace: Some(namespace.into()),
            labels: Some(labels),
            ..Default::default()
        },
        data: Some(data),
        ..Default::default()
    };
    let patch = Patch::Apply(&cm);
    let params = PatchParams::apply("model-catalog-mcp").force();
    let applied = api.patch(&name, &params, &patch).await?;
    Ok(applied.metadata.name.unwrap_or(name))
}

pub async fn list_runtime_recipes(
    client: Client,
    namespace: &str,
) -> Result<Vec<RuntimeRecipeRecord>, kube::Error> {
    let api: Api<ConfigMap> = Api::namespaced(client, namespace);
    let list = api
        .list(&ListParams::default().labels(RECIPE_LABEL))
        .await?;
    Ok(list
        .iter()
        .filter_map(|cm| cm.data.as_ref()?.get("record.yaml"))
        .filter_map(|input| serde_yaml::from_str(input).ok())
        .collect())
}

pub async fn get_runtime_recipe(
    client: Client,
    namespace: &str,
    recipe_id: &str,
) -> Result<Option<RuntimeRecipeRecord>, kube::Error> {
    let records = list_runtime_recipes(client, namespace).await?;
    Ok(records
        .into_iter()
        .find(|record| record.recipe.id == recipe_id))
}

pub async fn delete_runtime_recipe(
    client: Client,
    namespace: &str,
    recipe_id: &str,
) -> Result<(), kube::Error> {
    let api: Api<ConfigMap> = Api::namespaced(client, namespace);
    let name = runtime_name("model-recipe", recipe_id);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => Ok(()),
        Err(error) if error.to_string().contains("404") => Ok(()),
        Err(error) => Err(error),
    }
}

pub async fn upsert_runtime_deployment(
    client: Client,
    namespace: &str,
    record: &RuntimeDeploymentRecord,
) -> Result<String, kube::Error> {
    let api: Api<ConfigMap> = Api::namespaced(client, namespace);
    let name = runtime_name("model-deployment", &record.name);
    let mut labels = BTreeMap::new();
    labels.insert(
        "homelab.saavylab.dev/model-catalog-kind".into(),
        "runtime-deployment".into(),
    );
    labels.insert("homelab.saavylab.dev/deployment-name".into(), record.name.clone());
    let mut data = BTreeMap::new();
    data.insert(
        "record.yaml".into(),
        serde_yaml::to_string(record).map_err(|error| kube::Error::Service(error.to_string()))?,
    );
    let cm = ConfigMap {
        metadata: kube::core::ObjectMeta {
            name: Some(name.clone()),
            namespace: Some(namespace.into()),
            labels: Some(labels),
            ..Default::default()
        },
        data: Some(data),
        ..Default::default()
    };
    let patch = Patch::Apply(&cm);
    let params = PatchParams::apply("model-catalog-mcp").force();
    let applied = api.patch(&name, &params, &patch).await?;
    Ok(applied.metadata.name.unwrap_or(name))
}

pub async fn list_runtime_deployments(
    client: Client,
    namespace: &str,
) -> Result<Vec<RuntimeDeploymentRecord>, kube::Error> {
    let api: Api<ConfigMap> = Api::namespaced(client, namespace);
    let list = api
        .list(&ListParams::default().labels(DEPLOYMENT_LABEL))
        .await?;
    Ok(list
        .iter()
        .filter_map(|cm| cm.data.as_ref()?.get("record.yaml"))
        .filter_map(|input| serde_yaml::from_str(input).ok())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_name_sanitizes_ids() {
        assert_eq!(
            runtime_name("model-recipe", "deepseek-ai/DeepSeek-V4-Flash"),
            "model-recipe-deepseek-ai-deepseek-v4-flash"
        );
    }
}
```

- [ ] **Step 3: Export runtime store functions**

In `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/lib.rs`, add:

```rust
pub mod runtime_store;

pub use runtime_store::{
    delete_runtime_recipe, get_runtime_recipe, list_runtime_deployments, list_runtime_recipes,
    upsert_runtime_deployment, upsert_runtime_recipe,
};
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p homelab-mcp-k8s runtime_store::tests
cargo fmt --all -- --check
```

Expected: runtime store unit test passes.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
git add crates/homelab-mcp-k8s/Cargo.toml crates/homelab-mcp-k8s/src/lib.rs crates/homelab-mcp-k8s/src/runtime_store.rs
git diff --cached
git commit -m "feat: add runtime model state store"
```

---

## Task 5: Add Spark Arena directory search and import

**Files:**

- Create: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/arena.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/lib.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/src/main.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/src/tools.rs`

- [ ] **Step 1: Add Spark Arena loader**

Create `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/arena.rs`:

```rust
use std::path::Path;

use homelab_mcp_core::HomelabResult;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{Recipe, RecipeSource, load_recipe_dir, search_recipes};

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
pub struct SparkArenaSearchResult {
    pub id: String,
    pub model_id: String,
    pub quantization: Option<String>,
    pub estimated_vram_gb: Option<u32>,
    pub required_args: Vec<String>,
    pub source: String,
}

pub fn load_spark_arena_recipes(path: impl AsRef<Path>) -> HomelabResult<Vec<Recipe>> {
    let mut recipes = load_recipe_dir(path)?;
    for recipe in &mut recipes {
        recipe.source = RecipeSource::SparkArena;
    }
    Ok(recipes)
}

pub fn search_spark_arena_recipes(
    recipes: &[Recipe],
    query: Option<&str>,
) -> Vec<SparkArenaSearchResult> {
    search_recipes(recipes, query)
        .into_iter()
        .map(|recipe| SparkArenaSearchResult {
            id: recipe.id.clone(),
            model_id: recipe.model.id.clone(),
            quantization: recipe.model.quantization.clone(),
            estimated_vram_gb: recipe.hardware.estimated_vram_gb,
            required_args: recipe.runtime.args.clone(),
            source: recipe.provenance.source.clone(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_result_exposes_required_args() {
        let recipe = crate::parse_recipe_yaml(include_str!(
            "../tests/fixtures/local-recipes/lfm25-350m.yaml"
        ))
        .expect("recipe parses");
        let results = search_spark_arena_recipes(&[recipe], Some("lfm"));
        assert_eq!(results.len(), 1);
        assert!(results[0].required_args.contains(&"--language-model-only".into()));
    }
}
```

- [ ] **Step 2: Export arena functions**

In `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/lib.rs`, add:

```rust
pub mod arena;
pub use arena::{SparkArenaSearchResult, load_spark_arena_recipes, search_spark_arena_recipes};
```

- [ ] **Step 3: Add arena directory to server config**

In `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/src/tools.rs`, add field:

```rust
pub spark_arena_dir: PathBuf,
pub runtime_state_namespace: String,
```

In `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/src/main.rs`, read env vars:

```rust
let spark_arena_dir = env::var("MODEL_CATALOG_SPARK_ARENA_DIR")
    .map(PathBuf::from)
    .unwrap_or_else(|_| PathBuf::from("/etc/model-catalog/spark-arena"));
let runtime_state_namespace =
    env::var("MODEL_CATALOG_STATE_NAMESPACE").unwrap_or_else(|_| "hermes".into());
```

Pass both fields into `ModelCatalogTools`.

- [ ] **Step 4: Add MCP params**

In `tools.rs`, add:

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SearchSparkArenaRecipesParams {
    pub query: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ShowSparkArenaRecipeParams {
    pub id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ImportSparkArenaRecipeParams {
    pub id: String,
    pub created_by: Option<String>,
}
```

- [ ] **Step 5: Add Spark Arena MCP tools**

In the `#[tool_router] impl ModelCatalogTools` block, add:

```rust
#[tool(description = "Search Spark Arena model recipes available to import")]
pub fn search_spark_arena_recipes(
    &self,
    Parameters(params): Parameters<SearchSparkArenaRecipesParams>,
) -> Result<String, String> {
    let recipes = model_catalog::load_spark_arena_recipes(&self.spark_arena_dir)
        .map_err(|error| error.to_string())?;
    let matches =
        model_catalog::search_spark_arena_recipes(&recipes, params.query.as_deref());
    serde_json::to_string(&homelab_mcp_core::ToolResult::read(
        format!("found {} Spark Arena recipe(s)", matches.len()),
        matches,
    ))
    .map_err(|error| error.to_string())
}

#[tool(description = "Show one Spark Arena recipe by id before importing")]
pub fn show_spark_arena_recipe(
    &self,
    Parameters(params): Parameters<ShowSparkArenaRecipeParams>,
) -> Result<String, String> {
    let recipes = model_catalog::load_spark_arena_recipes(&self.spark_arena_dir)
        .map_err(|error| error.to_string())?;
    let recipe = recipes
        .into_iter()
        .find(|recipe| recipe.id == params.id)
        .ok_or_else(|| format!("Spark Arena recipe not found: {}", params.id))?;
    serde_json::to_string(&homelab_mcp_core::ToolResult::read(
        format!("loaded Spark Arena recipe {}", recipe.id),
        recipe,
    ))
    .map_err(|error| error.to_string())
}

#[tool(description = "Import a Spark Arena recipe into runtime model state")]
pub async fn import_spark_arena_recipe(
    &self,
    Parameters(params): Parameters<ImportSparkArenaRecipeParams>,
) -> Result<String, String> {
    let recipes = model_catalog::load_spark_arena_recipes(&self.spark_arena_dir)
        .map_err(|error| error.to_string())?;
    let recipe = recipes
        .into_iter()
        .find(|recipe| recipe.id == params.id)
        .ok_or_else(|| format!("Spark Arena recipe not found: {}", params.id))?;
    let now = chrono::Utc::now().to_rfc3339();
    let record = model_catalog::RuntimeRecipeRecord {
        recipe,
        created_by: params.created_by.unwrap_or_else(|| "hermes".into()),
        created_at: now.clone(),
        updated_at: now,
    };
    let client = homelab_mcp_k8s::k8s_client()
        .await
        .map_err(|error| error.to_string())?;
    let name = homelab_mcp_k8s::upsert_runtime_recipe(
        client,
        &self.runtime_state_namespace,
        &record,
    )
    .await
    .map_err(|error| error.to_string())?;
    serde_json::to_string(&homelab_mcp_core::ToolResult::cluster_write(
        format!("imported runtime recipe {}", record.recipe.id),
        serde_json::json!({ "configmap": name, "recipe_id": record.recipe.id }),
    ))
    .map_err(|error| error.to_string())
}
```

- [ ] **Step 6: Add `chrono` dependency**

In `/home/saavy/dev/homelab/homelab-mcp/Cargo.toml`, add:

```toml
chrono = { version = "0.4", features = ["clock", "serde"] }
```

In `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/Cargo.toml`, add:

```toml
chrono.workspace = true
```

- [ ] **Step 7: Run tests**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p model-catalog arena::tests
cargo test -p model-catalog-mcp
cargo fmt --all -- --check
cargo clippy -p model-catalog -p model-catalog-mcp --all-targets -- -D warnings
```

Expected: all pass.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
git add Cargo.toml Cargo.lock crates/model-catalog/src/arena.rs crates/model-catalog/src/lib.rs servers/model-catalog-mcp/Cargo.toml servers/model-catalog-mcp/src/main.rs servers/model-catalog-mcp/src/tools.rs
git diff --cached
git commit -m "feat: add Spark Arena recipe import tools"
```

---

## Task 6: Merge local and runtime recipe sources

**Files:**

- Modify: `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/src/tools.rs`

- [ ] **Step 1: Replace `load_recipes` with merged recipe loading**

In `tools.rs`, replace:

```rust
fn load_recipes(&self) -> Result<Vec<Recipe>, String> {
    load_recipe_dir(&self.recipe_dir).map_err(|error| error.to_string())
}
```

with:

```rust
async fn load_recipes_merged(&self) -> Result<Vec<Recipe>, String> {
    let mut recipes = load_recipe_dir(&self.recipe_dir).map_err(|error| error.to_string())?;
    let client = homelab_mcp_k8s::k8s_client()
        .await
        .map_err(|error| error.to_string())?;
    let runtime = homelab_mcp_k8s::list_runtime_recipes(client, &self.runtime_state_namespace)
        .await
        .map_err(|error| error.to_string())?;
    for record in runtime {
        recipes.retain(|recipe| recipe.id != record.recipe.id);
        recipes.push(record.recipe);
    }
    recipes.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(recipes)
}
```

- [ ] **Step 2: Convert recipe read tools to async**

Change these MCP methods to `async fn` and call `load_recipes_merged().await`:

- `search_recipes`
- `show_recipe`
- `plan_deploy`
- `ensure_weights`
- `apply_plan`
- `derive_plan`

Use this replacement for `find_recipe`:

```rust
async fn find_recipe(&self, id: &str) -> Result<Recipe, String> {
    self.load_recipes_merged()
        .await?
        .into_iter()
        .find(|recipe| recipe.id == id)
        .ok_or_else(|| format!("recipe not found: {id}"))
}
```

- [ ] **Step 3: Add runtime create/delete tools**

Add params:

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateRecipeParams {
    pub recipe: Recipe,
    pub created_by: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DeleteRecipeParams {
    pub recipe_id: String,
}
```

Add tools:

```rust
#[tool(description = "Create or replace a runtime recipe in model-catalog state")]
pub async fn create_recipe(
    &self,
    Parameters(params): Parameters<CreateRecipeParams>,
) -> Result<String, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let record = model_catalog::RuntimeRecipeRecord {
        recipe: params.recipe,
        created_by: params.created_by.unwrap_or_else(|| "hermes".into()),
        created_at: now.clone(),
        updated_at: now,
    };
    let client = homelab_mcp_k8s::k8s_client()
        .await
        .map_err(|error| error.to_string())?;
    let name = homelab_mcp_k8s::upsert_runtime_recipe(
        client,
        &self.runtime_state_namespace,
        &record,
    )
    .await
    .map_err(|error| error.to_string())?;
    serde_json::to_string(&homelab_mcp_core::ToolResult::cluster_write(
        format!("stored runtime recipe {}", record.recipe.id),
        serde_json::json!({ "configmap": name, "recipe_id": record.recipe.id }),
    ))
    .map_err(|error| error.to_string())
}

#[tool(description = "Delete a runtime recipe from model-catalog state")]
pub async fn delete_recipe(
    &self,
    Parameters(params): Parameters<DeleteRecipeParams>,
) -> Result<String, String> {
    let client = homelab_mcp_k8s::k8s_client()
        .await
        .map_err(|error| error.to_string())?;
    homelab_mcp_k8s::delete_runtime_recipe(
        client,
        &self.runtime_state_namespace,
        &params.recipe_id,
    )
    .await
    .map_err(|error| error.to_string())?;
    serde_json::to_string(&homelab_mcp_core::ToolResult::cluster_write(
        format!("deleted runtime recipe {}", params.recipe_id),
        serde_json::json!({ "recipe_id": params.recipe_id }),
    ))
    .map_err(|error| error.to_string())
}
```

- [ ] **Step 4: Update tests to await async tools**

In `tools.rs` tests, convert sync tests calling recipe tools into `#[tokio::test]` tests. Example:

```rust
#[tokio::test]
async fn search_recipes_returns_known_fixture() {
    let output = tools()
        .search_recipes(Parameters(SearchRecipesParams {
            query: Some("qwen".into()),
        }))
        .await
        .expect("search");
    assert!(output.contains("qwen3-8b"));
}
```

For tests that should avoid live Kubernetes, add a helper that uses a temporary runtime namespace only after Task 9 deploys. Until then, keep pure unit tests on local parsing and use integration tests for live cluster behavior.

- [ ] **Step 5: Run tests**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p model-catalog-mcp
cargo fmt --all -- --check
cargo clippy -p model-catalog-mcp --all-targets -- -D warnings
```

Expected: tests compile and pass.

- [ ] **Step 6: Commit Task 6**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
git add servers/model-catalog-mcp/src/tools.rs
git diff --cached
git commit -m "feat: merge runtime and local model recipes"
```

---

## Task 7: Add capacity report and fit estimation

**Files:**

- Create: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/capacity.rs`
- Create: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/capacity.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/Cargo.toml`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/Cargo.toml`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/lib.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/lib.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/src/tools.rs`

- [ ] **Step 1: Add capacity data types**

Create `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/capacity.rs`:

```rust
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::ResourceRequests;

#[derive(Clone, Debug, Deserialize, Eq, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FitConfidence {
    Low,
    Medium,
    High,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
pub struct ActiveModelCapacity {
    pub name: String,
    pub namespace: String,
    pub recipe_id: Option<String>,
    pub requested: ResourceRequests,
    pub ready: bool,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
pub struct CapacityReport {
    pub target: String,
    pub node_ready: bool,
    pub active_models: Vec<ActiveModelCapacity>,
    pub observed_gpu_utilization_percent: Option<f64>,
    pub observed_gpu_memory_used_bytes: Option<f64>,
    pub observed_gpu_memory_total_bytes: Option<f64>,
    pub risks: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
pub struct FitEstimate {
    pub target: String,
    pub fits: bool,
    pub confidence: FitConfidence,
    pub mode: String,
    pub risks: Vec<String>,
    pub recommended_resources: ResourceRequests,
}

pub fn estimate_fit_from_report(
    report: &CapacityReport,
    requested: ResourceRequests,
) -> FitEstimate {
    let mut risks = report.risks.clone();
    if !report.node_ready {
        risks.push("target node is not Ready".into());
    }
    let active_gpu: u32 = report
        .active_models
        .iter()
        .map(|model| model.requested.gpu_count)
        .sum();
    let fits = report.node_ready && active_gpu + requested.gpu_count <= 1;
    let confidence = if report.observed_gpu_memory_total_bytes.is_some() {
        FitConfidence::Medium
    } else {
        FitConfidence::Low
    };
    FitEstimate {
        target: report.target.clone(),
        fits,
        confidence,
        mode: if active_gpu == 0 {
            "single-model".into()
        } else {
            "co-locate-small-model".into()
        },
        risks,
        recommended_resources: requested,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fit_fails_when_node_not_ready() {
        let report = CapacityReport {
            target: "spark".into(),
            node_ready: false,
            active_models: Vec::new(),
            observed_gpu_utilization_percent: None,
            observed_gpu_memory_used_bytes: None,
            observed_gpu_memory_total_bytes: None,
            risks: Vec::new(),
        };
        let fit = estimate_fit_from_report(
            &report,
            ResourceRequests {
                cpu: "2".into(),
                memory: "16Gi".into(),
                gpu_count: 1,
            },
        );
        assert!(!fit.fits);
        assert!(fit.risks.contains(&"target node is not Ready".into()));
    }
}
```

- [ ] **Step 2: Export capacity types**

In `/home/saavy/dev/homelab/homelab-mcp/crates/model-catalog/src/lib.rs`, add:

```rust
pub mod capacity;
pub use capacity::{
    ActiveModelCapacity, CapacityReport, FitConfidence, FitEstimate, estimate_fit_from_report,
};
```

- [ ] **Step 3: Add reqwest dependency**

In workspace `/home/saavy/dev/homelab/homelab-mcp/Cargo.toml`, add:

```toml
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
```

In `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/Cargo.toml`, add:

```toml
reqwest.workspace = true
```

- [ ] **Step 4: Add Kubernetes/Prometheus capacity collection**

Create `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/capacity.rs`:

```rust
use k8s_openapi::api::core::v1::{Node, Pod};
use kube::{Api, Client, api::ListParams};
use model_catalog::{ActiveModelCapacity, CapacityReport, ResourceRequests};

pub async fn collect_capacity_report(
    client: Client,
    target: &str,
    prometheus_base_url: Option<&str>,
) -> Result<CapacityReport, String> {
    let nodes: Api<Node> = Api::all(client.clone());
    let pods: Api<Pod> = Api::all(client);
    let node_name = match target {
        "spark" => "gx10-98a5",
        other => other,
    };

    let node = nodes
        .get(node_name)
        .await
        .map_err(|error| format!("get node {node_name}: {error}"))?;
    let node_ready = node
        .status
        .as_ref()
        .and_then(|status| status.conditions.as_ref())
        .is_some_and(|conditions| {
            conditions
                .iter()
                .any(|condition| condition.type_ == "Ready" && condition.status == "True")
        });

    let active_models = pods
        .list(
            &ListParams::default()
                .fields(&format!("spec.nodeName={node_name}"))
                .labels("app.kubernetes.io/managed-by=homelab-mcp"),
        )
        .await
        .map_err(|error| format!("list pods: {error}"))?
        .iter()
        .filter_map(active_model_from_pod)
        .collect();

    let (gpu_util, gpu_mem_used, gpu_mem_total) = match prometheus_base_url {
        Some(base) => (
            query_prometheus_scalar(base, "DCGM_FI_DEV_GPU_UTIL").await.ok(),
            query_prometheus_scalar(base, "DCGM_FI_DEV_FB_USED * 1024 * 1024").await.ok(),
            query_prometheus_scalar(base, "DCGM_FI_DEV_FB_TOTAL * 1024 * 1024").await.ok(),
        ),
        None => (None, None, None),
    };

    let mut risks = Vec::new();
    if prometheus_base_url.is_none() {
        risks.push("PROMETHEUS_BASE_URL is not configured; fit uses Kubernetes state only".into());
    }

    Ok(CapacityReport {
        target: target.into(),
        node_ready,
        active_models,
        observed_gpu_utilization_percent: gpu_util,
        observed_gpu_memory_used_bytes: gpu_mem_used,
        observed_gpu_memory_total_bytes: gpu_mem_total,
        risks,
    })
}

fn active_model_from_pod(pod: &Pod) -> Option<ActiveModelCapacity> {
    let metadata = &pod.metadata;
    let labels = metadata.labels.as_ref()?;
    let name = metadata.name.clone()?;
    let namespace = metadata.namespace.clone()?;
    let recipe_id = labels.get("homelab.saavylab.dev/recipe-id").cloned();
    let ready = pod
        .status
        .as_ref()
        .and_then(|status| status.conditions.as_ref())
        .is_some_and(|conditions| {
            conditions
                .iter()
                .any(|condition| condition.type_ == "Ready" && condition.status == "True")
        });

    Some(ActiveModelCapacity {
        name,
        namespace,
        recipe_id,
        requested: ResourceRequests {
            cpu: "unknown".into(),
            memory: "unknown".into(),
            gpu_count: 1,
        },
        ready,
    })
}

async fn query_prometheus_scalar(base: &str, query: &str) -> Result<f64, String> {
    let url = format!("{}/api/v1/query", base.trim_end_matches('/'));
    let response: serde_json::Value = reqwest::Client::new()
        .get(url)
        .query(&[("query", query)])
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;
    response["data"]["result"]
        .as_array()
        .and_then(|items| items.first())
        .and_then(|item| item["value"].as_array())
        .and_then(|value| value.get(1))
        .and_then(|value| value.as_str())
        .and_then(|value| value.parse::<f64>().ok())
        .ok_or_else(|| format!("Prometheus query returned no scalar: {query}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spark_target_maps_to_node_name() {
        let target = "spark";
        let node_name = match target {
            "spark" => "gx10-98a5",
            other => other,
        };
        assert_eq!(node_name, "gx10-98a5");
    }
}
```

- [ ] **Step 5: Export capacity collection**

In `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/lib.rs`, add:

```rust
pub mod capacity;
pub use capacity::collect_capacity_report;
```

- [ ] **Step 6: Add MCP capacity tools**

In `servers/model-catalog-mcp/src/tools.rs`, add field:

```rust
pub prometheus_base_url: Option<String>,
```

Add params:

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CapacityReportParams {
    pub target: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct EstimateFitParams {
    pub recipe_id: String,
    pub target: String,
    pub runtime_args: Option<Vec<String>>,
    pub cpu: Option<String>,
    pub memory: Option<String>,
    pub gpu_count: Option<u32>,
}
```

Add tools:

```rust
#[tool(description = "Return capacity report for a model-serving target")]
pub async fn capacity_report(
    &self,
    Parameters(params): Parameters<CapacityReportParams>,
) -> Result<String, String> {
    let client = homelab_mcp_k8s::k8s_client()
        .await
        .map_err(|error| error.to_string())?;
    let report = homelab_mcp_k8s::collect_capacity_report(
        client,
        &params.target,
        self.prometheus_base_url.as_deref(),
    )
    .await?;
    serde_json::to_string(&homelab_mcp_core::ToolResult::read(
        format!("capacity report for {}", params.target),
        report,
    ))
    .map_err(|error| error.to_string())
}

#[tool(description = "Estimate whether a recipe fits on a target using current capacity")]
pub async fn estimate_fit(
    &self,
    Parameters(params): Parameters<EstimateFitParams>,
) -> Result<String, String> {
    let recipe = self.find_recipe(&params.recipe_id).await?;
    let requested = resource_requests_from_params(params.cpu, params.memory, params.gpu_count)
        .unwrap_or(model_catalog::ResourceRequests {
            cpu: "2".into(),
            memory: "16Gi".into(),
            gpu_count: recipe.hardware.gpu_count,
        });
    let client = homelab_mcp_k8s::k8s_client()
        .await
        .map_err(|error| error.to_string())?;
    let report = homelab_mcp_k8s::collect_capacity_report(
        client,
        &params.target,
        self.prometheus_base_url.as_deref(),
    )
    .await?;
    let estimate = model_catalog::estimate_fit_from_report(&report, requested);
    serde_json::to_string(&homelab_mcp_core::ToolResult::read(
        format!("fit estimate for {} on {}", params.recipe_id, params.target),
        estimate,
    ))
    .map_err(|error| error.to_string())
}
```

- [ ] **Step 7: Read `PROMETHEUS_BASE_URL` in main**

In `servers/model-catalog-mcp/src/main.rs`:

```rust
let prometheus_base_url = env::var("PROMETHEUS_BASE_URL").ok();
```

Pass it to `ModelCatalogTools`.

- [ ] **Step 8: Run tests and validators**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p model-catalog capacity::tests
cargo test -p homelab-mcp-k8s capacity::tests
cargo test -p model-catalog-mcp
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
```

Expected: all pass.

- [ ] **Step 9: Commit Task 7**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
git add Cargo.toml Cargo.lock crates/model-catalog/src/capacity.rs crates/model-catalog/src/lib.rs crates/homelab-mcp-k8s/Cargo.toml crates/homelab-mcp-k8s/src/capacity.rs crates/homelab-mcp-k8s/src/lib.rs servers/model-catalog-mcp/src/main.rs servers/model-catalog-mcp/src/tools.rs
git diff --cached
git commit -m "feat: add model capacity reporting"
```

---

## Task 8: Add deployment lifecycle tools

**Files:**

- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/live.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/lib.rs`
- Modify: `/home/saavy/dev/homelab/homelab-mcp/servers/model-catalog-mcp/src/tools.rs`

- [ ] **Step 1: Add delete InferenceService helper**

In `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/live.rs`, add:

```rust
pub async fn delete_inferenceservice(namespace: &str, name: &str) -> Result<(), kube::Error> {
    let ar = isvc_api_resource();
    let client = k8s_client().await?;
    let isvc: Api<DynamicObject> = Api::namespaced_with(client, namespace, &ar);
    match isvc.delete(name, &kube::api::DeleteParams::default()).await {
        Ok(_) => Ok(()),
        Err(error) if error.to_string().contains("404") => Ok(()),
        Err(error) => Err(error),
    }
}
```

- [ ] **Step 2: Add dry-run create helper**

In `live.rs`, add:

```rust
pub async fn dry_run_inferenceservice(
    manifest: serde_json::Value,
    namespace: &str,
) -> Result<String, kube::Error> {
    let ar = isvc_api_resource();
    let client = k8s_client().await?;
    let isvc: Api<DynamicObject> = Api::namespaced_with(client, namespace, &ar);
    let name = manifest
        .get("metadata")
        .and_then(|m| m.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("unknown");
    let mut obj = DynamicObject::new(name, &ar).within(namespace);
    obj.data = manifest;
    let params = PostParams {
        dry_run: true,
        ..PostParams::default()
    };
    let checked = isvc.create(&params, &obj).await?;
    Ok(checked.metadata.name.unwrap_or_else(|| name.into()))
}
```

- [ ] **Step 3: Export lifecycle helpers**

In `/home/saavy/dev/homelab/homelab-mcp/crates/homelab-mcp-k8s/src/lib.rs`, add to the `pub use live::{...}` list:

```rust
delete_inferenceservice, dry_run_inferenceservice,
```

- [ ] **Step 4: Add deploy/stop/list params**

In `servers/model-catalog-mcp/src/tools.rs`, add:

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DeployModelParams {
    pub recipe_id: String,
    pub target: String,
    pub name: Option<String>,
    pub namespace: Option<String>,
    pub runtime_args: Option<Vec<String>>,
    pub runtime_env: Option<Vec<model_catalog::EnvVar>>,
    pub cpu: Option<String>,
    pub memory: Option<String>,
    pub gpu_count: Option<u32>,
    pub readiness_timeout_seconds: Option<u32>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct StopModelParams {
    pub namespace: String,
    pub name: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListDeploymentsParams {
    pub target: Option<String>,
}
```

- [ ] **Step 5: Add `deploy_model`**

In the tool router, add:

```rust
#[tool(description = "Plan, dry-run, apply, and record a model deployment")]
pub async fn deploy_model(
    &self,
    Parameters(params): Parameters<DeployModelParams>,
) -> Result<String, String> {
    let recipe = self.find_recipe(&params.recipe_id).await?;
    let overrides = DeployOverrides {
        name: params.name.clone(),
        namespace: params.namespace.clone(),
        replicas: None,
        runtime_args: params.runtime_args.unwrap_or_default(),
        runtime_env: params.runtime_env.unwrap_or_default(),
        env_overrides: Vec::new(),
        resource_requests: resource_requests_from_params(params.cpu, params.memory, params.gpu_count),
        readiness_timeout_seconds: params.readiness_timeout_seconds,
    };
    let result = model_catalog::plan_deploy(&recipe, &self.cluster_profile, overrides);
    if !result.issues.is_empty() {
        return Err(serde_json::to_string(&result.issues).map_err(|error| error.to_string())?);
    }
    let plan = result.data;
    let manifest = model_catalog::render_kserve_value(&plan);
    homelab_mcp_k8s::dry_run_inferenceservice(manifest.clone(), &plan.namespace)
        .await
        .map_err(|error| format!("dry-run InferenceService: {error}"))?;
    let created = homelab_mcp_k8s::create_inferenceservice(manifest, &plan.namespace)
        .await
        .map_err(|error| format!("create InferenceService: {error}"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let record = model_catalog::RuntimeDeploymentRecord {
        name: plan.name.clone(),
        namespace: plan.namespace.clone(),
        recipe_id: plan.recipe_id.clone(),
        target: params.target,
        runtime_args: plan.runtime_args.clone(),
        runtime_env: plan.runtime_env.clone(),
        resources: plan.resource_requests.clone(),
        status: model_catalog::DeploymentState::Applying,
        last_plan_digest: plan.plan_digest.clone(),
        created_by: "hermes".into(),
        created_at: now,
        failure_reason: None,
    };
    let client = homelab_mcp_k8s::k8s_client()
        .await
        .map_err(|error| error.to_string())?;
    homelab_mcp_k8s::upsert_runtime_deployment(
        client,
        &self.runtime_state_namespace,
        &record,
    )
    .await
    .map_err(|error| error.to_string())?;
    serde_json::to_string(&homelab_mcp_core::ToolResult::cluster_write(
        format!("created model deployment {}", plan.name),
        serde_json::json!({
            "created_name": created,
            "namespace": plan.namespace,
            "name": plan.name,
            "plan_digest": plan.plan_digest
        }),
    ))
    .map_err(|error| error.to_string())
}
```

- [ ] **Step 6: Add `stop_model`**

Add:

```rust
#[tool(description = "Stop a model deployment by deleting its KServe InferenceService")]
pub async fn stop_model(
    &self,
    Parameters(params): Parameters<StopModelParams>,
) -> Result<String, String> {
    homelab_mcp_k8s::delete_inferenceservice(&params.namespace, &params.name)
        .await
        .map_err(|error| error.to_string())?;
    serde_json::to_string(&homelab_mcp_core::ToolResult::cluster_write(
        format!("stopped model {}", params.name),
        serde_json::json!({ "namespace": params.namespace, "name": params.name }),
    ))
    .map_err(|error| error.to_string())
}
```

- [ ] **Step 7: Add `list_deployments`**

Add:

```rust
#[tool(description = "List runtime model deployments recorded by model-catalog")]
pub async fn list_deployments(
    &self,
    Parameters(params): Parameters<ListDeploymentsParams>,
) -> Result<String, String> {
    let client = homelab_mcp_k8s::k8s_client()
        .await
        .map_err(|error| error.to_string())?;
    let mut deployments =
        homelab_mcp_k8s::list_runtime_deployments(client, &self.runtime_state_namespace)
            .await
            .map_err(|error| error.to_string())?;
    if let Some(target) = params.target {
        deployments.retain(|deployment| deployment.target == target);
    }
    serde_json::to_string(&homelab_mcp_core::ToolResult::read(
        format!("listed {} runtime deployment(s)", deployments.len()),
        deployments,
    ))
    .map_err(|error| error.to_string())
}
```

- [ ] **Step 8: Run tests**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo test -p homelab-mcp-k8s
cargo test -p model-catalog-mcp
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
```

Expected: all pass.

- [ ] **Step 9: Commit Task 8**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
git add crates/homelab-mcp-k8s/src/live.rs crates/homelab-mcp-k8s/src/lib.rs servers/model-catalog-mcp/src/tools.rs
git diff --cached
git commit -m "feat: add model deployment lifecycle tools"
```

---

## Task 9: Update Superbloom deployment manifests

**Files:**

- Modify: `/home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources/deployment.yaml`
- Modify: `/home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources/rbac.yaml`
- Create: `/home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources/spark-arena-recipes.yaml`
- Modify: `/home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources/kustomization.yaml`

- [ ] **Step 1: Add deployment env vars**

In `deployment.yaml`, under existing env vars, add:

```yaml
- name: MODEL_CATALOG_STATE_NAMESPACE
  value: "hermes"
- name: MODEL_CATALOG_SPARK_ARENA_DIR
  value: "/etc/model-catalog/spark-arena"
- name: PROMETHEUS_BASE_URL
  value: "http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090"
```

- [ ] **Step 2: Mount Spark Arena recipes**

In `deployment.yaml`, under `volumeMounts`, add:

```yaml
- name: spark-arena-recipes
  mountPath: /etc/model-catalog/spark-arena
  readOnly: true
```

Under `volumes`, add:

```yaml
- name: spark-arena-recipes
  configMap:
    name: model-catalog-spark-arena-recipes
```

- [ ] **Step 3: Add initial Spark Arena recipes ConfigMap**

Create `spark-arena-recipes.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: model-catalog-spark-arena-recipes
  namespace: hermes
  labels:
    app.kubernetes.io/part-of: model-catalog-mcp
data:
  lfm25-350m.yaml: |
    id: lfm25-350m
    source: spark-arena
    model:
      id: LiquidAI/LFM2.5-350M
      revision: null
      quantization: null
      gated: false
      license: apache-2.0
    runtime:
      image: vllm/vllm-openai:latest
      args:
        - --language-model-only
        - --load-format=fastsafetensors
        - --attention-backend=flash_attn
        - --enable-prefix-caching
        - --enable-chunked-prefill
        - --enable-auto-tool-choice
        - --tool-call-parser=hermes
        - --trust-remote-code
        - --dtype=auto
      env:
        - name: VLLM_MARLIN_USE_ATOMIC_ADD
          value: "1"
      tensor_parallel: 1
      max_model_len: 32768
      dtype: auto
      tool_call_parser: hermes
      reasoning_parser: null
    hardware:
      gpu_class: gb10
      gpu_count: 1
      estimated_vram_gb: 4
      gpu_memory_utilization: 0.8
    serving:
      namespace: ai
      service_name: lfm25-350m
      replicas: 1
      storage_mode: model-cache
      ingress_policy: cluster-local
    provenance:
      source: spark-arena
      path: spark-arena-recipes.yaml
      commit: null
```

- [ ] **Step 4: Add ConfigMap to kustomization**

In `kustomization.yaml`, add:

```yaml
- spark-arena-recipes.yaml
```

- [ ] **Step 5: Expand RBAC**

In `rbac.yaml`, update rules:

```yaml
# Runtime recipe/deployment ConfigMaps
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list", "watch", "create", "patch", "update", "delete"]
# Nodes for capacity reports
- apiGroups: [""]
  resources: ["nodes"]
  verbs: ["get", "list", "watch"]
# InferenceServices lifecycle
- apiGroups: ["serving.kserve.io"]
  resources: ["inferenceservices"]
  verbs: ["get", "list", "watch", "create", "delete"]
```

Keep the existing jobs, pods, logs, events, status, and secret rules.

- [ ] **Step 6: Render manifests locally**

Run:

```bash
cd /home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources
kubectl kustomize .
```

Expected: output includes `model-catalog-spark-arena-recipes`, updated deployment env vars, and expanded RBAC.

- [ ] **Step 7: Commit Task 9**

Run:

```bash
cd /home/saavy/dev/homelab/sb
git status
git add argocd/clusters/superbloom/infra/model-catalog-mcp/resources/deployment.yaml argocd/clusters/superbloom/infra/model-catalog-mcp/resources/rbac.yaml argocd/clusters/superbloom/infra/model-catalog-mcp/resources/kustomization.yaml argocd/clusters/superbloom/infra/model-catalog-mcp/resources/spark-arena-recipes.yaml
git diff --cached
git commit -m "feat: configure runtime model catalog state"
```

---

## Task 10: End-to-end dry run and live smoke test

**Files:**

- No source edits unless validation fails.

- [ ] **Step 1: Run full Rust validators**

Run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
```

Expected: all pass.

- [ ] **Step 2: Build model-catalog MCP image**

Use the existing repository image build flow. If there is no dedicated script, run:

```bash
cd /home/saavy/dev/homelab/homelab-mcp
cargo build --release -p model-catalog-mcp
```

Expected: release build succeeds.

- [ ] **Step 3: Apply manifests via Argo or kubectl dry-run**

Run:

```bash
cd /home/saavy/dev/homelab/sb/argocd/clusters/superbloom/infra/model-catalog-mcp/resources
kubectl apply --dry-run=server -k .
```

Expected: server dry-run succeeds.

- [ ] **Step 4: Smoke test MCP tools from inside cluster**

After the new image is deployed, use Hermes or MCP client to call:

```text
search_spark_arena_recipes({"query":"lfm"})
import_spark_arena_recipe({"id":"lfm25-350m","created_by":"hermes-smoke-test"})
search_recipes({"query":"lfm"})
capacity_report({"target":"spark"})
estimate_fit({"recipe_id":"lfm25-350m","target":"spark"})
plan_deploy({"recipe_id":"lfm25-350m","runtime_args":["--max-model-len","8192"]})
```

Expected:

- search returns `lfm25-350m`
- import creates a runtime recipe ConfigMap
- merged recipe search sees imported recipe
- capacity report returns Spark node readiness and active model list
- estimate fit returns a fit verdict and risks
- plan includes runtime override args

- [ ] **Step 5: Do not deploy DS4 until Spark is healthy**

Before testing DS4:

```bash
kubectl get node gx10-98a5 -o wide
tailscale ping --timeout=5s --c 3 spark
```

Expected:

- Kubernetes node is `Ready`
- Tailscale ping succeeds

If either fails, stop. Do not run DS4 deploy tests.

- [ ] **Step 6: Commit any validation fixes**

If validation required source changes, commit them in the repo where they were made:

```bash
git status
git add <changed-files>
git diff --cached
git commit -m "fix: stabilize model catalog v2 smoke test"
```

Expected: no unrelated files staged.

---

## Self-Review

- Spec coverage: the plan covers runtime args/env/resources, policy validation, runtime model state, Spark Arena search/import, capacity reporting, lifecycle tools, KServe rendering, RBAC, and smoke tests.
- Placeholder scan: no implementation step depends on unspecified behavior; every created file has concrete contents or exact code blocks.
- Type consistency: `DeployOverrides`, `RuntimeRecipeRecord`, `RuntimeDeploymentRecord`, `CapacityReport`, and MCP param names are consistent across tasks.
- Scope check: direct vLLM and Mac mini targets are represented by renderer-mode types but not implemented as runtime backends in this plan; the approved spec explicitly allows them after the KServe path.
