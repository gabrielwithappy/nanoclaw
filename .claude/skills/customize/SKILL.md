---
name: customize
description: Add new capabilities or modify NanoClaw behavior. Use when user wants to add channels (Telegram, Slack, email input), change triggers, add integrations, modify the router, or make any other customizations. This is an interactive skill that asks questions to understand what the user wants.
---

# NanoClaw Customization

This skill helps users add capabilities or modify behavior. Use AskUserQuestion to understand what they want before making changes.

## Workflow

1. **Architecture pre-check** - Before planning, read `.claude/skills/architecture-review/references/upstream-boundaries.md` and determine whether the requested change touches core source (`src/`, `container/agent-runner/`) or user-extension areas (`.claude/skills/`, `container/skills/`, `groups/`, `config/`). If core source modification is needed, warn the user about upstream update risk and recommend skill-based alternatives when possible. Reference `CONTRIBUTING.md`: features must be skills; only bug/security/simplification changes are accepted as source modifications.
2. **Understand the request** - Ask clarifying questions
3. **Plan the changes** - Identify files to modify, noting which are core vs extension
4. **Implement** - Make changes directly to the code
5. **Architecture post-check** - After implementation, run the architecture review checks from `.claude/skills/architecture-review/references/review-checklist.md` against modified files. Report any upstream alignment issues or structural violations to the user.
6. **Test guidance** - Tell user how to verify

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/whatsapp.ts` | WhatsApp connection, auth, send/receive |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/types.ts` | TypeScript interfaces (includes Channel) |
| `src/config.ts` | Assistant name, trigger pattern, directories |
| `src/db.ts` | Database initialization and queries |
| `src/whatsapp-auth.ts` | Standalone WhatsApp authentication script |
| `groups/CLAUDE.md` | Global memory/persona |

## Common Customization Patterns

### Adding a New Input Channel (e.g., Telegram, Slack, Email)

Questions to ask:
- Which channel? (Telegram, Slack, Discord, email, SMS, etc.)
- Same trigger word or different?
- Same memory hierarchy or separate?
- Should messages from this channel go to existing groups or new ones?

Implementation pattern:
1. Create `src/channels/{name}.ts` implementing the `Channel` interface from `src/types.ts` (see `src/channels/whatsapp.ts` for reference)
2. Add the channel instance to `main()` in `src/index.ts` and wire callbacks (`onMessage`, `onChatMetadata`)
3. Messages are stored via the `onMessage` callback; routing is automatic via `ownsJid()`

### Adding a New MCP Integration

Questions to ask:
- What service? (Calendar, Notion, database, etc.)
- What operations needed? (read, write, both)
- Which groups should have access?

Implementation:
1. Add MCP server config to the container settings (see `src/container-runner.ts` for how MCP servers are mounted)
2. Document available tools in `groups/CLAUDE.md`

### Changing Assistant Behavior

Questions to ask:
- What aspect? (name, trigger, persona, response style)
- Apply to all groups or specific ones?

Simple changes → edit `src/config.ts`
Persona changes → edit `groups/CLAUDE.md`
Per-group behavior → edit specific group's `CLAUDE.md`

### Adding New Commands

Questions to ask:
- What should the command do?
- Available in all groups or main only?
- Does it need new MCP tools?

Implementation:
1. Commands are handled by the agent naturally — add instructions to `groups/CLAUDE.md` or the group's `CLAUDE.md`
2. For trigger-level routing changes, modify `processGroupMessages()` in `src/index.ts`

### Changing Deployment

Questions to ask:
- Target platform? (Linux server, Docker, different Mac)
- Service manager? (systemd, Docker, supervisord)

Implementation:
1. Create appropriate service files
2. Update paths in config
3. Provide setup instructions

## After Changes

After making changes or installing new skills, you MUST PROACTIVELY execute the necessary commands to apply the changes, rather than asking the user to do it. Use the `Bash` tool to run the appropriate commands:

**1. If you modified Container code (`container/agent-runner/`, `container/Dockerfile`):**
```bash
cd container && ./build.sh && cd ..
npm run build
docker ps -q --filter "name=nanoclaw-" | xargs -r docker stop || true && nohup systemctl --user restart nanoclaw > /dev/null 2>&1 &
```

**2. If you modified Host code (`src/`):**
```bash
npm run build
docker ps -q --filter "name=nanoclaw-" | xargs -r docker stop || true && nohup systemctl --user restart nanoclaw > /dev/null 2>&1 &
```

**3. If you only added/modified Skills (`.claude/skills/`, `container/skills/`):**
To ensure old zombie containers don't conflict and the master daemon reads the new skills, perform a safe restart without needing a full rebuild:
```bash
docker ps -q --filter "name=nanoclaw-" | xargs -r docker stop || true && nohup systemctl --user restart nanoclaw > /dev/null 2>&1 &
```

**4. Preventing Setup/Authentication Hallucinations:**
If you just helped the user set up authentication for a new tool or integration (like Google Workspace, a Database, or any external service), the AI context history will be full of "setup instructions". This often causes the agent running in the container to "hallucinate" that the setup is still ongoing or required, and it may respond to the user with setup instructions instead of actually executing the tool.
To prevent this, you **MUST explicitly update the agent's memory (`groups/main/CLAUDE.md` and `groups/global/CLAUDE.md`)** with a clear statement that the tool is fully authenticated and ready to use, and explicitly instruct the agent NOT to ask the user to authenticate.

Once you have executed the commands and made any necessary memory updates, verify the status using `systemctl --user is-active nanoclaw` and inform the user that the system was successfully restarted and the new skill/capability is ready to use in the chat.

## Example Interaction

User: "Add Telegram as an input channel"

1. Ask: "Should Telegram use the same @Andy trigger, or a different one?"
2. Ask: "Should Telegram messages create separate conversation contexts, or share with WhatsApp groups?"
3. Create `src/channels/telegram.ts` implementing the `Channel` interface (see `src/channels/whatsapp.ts`)
4. Add the channel to `main()` in `src/index.ts`
5. Tell user how to authenticate and test
