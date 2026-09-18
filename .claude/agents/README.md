# Claude Code subagents for Syntha V2

Each file in this directory defines a specialised agent with its own system prompt,
tool set and context window. Claude Code selects one automatically when the task
matches its `description`, or you can call it by name:

```
> use the architecture-guardian to check this change
> ask acceptance-runner to prove the readiness slice
```

| Agent | Purpose |
|---|---|
| `architecture-guardian` | Keeps `ARCHITECTURE.md` the single source of truth; blocks second truths |
| `ods-guardian` | Omnidata Design System v1 roles, RU/EN contract, no new visual dialects |
| `acceptance-runner` | Runs verify / postgres / smoke / live acceptance and reports honest evidence |
| `reviewer` | Independent second reader; APPROVE or CHANGES_REQUESTED |

## Boundaries

`../settings.json` encodes the `AGENTS.md` rules as enforceable tool permissions.
In particular agents cannot: run `psql` (business mutations belong to the `/v2`
runtime), edit `db/migrations/**` (applied migrations are immutable), push to
`main`, merge a pull request, or modify `.github/workflows/**` and `.claude/**`.

Agents work on `agent/*` branches and open pull requests. Merging is the owner's
decision, after CI is green.

## Local MCP servers

A local `.mcp.json` (not committed) can add `postgres-dev` (port 5434, read-only
inspection), `postgres-test` (5435), `playwright` and `context7`. The read-only
Postgres server is for inspecting schema and lineage — never for business mutation.
