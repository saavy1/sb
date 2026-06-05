# Model Catalog v2 Design

## Goal

Build `model-catalog` into Hermes' bounded runtime control plane for local model serving.

Hermes should be able to search for model recipes, import new model definitions, tune runtime args/env/resources, deploy and stop models, and choose between several small models or one larger model based on live capacity. Hermes should not need a Git PR for routine model experimentation, and it should not be given arbitrary Kubernetes manifest access.

## Problem

The current model-catalog flow is too static:

- Recipes live in a Git-managed ConfigMap.
- New model experiments require repo edits, PRs, image/config rollouts, or manual YAML.
- Recipe runtime args were not reliably forwarded into rendered KServe resources.
- Manual manifest bypasses can miss policy details such as required GPU tolerations.
- Failed heavyweight model startup can destabilize Spark and leave the node unreachable.

The DS4 Flash incident exposed the core gap: Hermes needs runtime authority, but that authority must be typed, auditable, capacity-aware, and policy-bounded.

## Non-Goals

- Do not let Hermes apply arbitrary YAML.
- Do not make Git the source of truth for every imported model recipe.
- Do not require PR approval for normal model spin-up, arg changes, or runtime tuning.
- Do not replace Kubernetes/KServe entirely in this design.
- Do not solve host break-glass recovery here; that belongs to `host-daemon-mcp`.

## Architecture

```text
Hermes
  -> model-catalog MCP typed tools
      -> runtime model state store
      -> recipe import/search layer
      -> capacity oracle
      -> policy validator
      -> KServe/direct-vLLM renderer
      -> Kubernetes resources
```

### Ownership Split

Git owns stable infrastructure:

- model-catalog MCP code
- renderer logic
- policy defaults
- RBAC
- base deployment
- monitoring resources

Runtime state owns dynamic model operations:

- imported recipes
- runtime args/env overrides
- resource requests/limits
- active deployments
- deployment history
- readiness/failure state

## Runtime State Store

Use Kubernetes as the runtime state store instead of a separate database in v1.

Represent mutable model state with Kubernetes-native objects owned by model-catalog:

- `ModelRecipe`
- `ModelDeployment`
- `RuntimeProfile`

These can be implemented as CRDs later. For an initial implementation, they may be represented as ConfigMaps with strict schemas if that is faster, but the public MCP contract should be CRD-shaped from the start.

### ModelRecipe

Stores an imported or hand-authored model recipe.

Fields:

- `id`
- `source`
- `model_id`
- `model_path`
- `runtime`
- `default_args`
- `default_env`
- `hardware_requirements`
- `serving_defaults`
- `provenance`

`provenance` records where the recipe came from, such as Spark Arena search result, manual Hermes import, or Git baseline.

### ModelDeployment

Stores the desired and observed state for one model deployment.

Fields:

- `name`
- `recipe_id`
- `target`
- `runtime_args`
- `runtime_env`
- `resources`
- `status`
- `last_plan_digest`
- `created_by`
- `created_at`
- `failure_reason`

### RuntimeProfile

Defines policy-owned serving profiles.

Examples:

- `spark-vllm-small`
- `spark-vllm-medium`
- `spark-vllm-large`
- `superbloom-cpu`
- `mac-mini-mlx-small`

Runtime profiles define allowed images, target hosts, mount policy, default tolerations, default probes, resource ceilings, and renderer mode.

## Spark Arena Search And Import

Hermes needs first-class access to Spark Arena recipes.

Add MCP tools:

```text
search_spark_arena_recipes(query, filters)
show_spark_arena_recipe(id)
import_spark_arena_recipe(id, overrides)
```

The search tool returns enough metadata for Hermes to reason about fit before importing:

- recipe id
- model id
- parameter size
- quantization
- required runtime
- expected VRAM/RAM if available
- required args
- known caveats
- source URL or source identifier

The import tool converts an external recipe into a `ModelRecipe` runtime object after validation.

## Runtime Flexibility

Hermes may provide runtime-level overrides at deploy time:

- args
- env
- CPU and memory requests/limits
- GPU count
- context length
- served model name
- readiness timeout

Hermes may not override policy-owned fields:

- privileged mode
- host networking
- arbitrary host paths
- arbitrary container image outside allowlist
- arbitrary service account
- arbitrary namespace
- arbitrary node selector outside allowed targets

This keeps model serving flexible without turning Hermes into a raw cluster admin.

## Policy Validator

Every deployment goes through validation before rendering.

Required validations:

- image is allowlisted by `RuntimeProfile`
- host paths are allowlisted
- target node class is allowed
- GPU tolerations are rendered correctly
- resource requests and limits do not exceed profile ceilings
- model path is under an approved model root
- `--enable-auto-tool-choice` requires `--tool-call-parser`
- DeepSeek V4 Flash requires `--kv-cache-dtype fp8` for the current vLLM version
- dry-run apply succeeds before real apply

Validation should return actionable errors, not just reject.

Example:

```json
{
  "allowed": false,
  "reason": "enable-auto-tool-choice requires tool-call-parser",
  "suggested_args": ["--tool-call-parser", "hermes"]
}
```

## Capacity Oracle

Do not enforce "one GPU workload at a time." Spark should be able to run several small models or one larger model when real capacity allows.

Add MCP tools:

```text
capacity_report(target)
estimate_fit(recipe_id, target, runtime_overrides)
```

Inputs:

- Kubernetes allocatable/requested resources
- node readiness
- GPU operator/DCGM metrics
- vLLM metrics from active deployments
- pod readiness and restart state
- recent failure events

