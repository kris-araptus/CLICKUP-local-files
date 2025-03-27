# ClickUp CLI Commands Reference

This document contains all available commands for the ClickUp Local Updater CLI tool.

## Table of Contents

- [Authentication](#authentication)
- [List Commands](#list-commands)
- [Task Commands](#task-commands)
- [Task Sync Commands](#task-sync-commands)
- [Doc Commands](#doc-commands)

## Authentication

The first time you run any command, you'll be prompted to authenticate with ClickUp:

```bash
# Any command will trigger authentication if not already authenticated
npx ts-node src/cli.ts list workspaces
```

This will:
1. Open a browser window to authorize with ClickUp
2. Save the token to a local file (.clickup_token.json)
3. Use this token for future requests (valid for ~55 days)

## List Commands

Commands for listing ClickUp resources.

### Workspaces

```bash
# List all workspaces
npx ts-node src/cli.ts list workspaces
```

### Spaces

```bash
# List all spaces in a workspace
npx ts-node src/cli.ts list spaces -w <workspace_id>
```

### Folders

```bash
# List all folders in a space
npx ts-node src/cli.ts list folders -s <space_id>
```

### Lists

```bash
# List all lists in a folder
npx ts-node src/cli.ts list lists -f <folder_id>
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

## Doc Commands

Commands for working with ClickUp documents.

### List Docs

```bash
# List all docs in a workspace
npx ts-node src/cli.ts doc list -w <workspace_id>

# List all local doc files
npx ts-node src/cli.ts doc list-local
```

### Find Doc

```bash
# Find a doc by ID or URL
npx ts-node src/cli.ts doc find -i <doc_id>
npx ts-node src/cli.ts doc find -u <doc_url>
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

# Export all docs from a workspace
npx ts-node src/cli.ts doc export-all -w <workspace_id>

# Force-export a doc when the API doesn't work
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

- If you encounter authentication errors, delete the `.clickup_token.json` file and run any command to re-authenticate
- For Doc operations, check the [ClickUp API Limitations](README.md#clickup-api-limitations) section in the README
- Task IDs can usually be found in the ClickUp task URL after the `/t/` part
- All commands that output data in the terminal can be piped to files using standard shell redirects (e.g., `npx ts-node src/cli.ts list workspaces > workspaces.txt`) 