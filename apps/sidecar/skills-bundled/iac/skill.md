# Skill — Infrastructure as Code (AWS CDK · Terraform)

**Activate when**: any infra agent runs, OR the project provisions cloud
resources of any kind.

All infrastructure is code, reviewed, versioned, and reproducible. Nothing
created by hand in a console survives. For Harry's TypeScript/AWS stack the
default is **AWS CDK**; reach for **Terraform** when you need multi-cloud or
portability.

## IaC principles

- **Declarative + idempotent**: describe desired state; the same code
  applied twice yields the same result. No imperative `aws cli` setup
  scripts as the source of truth.
- **Reproducible**: a fresh account/region rebuilds the whole stack from
  the repo. If you can't `cdk deploy` / `terraform apply` from zero, it
  isn't IaC.
- **Reviewed**: infra changes go through PR with a **plan/diff** attached
  (`cdk diff`, `terraform plan`). Never apply un-reviewed.
- **Small blast radius**: split stacks by lifecycle and ownership so a
  change to compute can't accidentally destroy the database.

## AWS CDK (default for the TS/AWS stack)

- **TypeScript-first**: real language = loops, conditionals, types,
  reuse, IDE autocomplete, unit-testable infra. Synthesizes to
  CloudFormation.
- **Construct levels**:
  - **L1 (`Cfn*`)** = raw 1:1 CloudFormation resources. Use only for
    coverage gaps.
  - **L2** = curated constructs with sane defaults, IAM grants, and
    helper methods (`bucket.grantRead(fn)`). The everyday level.
  - **L3 / patterns** = opinionated multi-resource solutions
    (`aws-apigateway`, `ecs-patterns`). Use when they fit; eject to L2
    when you need control.
- **Stacks & environments**: one app, multiple stacks; parametrize by
  environment with **CDK context** / props, not copy-paste. Pass
  `env: { account, region }` explicitly per stage. Drive dev/staging/prod
  from config, not branches of code.
- **Aspects** for cross-cutting policy (e.g. enforce encryption, tagging,
  retention) across the whole tree; pair with **cdk-nag** to fail synth
  on insecure resources.
- **Bootstrap** each account/region once (`cdk bootstrap`); the toolkit
  stack holds the asset bucket + deploy roles. Use **CDK Pipelines** or
  GitHub Actions (see `cicd-deploy`) for deploys, not laptops.
- Test infra: assertion tests (`Template.fromStack`) and snapshot tests.

## Terraform (multi-cloud / portability)

- **HCL** declarative; provider-agnostic. Choose it when targets span AWS
  + Cloudflare/GCP, or when an org standard mandates it.
- **Modules**: factor reusable components (`modules/vpc`, `modules/ecs`);
  version and pin module + provider versions (`required_providers`,
  `~>`). Root modules compose, child modules implement.
- **Remote state backend**: **S3 bucket + DynamoDB table for state
  locking** (or native S3 lockfile / Terraform Cloud / HCP). State holds
  secrets in plaintext → bucket must be private, encrypted (SSE-KMS),
  versioned, access-logged.
- **Workspaces vs separate state**: prefer **separate backends/state per
  environment** (dev/staging/prod) for hard isolation; workspaces are fine
  for lightweight ephemeral variants but share backend config.
- **plan/apply discipline**: `plan` in CI on PR (post the diff), `apply`
  only on merge to the protected branch via the pipeline. Never
  `apply -auto-approve` from a laptop against prod.
- Import existing resources (`terraform import` / `import` blocks) instead
  of leaving clickops drift unmanaged.

## State management & drift

- **State is the source of truth** the tool reconciles against. Protect it:
  remote, locked, encrypted, versioned. Losing/corrupting state is the
  worst-case incident.
- **Drift** = reality diverged from code (someone clicked in the console).
  Detect with `cdk diff` / `terraform plan` (or drift detection in
  CloudFormation / Terraform Cloud) on a schedule; reconcile by codifying
  the change or reverting it. Don't let drift accumulate.

## Secrets handling

- **Never** put secrets in IaC code, `.tfvars`, CDK context, or state you
  commit. Reference them: create the **Secrets Manager / SSM SecureString**
  resource in IaC (or mark it externally managed) and have apps read at
  runtime; pass only ARNs/names through IaC.
- Mark Terraform outputs/variables `sensitive = true`; remember state still
  stores the value in plaintext — hence encrypted remote state.

## Environment separation

- Distinct **AWS accounts** per environment (dev/staging/prod) is the gold
  standard — hard isolation of blast radius, billing, and IAM. At minimum,
  fully separate stacks/state and naming.
- No shared mutable resources across envs. Promote artifacts/config, not
  hand edits.

## Tagging strategy

- Mandatory tags on every resource: `Project`, `Environment`, `Owner`,
  `CostCenter`/`Client`, `ManagedBy=cdk|terraform`. Enforce via CDK Aspects
  / Terraform `default_tags`. Tags drive cost allocation, ownership, and
  cleanup. Untagged resources are unaccountable spend.

## Anti-patterns to refuse

1. **Clickops then losing it** — resources created by hand in the console
   that no code describes. Either codify it (import) or it doesn't exist.
2. **Committing state files or secrets** — `terraform.tfstate`,
   `*.tfvars` with secrets, `cdk.context.json` with sensitive values in
   git. State is plaintext secrets; keep it in encrypted remote backends
   only.
3. **No remote state lock** — concurrent applies corrupt state. S3 +
   DynamoDB lock (or equivalent) is mandatory for any shared state.
4. **Monolithic single stack** — one giant stack/state for the whole org
   means every change risks the database and every plan is huge. Split by
   lifecycle and ownership.
5. **Hardcoded account IDs / regions** — breaks reuse and leaks
   environment specifics. Parametrize via context/variables/`env`.

## Common gotchas

1. **CDK stateful-resource replacement** — changing certain properties
   (a bucket name, an RDS identifier) triggers
   replace-and-delete. Set `RemovalPolicy.RETAIN` / `deletionProtection`
   on stateful resources and check `cdk diff` for "(will be destroyed)".
2. **Terraform `apply` deletes on rename** — renaming a resource block
   changes its address and Terraform destroys+recreates it. Use `moved`
   blocks (or `terraform state mv`) to preserve the resource.
3. **CDK bootstrap version drift** — an outdated bootstrap stack causes
   cryptic deploy failures after a CDK upgrade. Re-bootstrap when the CLI
   warns about version mismatch.
4. **Drift silently invalidates plans** — a console edit makes the next
   `apply` revert a teammate's manual fix (or vice versa). Run drift
   detection regularly; treat the console as read-only in shared envs.
5. **Provider/construct version float** — unpinned versions make builds
   non-reproducible and surprise-break on upgrade. Pin and bump
   deliberately via PR.

## Reference repos

See `sources.json`. Highlights: aws/aws-cdk, cdk-patterns/serverless,
cdklabs/cdk-nag, hashicorp/terraform, terraform-aws-modules,
aws-ia (AWS Terraform modules).
