---
name: Claude Code Architecture Reference
category: Engineering
icon: 🔬
status: active
persist: session
triggers:
  - claude code
  - agent loop
  - agentic loop
  - tool registry
  - skill system
  - context compaction
  - sub-agent
  - agentool
  - tool harness
  - claude architecture
  - leaked source
  - kratosui architecture
  - permissions
  - memory system
  - system prompt boundary
  - full compact
  - mailbox pattern
sources:
  - label: Leaked source mirror
    url: https://github.com/yasasbanukaofficial/claude-code
  - label: Architecture deep dive
    url: https://wavespeed.ai/blog/posts/claude-code-architecture-leaked-source-deep-dive/
  - label: Hidden features breakdown
    url: https://www.mindstudio.ai/blog/claude-code-source-code-leak-8-hidden-features/
  - label: Agentic patterns analysis
    url: https://kenhuangus.substack.com/p/the-claude-code-leak-10-agentic-ai
  - label: Sabrina Dev comprehensive analysis
    url: https://www.sabrina.dev/p/claude-code-source-leak-analysis
  - label: Varonis security breakdown
    url: https://www.varonis.com/blog/claude-code-leak
  - label: Bits Bytes Neural Networks analysis
    url: https://bits-bytes-nn.github.io/insights/agentic-ai/2026/03/31/claude-code-architecture-analysis.html
---

You have deep reference knowledge of the Claude Code internal architecture, revealed via the March 2026 source map leak from Anthropic's npm package (~512,000 lines of TypeScript). Use this skill when the user asks about agent design, agentic loops, skill systems, tool registries, memory, permissions, or how to build KratosUI features aligned with these patterns.

When in doubt about a specific implementation detail, cross-reference against the leaked source mirror:
https://github.com/yasasbanukaofficial/claude-code

---

## Core Architecture: 3 Layers

Claude Code separates concerns into three clean layers:

1. **Model Layer** — raw Anthropic API calls, streaming, token tracking, cost-aware model fallbacks
2. **Harness Layer** — agentic loop, flat tool registry, permission system, memory, skill injection. This is where all intelligence lives.
3. **UI Layer** — thin Ink/React terminal renderer. Intentionally disposable.

> Key principle: the UI is irrelevant. Build the harness first. The UI is just a viewport into the harness.

---

## The Agentic Loop (`query.ts` — 46,000 lines)

An async generator that runs until Claude signals completion:

```
while true:
  response = callLLM(messages)                    // stream
  if response.stop_reason == 'end_turn': break    // Claude decided it's done
  if response.stop_reason == 'tool_use':
    for each toolCall in response.toolUses:
      checkPermission(toolCall)                   // gate before every exec
      result = registry.execute(toolCall)         // run tool
      messages.push(toolResult(result))           // inject back into history
  // loop continues — Claude reasons over fresh results
```

Important details:
- Claude controls termination via `end_turn` — the harness never decides for it
- Tool results are injected as structured messages, not raw strings
- **Interleaved thinking**: Claude emits `<thinking>` blocks between tool calls. Stripped before re-injection but inform the next decision. Togglable.
- A **maximum iteration guard** (e.g. 10 turns) prevents runaway loops
- KratosUI equivalent: wrap `agent.run_stream()` in a `while True` loop in `agent.py`, break on plain text response

---

## Flat Tool Registry

All tools live in one flat list — no hierarchy, no special cases. Built-in tools:

| Tool | What it does | Permission |
|---|---|---|
| `BashTool` | Shell command execution | shell |
| `FileReadTool` | Read file contents | read |
| `FileWriteTool` | Write/create files | write |
| `FileEditTool` | Targeted in-place edits | write |
| `GlobTool` | File pattern matching | read |
| `GrepTool` | Content search across files | read |
| `WebSearchTool` | Live web search | network |
| `NotebookTool` | Jupyter notebook execution | write |
| `AgentTool` | Spawn a sub-agent | inherits |

Each tool self-declares three things:
1. **Zod input schema** — validated before every execution, never raw input
2. **Permission level** — declared by the tool itself, not set externally
3. **Structured error type** — typed errors the loop uses to decide retry vs. abort

> Key insight: `AgentTool` is just another registry entry. Sub-agents are not special — they are a tool call that returns a structured result.

---

## Skills System

Skills are NOT a separate dispatch layer. They work in two phases:

**Phase 1 — Index (always loaded, cheap):**
Only the skill name and description appear in the system prompt. No body content is burned into context by default.

**Phase 2 — Body (loaded on demand):**
When a skill is triggered, its full markdown body is appended to the dynamic section of the system prompt.

**System prompt structure:**
```
[STATIC SECTION — cached by Anthropic, free on repeat calls]
Core persona, base instructions, tool awareness
---- SYSTEM_PROMPT_DYNAMIC_BOUNDARY ----
[DYNAMIC SECTION — fresh each call, not cached]
Active skill bodies, current project state, git context, date
```

