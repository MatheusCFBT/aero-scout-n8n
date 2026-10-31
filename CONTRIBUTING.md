# Contributing

Use Node.js 22+. The application has no external npm dependencies. Unit tests do not need installation.
Integration tests require Node.js 22.22+, Docker and `npm ci` for development dependencies.

Edit the source files and regenerate the workflows through the official build:

```sh
npm test
npm run test:integration
npm run format:check
npm run build
git diff -- workflows/
```

Check generated artifacts before building. If they are stale, regenerate them with
`npm run build`, review the changes and commit them with the source changes.
Do not make lasting changes only in generated workflow JSON.

Unit tests live in `test/unit` and run with `npm test`, without additional dependencies.
Use small inputs and explicit expected outputs to validate public method behavior.
Unit tests simulate network, storage and time boundaries without Docker.
Integration tests use real n8n containers, filesystem, SQLite and HTTP, simulating only
external Google and Telegram endpoints. Never use real credentials or production data.
See the README for integration prerequisites. An unavailable Docker daemon must fail validation.
Do not add historical snapshots, source hashes or assertions about internal code layout.
Formatting and generated-artifact checks remain separate from behavior tests.

Never commit tokens, private keys, databases or installation-specific workflow exports.
Describe intentional behavior changes and any manual validation in the PR.
