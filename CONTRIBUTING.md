# Contributing

## Local checks

Use Node.js 22 and Docker Engine with access to the public Docker Hub registry. This project has no external npm dependencies, so `npm install` and `npm ci` are not required.

Before opening a pull request, run:

```sh
npm test
npm run format:check
npm run build
git diff --exit-code -- workflows/
npm run test:workflow
npm run test:receiver
```

Check committed workflow artifacts **before** building, otherwise rebuilding could hide stale artifacts. If `format:check` reports stale JSON files, regenerate them with `npm run build`, review the diff and commit those files with the corresponding source change. Repeat the checks from a clean working tree.

Each integration command first pulls the official n8n 2.43.7 image pinned by its registry digest in `scripts/test_image.cjs`. Pull failure stops validation. Integration containers have external networking disabled, disposable databases, read-only test inputs and fake Telegram credentials. The host needs network access to pull the image; this does not isolate all code in a pull request from the runner's network.

`npm run probe` consults the real source and is **not** part of contribution CI. Do not use real Telegram credentials in tests. Benchmarks are also outside required CI.

## Source and reference changes

Edit source files and regenerate workflows through the official build. Do not make lasting changes only in generated workflow JSON.

Preserve reference results and source hashes when changing implementation without changing behavior. Update references only for an intentional behavior change described in the pull request, and explain the expected differences. Do not replace references solely to make a failing test pass. Keep existing memory regression tests when present; contribution CI runs the whole `npm test` suite, without selecting or skipping individual tests.

Never commit tokens, private keys, `.env` files, n8n databases, exported credentials or installation-specific workflow exports. Use fake values in fixtures and redact sensitive content from screenshots or logs.

## Contribution CI

The `Contribution CI` workflow runs on pull requests targeting `main` and pushes to `main`. Its jobs use disposable GitHub-hosted Ubuntu 24.04 runners:

| Check | Purpose | Timeout |
| --- | --- | --- |
| `ci-unit` | Full local test suite, source/artifact validation and reproducible workflow build | 10 minutes |
| `ci-workflows` | Complete controlled workflow integration suite | 20 minutes |
| `ci-receiver` | Custom polling node integration with simulated Telegram | 10 minutes |
| `ci-required` | Require all three test jobs to succeed | 2 minutes |

`ci-required` does not check out or execute repository code. It evaluates only the three upstream job results. Failed, skipped, cancelled or missing results do not pass. A cancelled workflow must not be treated as a successful required check.

New commits to a PR cancel superseded runs. There are no path filters, so documentation-only changes also receive the required checks. Actions are pinned to reviewed full commit SHAs. The Node.js test runtime is selected separately as version 22.

CI has only `contents: read`. Checkout does not persist authentication credentials. No secrets, OIDC, production environment, Azure credentials, package publication, reusable artifacts or caches are used. Tests have access to the disposable runner and its Docker daemon; **unprivileged means no production permissions**, not a sandbox against a runner administrator.

A passing PR is not authorization to deploy. Do not attach production access to this workflow or consume untrusted PR artifacts in a future privileged workflow. Do not execute PR code through `pull_request_target`, `workflow_run` or comment-triggered privileged workflows.

## Review process

Open a PR against `main` and describe the problem, change, tests and any intentional reference updates. The maintainer reviews external changes before merging, especially changes to CI, Docker configuration, validation scripts and test references. `CODEOWNERS` requests that review; it does not by itself enforce approvals or branch protection.

A maintainer must inspect external PR changes before approving the Actions run. Do not approve solely because the workflow name looks familiar: the contribution may change both tests and the workflow itself.

## GitHub administrator checklist

These controls are configured on GitHub, not by committing YAML:

- [ ] Settings → Actions → General: require approval for **all external contributors**.
- [ ] Set default workflow permissions to read-only; disable Actions creating or approving pull requests.
- [ ] Keep runners GitHub-hosted; do not attach the production VM or another self-hosted runner to contribution jobs.
- [ ] Open the initial validation PR and obtain a real `ci-required` result before configuring it as required.
- [ ] Protect `main`: require a pull request, require `ci-required` from GitHub Actions, require up-to-date branches, and apply the rule to administrators as well.
- [ ] Block force pushes and branch deletion. Do not require a second human approval for the sole maintainer's own PRs.
- [ ] Verify an external fork PR waits for approval before executing.
- [ ] Verify a new PR commit cancels the older run and its cancelled status does not satisfy required checks.
- [ ] Verify a deliberately failing test and a stale generated workflow block the validation PR, then remove those temporary changes before merging.

Changing these settings requires repository administration access. Report each item as verified or pending; a local test cannot prove the remote repository configuration.