> Key rule: skills APPEND to the base prompt. They never replace it. Replacing the base prompt causes the agent to lose its identity and tool awareness during skill execution. This is a common mistake in naive skill implementations.

Skills survive Full Compact — their schemas are explicitly re-injected after context compression. They are never lost in long sessions.

---

## Sub-Agents & The Mailbox Pattern

When Claude calls `AgentTool`:
- A new agentic loop spawns with its own tool registry and isolated context
- The parent loop only receives the final structured result — never sees intermediate steps
- Multiple sub-agents can run in parallel

**Mailbox Pattern (safety):**
If a sub-agent needs to perform a destructive operation (delete, send email, lock/unlock), it cannot self-approve. It sends a request to the parent coordinator's mailbox and waits. The parent (or human) approves before execution continues.

This is how you get autonomous parallelism without runaway side effects.

KratosUI equivalent: a ClawdBot bedtime sub-agent handles all home automation steps in isolation, returns a summary. Destructive actions (e.g. locking front door) route through a UI confirmation gate.

---

## 3-Layer Memory System

| Layer | Content | When loaded |
|---|---|---|
| **Index** | Lightweight project/session summary | Always in context (cheap) |
| **Files** | Full file or data contents | Fetched on demand by tool call |
| **Transcripts** | Past conversation history | Retrieved via semantic search |

**Continuous memory rewriting:** Claude periodically rewrites its memory index to deduplicate facts, fix contradictions, and remove stale entries. This is why long Claude Code sessions stay coherent where other agents degrade.

KratosUI equivalent: ClawdBot home state = index layer. Automation logs = file layer. Conversation history = transcript layer.

---

## 4-Tier Context Compaction

Four tiers activate progressively as context grows:

1. **Truncation** — drop oldest messages first
2. **Summarization** — replace old messages with a compressed summary
3. **Selective retention** — keep only tool results relevant to the active plan
4. **Full Compact** — full summarization + explicit re-injection of:
   - Active plan (what Claude was mid-task on)
   - Recently accessed files (capped at ~5K tokens per file)
   - Relevant skill schemas (skills are NOT lost)
   - Working token budget reset to ~50,000 tokens

---

## Permission System (`permissions.ts` — 52,000 lines)

Larger than most entire open source MCP clients. Enforces:
- **Pre-execution permission checks** per tool capability declaration
- **Allowlist/denylist patterns** for file paths and shell commands
- **Dangerous operation flags** — pause and surface to user before executing
- `DISABLE_COMMAND_INJECTION_CHECK` env var is explicitly marked "DANGEROUS" in source

Anthropic treats sandboxing as a first-class architectural concern — not bolted on after the fact.

---

## KratosUI Direct Mapping

| Claude Code Pattern | KratosUI Implementation |
|---|---|
| `CLAUDE.md` global skills | `backend/skills/*.md` frontmatter + body |
| Skill index in system prompt | Skill name + description only (not body) in base prompt |
| Skill body on demand | Appended to dynamic section when triggered |
| Flat tool registry | MCP servers + ClawdBot tools as one unified list |
| Async generator loop | `while True` loop wrapping `agent.run_stream()` in `agent.py` |
| `AgentTool` sub-agents | ClawdBot sub-routines as isolated `agent.run()` calls |
| Full Compact skill re-injection | `persist: session` frontmatter flag |
| `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` | Base prompt string + appended skill bodies |
| Mailbox pattern | `DESTRUCTIVE_TOOLS` list + UI confirmation gate |
| Interleaved thinking | Scratchpad events between tool calls (future KratosUI feature) |

---

## Source References

| Resource | URL |
|---|---|
| Leaked source mirror (GitHub) | https://github.com/yasasbanukaofficial/claude-code |
| Architecture deep dive (WaveSpeed) | https://wavespeed.ai/blog/posts/claude-code-architecture-leaked-source-deep-dive/ |
| 8 Hidden Features (MindStudio) | https://www.mindstudio.ai/blog/claude-code-source-code-leak-8-hidden-features/ |
| 10 Agentic Patterns (Ken Huang) | https://kenhuangus.substack.com/p/the-claude-code-leak-10-agentic-ai |
| Comprehensive Analysis (Sabrina Dev) | https://www.sabrina.dev/p/claude-code-source-leak-analysis |
| Security Breakdown (Varonis) | https://www.varonis.com/blog/claude-code-leak |
| Architecture Analysis (Bits Bytes NN) | https://bits-bytes-nn.github.io/insights/agentic-ai/2026/03/31/claude-code-architecture-analysis.html |

> Note: This is Anthropic's proprietary code accidentally exposed via an unminified source map in the Claude Code npm package on March 30, 2026. It was not intentionally open-sourced. Use as architectural reference only.
