# Optional Playwright session workflow

The public REST API and official MCP are preferred for supported operations. This
optional browser layer helps discover GraphQL query shapes used by the Secureframe UI.
It is based on the author's earlier local browser workflow, rebuilt with a GraphQL
parser and strict metadata-only output. No saved session or account data is bundled.

## Setup

Requires Node 22.20+ and a locally installed Playwright Chromium browser:

```sh
npm ci
npx playwright install chromium
```

Use a fresh private directory **outside your project and the installed skill** for
session files and captures. POSIX permissions must be 0700 for directories and 0600
for existing state files. On Windows, use a user-private directory and appropriate ACLs;
POSIX mode checks do not enforce Windows ACLs. Never commit, upload or share state.

```sh
node browser/session.cjs login --state /absolute/private/session/state.json
node browser/session.cjs capture --state /absolute/private/session/state.json --out /absolute/private/captures/run.json --page /tests
```

The first command opens a fresh browser. The user completes login and MFA themselves;
press Enter to save session state. Existing session/output files are never overwritten.
A saved state is not proof of successful login, and expired sessions require a new login.

## What capture allows

- Fixed navigation pages: `/dashboard`, `/tests`, `/controls`, `/integrations/connected`.
- Static scripts, styles, images and fonts under same-origin `/assets/`, `/static/` or `/_next/` paths with recognized extensions. External asset hosts are blocked.
- GraphQL GET/POST only when a parsed document unambiguously contains queries only.
- Captured fields: endpoint class (`/graphql`), method, allowed/blocked, operation type,
  batch size and schema root field names. No operation names, aliases, variable values,
  raw URLs, headers, request/response bodies, DOM, screenshots, cookies or storage state.

Capture blocks mutations, subscriptions, mixed batches, ambiguous/persisted queries,
unknown API requests, HTTP redirects, service workers and WebSockets. There is no `--allow-writes`
escape hatch. A page may not load fully under this policy. Do not interpret blocked
traffic as a completed action or a zero-count capture as an authentication success.
Manual-login mode is interactive and unrestricted to permit identity-provider login;
users should only perform login there. GraphQL query is a protocol classification,
not a guarantee that arbitrary server resolvers have no side effects.

## Tests

```sh
npm test
npm run test:browser
```

The browser test uses a synthetic local HTTP app and real Chromium, verifying that a
query reaches the server while a mutation and unknown GET API do not. It never uses
a real Secureframe session. Live authenticated UI capture remains unverified for this
standalone distribution. [Playwright docs](https://playwright.dev/docs/auth) explain
why storage state must be treated as a credential.
