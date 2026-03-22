# ClickUp CLI Commands Reference

This document contains all available commands for the ClickUp Local Updater CLI tool.

Run from the repo root after `pnpm install`:

```bash
npx ts-node src/cli.ts <command> [subcommand] [options]
# same via package script (arguments after -- go to the CLI):
pnpm run cli -- <command> [subcommand] [options]
```

## Table of Contents

- [Authentication](#authentication)
- [Default workspace (`CLICKUP_WORKSPACE_ID`)](#default-workspace-clickup_workspace_id)
- [List Commands](#list-commands)
- [Task Commands](#task-commands)
- [Task Sync Commands](#task-sync-commands)
  - [Refresh open (export + prune)](#refresh-open-export--prune)
- [Work command](#work-command)
- [Task markdown filenames](#task-markdown-filenames)
- [Doc Commands](#doc-commands)
- [Tips & Troubleshooting](#tips--troubleshooting)

## Authentication

The first time you run any command, you'll be prompted to authenticate with ClickUp:

```bash
# Any command will trigger authentication if not already authenticated
npx ts-node src/cli.ts list workspaces
```

This will:
1. Open a browser window to authorize with ClickUp
2. Save the token to a file in the project root named `.clickup_token_<hash>.json` (the CLI prints `Using token file:` on startup)
3. Use this token for future requests (valid for ~55 days)

## Default workspace (`CLICKUP_WORKSPACE_ID`)

If you set **`CLICKUP_WORKSPACE_ID`** in `.env` (your ClickUp workspace / team ID from `list workspaces`), these commands use it when you omit **`-w` / `--workspace`**:

| Command | Notes |
|--------|--------|
| `list all` | Required unless env is set |
| `list spaces` | Required unless env is set |
| `doc list` | Required unless env is set |
| `doc export-all` | Required unless env is set |
| `doc find` | Used for the optional workspace search path when direct API lookup fails |
| `doc force-export` | Fills `team_id` in the exported stub when `-w` is omitted |

Passing **`-w <workspace_id>`** on the command line always overrides the env value.

## List Commands

Commands for listing ClickUp resources.

### Workspaces

```bash
# List all workspaces
npx ts-node src/cli.ts list workspaces
```

### Spaces

```bash
# List all spaces in a workspace (-w optional if CLICKUP_WORKSPACE_ID is set in .env)
npx ts-node src/cli.ts list spaces
npx ts-node src/cli.ts list spaces -w <workspace_id>
```

### Entire workspace (tree)

Walks every space → folder → list (and folderless lists), then lists or exports tasks. **`-w`** is optional if **`CLICKUP_WORKSPACE_ID`** is set in `.env`.

```bash
npx ts-node src/cli.ts list all
npx ts-node src/cli.ts list all -w <workspace_id>

# Export listed tasks to ./tasks/<Space>/ (same filters as below)
npx ts-node src/cli.ts list all -e
```

**Options**

| Flag | Meaning |
|------|--------|
| `-e`, `--export` | Write each collected task to `./tasks` as Markdown (see [Task markdown filenames](#task-markdown-filenames)). |
| `-a`, `--archived` | Pass archived tasks through to the API when loading lists. |

**Status filters** (at most one effective mode; default is **active / non-terminal**):

| Mode | Flags | What is included |
|------|--------|------------------|
| **Default** | _(none)_ | All tasks **except** status `done`, `complete`, and `closed` (case-insensitive). Includes open, in progress, on hold, review, to do, etc. |
| **Everything** | `--all-statuses` | Every task, including done, complete, and closed. **Ignores** `--without-closed`. |
| **All but "closed"** | `--without-closed` | Every task **except** status exactly `closed`; **still includes** done and complete. |

Examples:

```bash
# Default: no done/complete/closed — usual choice for "sync what's still live"
npx ts-node src/cli.ts list all -e

# Include completed (done/complete) but still drop status "closed" only
npx ts-node src/cli.ts list all -e --without-closed

# Literally every task in the workspace (including done, complete, closed)
npx ts-node src/cli.ts list all -e --all-statuses
```

### Folders

```bash
# List all folders in a space
npx ts-node src/cli.ts list folders -s <space_id>
```

### Lists

Requires **either** `-s` (space) **or** `-f` (folder).

```bash
# Lists inside a folder
npx ts-node src/cli.ts list lists -f <folder_id>

# Folderless lists attached to a space
npx ts-node src/cli.ts list lists -s <space_id>
```

### Tasks

```bash
# List all tasks in a list
npx ts-node src/cli.ts list tasks -l <list_id>

# List tasks with filters
npx ts-node src/cli.ts list tasks -l <list_id> -a -o due_date -r

# Options:
# -a, --archived          Include archived tasks
# -p, --page <number>     Page number
# -o, --order-by <field>  Order by field (e.g., due_date, created, updated)
# -r, --reverse           Reverse order
```

## Task Commands

Commands for viewing and manipulating individual tasks.

### Get Task

```bash
# Get task details
npx ts-node src/cli.ts task get <task_id>
```

### Update Task

```bash
# Update a task (not fully implemented)
npx ts-node src/cli.ts task update <task_id> --status "in progress"
```

## Task Sync Commands

Commands for syncing tasks with local Markdown files.

### Export Tasks

```bash
# Export a single task to a local Markdown file
npx ts-node src/cli.ts sync export-task <task_id>

# Export all tasks from a list to local Markdown files
npx ts-node src/cli.ts sync export-list <list_id>

# Export all tasks from a list, including archived
npx ts-node src/cli.ts sync export-list <list_id> -a
```

### List Local Tasks

```bash
# List all local task files
npx ts-node src/cli.ts sync list-local
```

### Prune local tasks

Deletes local **`.md`** files under `./tasks` when YAML frontmatter **`status`** matches (default: **`closed`**, **`done`**, **`complete`** — case-insensitive, exact match after trim). Also deletes **`./tasks/<Space>/<taskId>-attachments/`** when that folder exists. Does **not** change ClickUp; refresh exports first (`sync pull` / `list all -e`) if your files are stale.

```bash
# Preview
npx ts-node src/cli.ts sync prune-local --dry-run

# Remove closed, done, and complete (default match list)
npx ts-node src/cli.ts sync prune-local

# Only remove tasks whose status is exactly "closed"
npx ts-node src/cli.ts sync prune-local --match closed

# Several custom statuses
npx ts-node src/cli.ts sync prune-local --match "closed,complete"
```

### Refresh open (export + prune)

One command: **export** every workspace task that passes the **same default filter** as `list all -e` (excludes **done**, **complete**, **closed**), then **prune** local `.md` files (and `*-attachments`) whose frontmatter `status` is in the prune list (default **closed**, **done**, **complete**). Requires workspace **`-w`** or **`CLICKUP_WORKSPACE_ID`**.

```bash
npx ts-node src/cli.ts sync refresh-open

# Preview prune only (files are still exported)
npx ts-node src/cli.ts sync refresh-open --prune-dry-run

# Include archived tasks in the API fetch; custom prune statuses
npx ts-node src/cli.ts sync refresh-open -a --match closed
```

Equivalent manual sequence: `list all -e` (no extra flags) then `sync prune-local`.

### Pull Tasks

```bash
# Pull the latest version of a task from ClickUp
npx ts-node src/cli.ts sync pull <task_id>
```

### Push Tasks

```bash
# Push changes from a local file back to ClickUp
npx ts-node src/cli.ts sync push <file_path>

# Push changes for a specific task by ID back to ClickUp
npx ts-node src/cli.ts sync push-task <task_id>
```

**What gets pushed:**
- Task name, description, and status (from frontmatter)
- Any new comments added locally (see below)

**Adding a comment locally:**

Open the exported markdown file and append a new `###` block **without** an `[id:...]` marker to the `## Comments` section:

```markdown
## Comments

### Jane · 3/1/2026, 10:00 AM [id:462]

Original client comment (existing — not re-posted).

---

### New Comment

Your reply here — this will be posted to ClickUp on push.
```

Any `###` block missing `[id:...]` is treated as new and posted via `POST /task/{id}/comment`. After pushing, run `sync pull <task_id>` to refresh the file with the new comment's ID.

## Work command

Pulls a task from ClickUp via `sync export-task`, then copies the exported Markdown into a **`CURRENT_TASK.md`** file inside a local project directory under **`/Users/kristopherblack/Software/`**, resolved from the task’s **`space_name`** (see `project-map.json` for space → folder overrides).

```bash
npx ts-node src/cli.ts work <task_id>
npx ts-node src/cli.ts work <task_id> -f   # overwrite existing CURRENT_TASK.md even if it tracks another task
```

**Note:** The base path `SOFTWARE_BASE` is hardcoded in `src/commands/workCommands.ts` for this checkout. Adjust there (or fork the map) if your projects live elsewhere. If no directory matches, the task is still saved under `./tasks/...` only.

## Task markdown filenames

Exported tasks live under `tasks/<Project>/` as Markdown with YAML frontmatter.

**Pattern:** `<status-token>__<slug>.md`

- **`<status-token>`** — Derived from the ClickUp status string at export time: lowercased, spaces → hyphens, filesystem-safe (e.g. `in progress` → `in-progress`, `AI Approved` → `ai-approved`).
- **`<slug>`** — Derived from the task title (lowercase, underscores); if two tasks in the same folder collide, the exporter appends `_2`, `_3`, etc. to the slug segment only.

**Source of truth:** Frontmatter `status: "..."` is what `sync push` sends to ClickUp. The filename is updated on each export/pull when the remote status changes (the file may be renamed in place).

**Attachments:** Images and files are stored under `tasks/<Project>/<task_id>-attachments/`. Paths inside the `.md` use that folder name (task id), so **renaming the `.md` file does not break attachment links.**

**Migrate existing files** (e.g. after upgrading) to the new names using frontmatter `status`:

```bash
# Preview renames
pnpm exec ts-node scripts/migrate-task-filenames.ts --dry-run

# Apply
pnpm exec ts-node scripts/migrate-task-filenames.ts
# or: pnpm migrate-task-filenames
```

**Layout note:** The root folder is **`tasks/`** (plural), then one subdirectory per ClickUp **space** (e.g. `tasks/AMCT/`). There is no top-level `task/` folder — use `tasks/<Project>/…` in paths.

**Find tasks by status in the shell** (examples):

```bash
# All tasks whose status token is ai-approved (every space under tasks/)
find tasks -name 'ai-approved__*.md'

# One space only (replace AMCT with your space folder name)
ls tasks/AMCT/ai-approved__*.md
```

**Keeping YAML and the prefix aligned:** After a manual rename, make sure frontmatter `status` still matches ClickUp (or run `sync pull <task_id>` / re-export) so the next export does not rename the file again to fix a mismatch.

## Doc Commands

Commands for working with ClickUp documents.

### List Docs

```bash
# List all docs in a workspace (-w optional if CLICKUP_WORKSPACE_ID is set)
npx ts-node src/cli.ts doc list
npx ts-node src/cli.ts doc list -w <workspace_id>

# List all local doc files
npx ts-node src/cli.ts doc list-local
```

### Find Doc

```bash
# Find a doc by ID or URL
npx ts-node src/cli.ts doc find -i <doc_id>
npx ts-node src/cli.ts doc find -u <doc_url>

# Optional workspace for task/list search fallback (-w optional if CLICKUP_WORKSPACE_ID is set)
npx ts-node src/cli.ts doc find -i <doc_id> -w <workspace_id>
```

### Get Doc

```bash
# Get doc details
npx ts-node src/cli.ts doc get <doc_id>
```

### Export Doc

```bash
# Export a doc to a local file
npx ts-node src/cli.ts doc export <doc_id>

# Export all docs from a workspace (-w optional if CLICKUP_WORKSPACE_ID is set)
npx ts-node src/cli.ts doc export-all
npx ts-node src/cli.ts doc export-all -w <workspace_id>

# Force-export a doc when the API doesn't work (-w optional if CLICKUP_WORKSPACE_ID is set)
npx ts-node src/cli.ts doc force-export -t "Doc Title" -i <doc_id>
npx ts-node src/cli.ts doc force-export -t "Doc Title" -i <doc_id> -w <workspace_id>
```

### Pull Doc

```bash
# Pull the latest version of a doc from ClickUp
npx ts-node src/cli.ts doc pull <doc_id>
```

### Push Doc

```bash
# Push changes from a local file back to ClickUp
npx ts-node src/cli.ts doc push <file_path>
```

### Create Doc

```bash
# Create a new doc (may open web browser if API fails)
npx ts-node src/cli.ts doc create -l <list_id> -t "Document Title" -c "Content"
```

## Tips & Troubleshooting

- If you encounter authentication errors, delete the `.clickup_token_*.json` file in the project root (or the path shown as `Using token file:`) and run any command to re-authenticate
- If a command says a workspace ID is required, run `list workspaces` and set `CLICKUP_WORKSPACE_ID` in `.env`, or pass `-w <workspace_id>`
- To **rename existing** task files to `{status}__{slug}.md`, use `pnpm migrate-task-filenames` (see [Task markdown filenames](#task-markdown-filenames))
- To **delete local** exports for finished work, use `sync prune-local` (see [Prune local tasks](#prune-local-tasks)); run with `--dry-run` first
- To **export open tasks and prune locals** in one step, use `sync refresh-open` (see [Refresh open (export + prune)](#refresh-open-export--prune))
- For Doc operations, check the [ClickUp API Limitations](README.md#clickup-api-limitations) section in the README
- Task IDs can usually be found in the ClickUp task URL after the `/t/` part
- All commands that output data in the terminal can be piped to files using standard shell redirects (e.g., `npx ts-node src/cli.ts list workspaces > workspaces.txt`)