# Upstream Boundaries — Core File Area Definition

> This document defines the files and directories that belong to the **upstream core area** of NanoClaw.
> It serves as reference material for the architecture review skill to judge the "risk of upstream conflicts upon direct modification".

---

## Core Source (Critical Warning on Modification)

Files in the paths below are actively developed upstream, so modifying them directly carries a very high probability of causing Merge Conflicts during a merge via the `update` skill.

```
src/                           # Entire host-side source code
├── index.ts                   # Main orchestrator
├── channels/whatsapp.ts       # WhatsApp channel
├── ipc.ts                     # IPC communication
├── router.ts                  # Message routing
├── config.ts                  # Configuration constants
├── types.ts                   # TypeScript interfaces
├── db.ts                      # SQLite database
├── group-queue.ts             # Per-group queues
├── container-runner.ts        # Container spawner
├── container-runtime.ts       # Runtime abstraction (Docker/Apple)
├── mount-security.ts          # Mount security verification
├── task-scheduler.ts          # Scheduled job scheduler
├── logger.ts                  # Logging
└── whatsapp-auth.ts           # WhatsApp authentication

container/agent-runner/        # In-container agent runtime
├── src/index.ts               # Agent query loop
└── src/ipc-mcp-stdio.ts       # MCP server (IPC communication)

container/Dockerfile           # Container image build definition
```

## User Extension Area (Modifications Allowed, No Warnings)

The paths below are user areas that can be freely added to or modified.

```
.claude/skills/                # Host management skills (User addable)
container/skills/              # Global container skills (User addable)
groups/                        # Per-group memory and config
config/groups/                 # Per-group mount/env config
data/sessions/                 # Runtime session data
.env                           # Environment variables (local only)
```

## Caution Area (Medium Warning on Modification)

These files can be modified directly, but there is a risk of them being overwritten during upstream updates.

```
package.json                   # Risk of conflict if dependencies change
tsconfig.json                  # Risk of conflict if build config changes
CLAUDE.md                      # Root level Claude context
container/build.sh             # Build script
```

## PR Readiness Criteria

| Change Type | src/ Mod | skills/ Mod | PR Suitability |
|:---|:---:|:---:|:---|
| Bug Fix | ✅ | - | ✅ Can submit PR |
| Security Fix | ✅ | - | ✅ Can submit PR |
| Code Simplification | ✅ | - | ✅ Can submit PR |
| New Feature Addition | ❌ | ✅ | ✅ Submit PR as a skill |
| Core Mod for New Feature | ❌ | ❌ | ❌ Will be rejected |
| Personal Env Specific | ❌ | - | ❌ Local only |
