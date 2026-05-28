# Skill — CI/CD & Deploy (GitHub Actions · OIDC · CodeDeploy · Lambda aliases)

**Activate when**: any deploy/delivery agent runs, OR the project needs a
pipeline.

A pipeline that compiles is not a pipeline. **A deploy must end with a
verified, running app** — build, test, gate, deploy, then **smoke test the
live environment**. "Deploy real, no solo compilar." Everything below is for
2026 with keyless AWS auth as the baseline.

## Pipeline design

- **GitHub Actions is primary.** Mention **AWS CodePipeline / CodeBuild**
  when the org wants an AWS-native pipeline, and **Codemagic** for mobile
  (Flutter/iOS/Android signing, TestFlight/Play). Pick one delivery tool
  per repo; don't split logic across two.
- **Stages, in order**: `build → test → gate → deploy → smoke → (promote)`.
  Each gate must be able to **stop** the pipeline. A green build with red
  tests must never reach deploy.
- **Triggers**: PR runs build+test+plan (no deploy); merge to the protected
  branch deploys to staging; a tag/release or manual approval promotes to
  prod. Protected branch + required checks enforce this.

## Build · test · gate

- **Build**: pin toolchain versions; produce an **immutable artifact**
  (container image, Lambda zip, built bundle) once and promote that exact
  artifact through environments — never rebuild per stage.
- **Test gate**: unit + integration; lint + typecheck; fail fast. For IaC,
  run `cdk diff` / `terraform plan` and post it on the PR.
- **Security gate**: dependency audit, secret scanning, SAST, and
  cdk-nag/tfsec for infra. Treat high-severity as blocking.
- **Artifact caching**: cache deps (`actions/cache` keyed on lockfile
  hash), Docker layers (buildx + registry cache / GHA cache), CDK/TF
  provider downloads. Restore exact, invalidate on lockfile change.

## OIDC — keyless AWS auth (mandatory)

- Use **GitHub OIDC** to assume an AWS IAM role
  (`aws-actions/configure-aws-credentials` with `role-to-assume`,
  `permissions: id-token: write`). **No long-lived AWS access keys in CI
  secrets — ever.**
- Scope the role's trust policy to the specific repo + branch/environment
  (`token.actions.githubusercontent.com:sub`) and least-privilege the
  permissions. Separate roles per environment (staging role can't touch
  prod).
- Other CI secrets (3rd-party tokens) live in GitHub Environments secrets
  with required reviewers on prod; never echo them to logs.

## Real deploy + verification (the core)

- **Deploy the artifact** to the target (CDK/TF apply, image push +
  service update, Lambda publish). Then **prove the app actually runs**:
  - **Smoke tests post-deploy**: hit real health/critical endpoints
    against the deployed URL, assert 2xx + expected payload, check a key
    user path. Run **after** traffic is (or before it's fully) shifted.
  - Validate the new version is serving (version header, `/health`
    reporting the new build SHA), not the old one.
  - A pipeline that "succeeds" without ever calling the running app is
    broken. This is the #1 thing to refuse.

## EC2 deploys — blue/green & canary (CodeDeploy/SSM)

- **AWS CodeDeploy** drives EC2/ASG rollouts:
  - **Blue/green**: provision a new fleet, shift the ALB target group,
    keep blue for instant rollback. Safest for stateless web tiers.
  - **Canary / linear in-place**: `CodeDeployDefault.OneAtATime` or
    canary configs shift a slice first.
  - Hooks (`BeforeAllowTraffic` / `AfterAllowTraffic` in `appspec.yml`)
    run the smoke tests; a failed hook **auto-rolls-back**.
- **SSM** for fleet-wide command execution / config without SSH; use SSM
  Run Command or State Manager rather than baking secrets into AMIs.

## Lambda deploys — versioned aliases + traffic shifting

- Publish a **version**, point an **alias** (`prod`) at it. API GW /
  triggers reference the alias, not `$LATEST`.
- **Traffic shifting**: CodeDeploy `Canary10Percent5Minutes` /
  `Linear10PercentEvery1Minute` on the alias, with **CloudWatch alarms**
  (errors, p99) that **auto-rollback** the alias on breach. Add
  pre/post-traffic hook Lambdas for smoke checks.

## Environment promotion

- Promote the **same built artifact** dev → staging → prod; vary only
  config/secrets per environment. Prod requires a **manual approval**
  (GitHub Environment protection / CodePipeline approval) and runs the
  same smoke suite it ran on staging.

## Rollback strategy

- Every deploy has a **defined, fast rollback**: blue/green target-group
  swap back, Lambda alias re-point to prior version, redeploy previous
  immutable artifact, or `cdk deploy` of the prior commit. Automate it on
  smoke/alarm failure. **No rollback path = not production-ready.**

## Anti-patterns to refuse

1. **Deploy that only builds and never verifies the running app** — the
   defining failure. End every pipeline with smoke tests against the live
   environment.
2. **Long-lived AWS access keys in CI secrets** — use **GitHub OIDC** +
   assumed role. Stored `AWS_ACCESS_KEY_ID`/`SECRET` is a refusal.
3. **No rollback path** — if you can't revert in minutes, you can't deploy
   to prod. Define it before the first prod deploy.
4. **Manual prod deploys** (laptop `cdk deploy`, console clicks, scp) —
   prod changes go through the reviewed pipeline only.
5. **Skipping the smoke test after deploy** — "tests passed in build"
   doesn't prove the deployed env serves traffic with the right version.

## Common gotchas

1. **OIDC trust too broad** — a `sub` wildcard lets any branch/repo assume
   the role. Pin to `repo:org/name:ref:refs/heads/main` (or environment)
   and least-privilege actions.
2. **Lambda alias not wired to triggers** — shifting traffic on the alias
   does nothing if API GW/EventBridge still invoke `$LATEST` or a fixed
   version. Point integrations at the alias.
3. **Smoke test hits the build runner, not the deployed URL** — testing
   `localhost` or a mock proves nothing. Assert against the real
   environment endpoint with the new build's version marker.
4. **Rebuilt artifact per stage** — rebuilding for prod means you ship an
   untested binary. Build once, promote the identical artifact.
5. **Mobile signing/secrets in plaintext** — Codemagic/Actions need
   keystores and provisioning profiles in encrypted secret stores (code
   signing identities), never committed; cache pods/gradle to keep builds
   fast.

## Reference repos

See `sources.json`. Highlights: aws-actions/configure-aws-credentials,
actions/cache, AWS CodeDeploy examples (appspec + hooks), Lambda
CodeDeploy traffic-shifting samples, Codemagic sample workflows.