Outputs:

- free GPU memory estimate
- active model list
- requested CPU/memory/GPU
- observed GPU utilization
- observed GPU memory use
- fit verdict
- confidence level
- risks

Example:

```json
{
  "target": "spark",
  "fits": true,
  "confidence": "medium",
  "mode": "co-locate-small-model",
  "risks": ["no historical memory profile for this model"],
  "recommended_resources": {
    "cpu": "2",
    "memory": "16Gi",
    "gpu": 1
  }
}
```

Hermes decides what to deploy, but model-catalog supplies the evidence and refuses unsafe plans.

## Deployment Flow

Normal model launch:

```text
Hermes searches Spark Arena
  -> imports selected recipe
  -> asks capacity_report / estimate_fit
  -> creates deployment plan with runtime args/env/resources
  -> model-catalog validates policy
  -> model-catalog dry-runs render/apply
  -> model-catalog applies KServe/direct-vLLM resource
  -> model-catalog watches readiness
  -> status is recorded in runtime state
```

Failure handling:

- if readiness times out, mark deployment failed
- delete or scale down the failed deployment according to profile policy
- keep deployment history and failure reason
- do not retry indefinitely
- surface node health degradation as a deployment failure signal

## MCP Tool Surface

### Recipe Tools

```text
search_recipes(query)
show_recipe(recipe_id)
search_spark_arena_recipes(query, filters)
show_spark_arena_recipe(id)
import_spark_arena_recipe(id, overrides)
create_recipe(recipe)
update_recipe(recipe_id, patch)
delete_recipe(recipe_id)
```

### Planning Tools

```text
capacity_report(target)
estimate_fit(recipe_id, target, runtime_overrides)
plan_deploy(recipe_id, target, runtime_overrides)
validate_plan(plan_id)
```

### Deployment Tools

```text
apply_plan(plan_id)
deploy_model(recipe_id, target, runtime_overrides)
stop_model(deployment_name)
list_deployments(target)
deployment_status(deployment_name)
```

### Policy Tools

```text
list_runtime_profiles()
show_runtime_profile(profile_id)
explain_policy_denial(plan_id)
```

## KServe And Direct Runtime Targets

KServe remains useful for the Spark/k3s path and the cool factor of Kubernetes-native model serving.

The renderer should not assume every target is KServe. It should support target modes:

- `kserve`
- `direct-vllm`
- `external-openai-compatible`
- future `mac-mini-mlx`

This lets the Mac mini become useful for small STT/TTS/vision workloads without forcing it into K3s.

## Safety Model

Hermes can mutate model state through typed tools. It cannot mutate arbitrary cluster state.

Allowed:

- import recipe
- edit recipe args/env within policy
- deploy model
- stop model
- tune resources within profile ceilings
- choose among runtime profiles

Denied:

- raw manifest apply
- privileged containers
- arbitrary hostPath
- arbitrary image
- arbitrary namespace
- uncontrolled host networking
- unbounded retries

## Observability

Model-catalog should expose enough state for Hermes to reason about outcomes:

- active deployments
- plan digests
- rendered resource summary
- readiness events
- recent pod events
- node health summary
- DCGM/vLLM metrics used for fit estimation
- failure reasons

This avoids blind retries and makes postmortems easier.

## Migration Strategy

1. Fix the current renderer so recipe runtime args/env always reach rendered resources.
2. Add runtime override support to `plan_deploy`.
3. Add correct GPU toleration rendering in policy.
4. Add a runtime recipe store backed by Kubernetes objects.
5. Add Spark Arena search/import.
6. Add capacity reporting from Kubernetes, DCGM, and vLLM metrics.
7. Add readiness timeout and failed-deployment cleanup.
8. Add non-KServe target abstraction for direct vLLM and Mac mini later.

## Open Decisions

### CRDs vs ConfigMaps For V1

Recommendation: start with CRD-shaped Rust types and use ConfigMaps only if CRD plumbing slows down v1. Do not expose ConfigMap implementation details through MCP.

### Spark Arena Data Source

Recommendation: begin with whatever source Hermes can search reliably today, then normalize imported results into `ModelRecipe`. The MCP contract should not care whether the upstream data came from a Git repo, HTTP endpoint, local cache, or scraped index.

### Direct vLLM Timing

Recommendation: keep KServe as the first renderer target while Spark remains a K3s node, but design the renderer boundary so direct vLLM can be added without rewriting recipe/planning logic.

## Success Criteria

- Hermes can search Spark Arena recipes without a PR.
- Hermes can import a recipe into runtime state.
- Hermes can deploy a model with runtime args/env/resources.
- Recipe args/env are present in the rendered KServe resource.
- DS4 Flash plans include `--kv-cache-dtype fp8` or are rejected with a suggested fix.
- Auto tool choice plans are rejected unless `--tool-call-parser` is present.
- GPU taints get both required tolerations.
- Hermes can ask for a capacity report before deploying.
- Multiple small models are allowed when metrics indicate capacity.
- Failed deployments time out, clean up, and report actionable failure state.
- Hermes never needs arbitrary manifest apply for normal model operations.

## Self-Review

- Placeholder scan: no TBD/TODO placeholders remain.
- Internal consistency: Git owns stable infra, runtime state owns model experiments, and MCP remains the policy boundary throughout.
- Scope check: focused on model-catalog runtime autonomy; host break-glass and Hermes full config GitOps are separate efforts.
- Ambiguity check: Hermes may tune args/env/resources through typed tools, but raw manifest mutation is explicitly denied.
