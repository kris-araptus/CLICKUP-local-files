import { Command } from 'commander';
import { getTask, getTasks, getDefaultWorkspaceId } from '../lib/clickup';
import { collectWorkspaceTasks, listAllFilterLabel } from '../lib/workspaceTasks';
import {
  exportTask,
  exportTasks,
  importTask,
  getLocalTasks,
  getLocalTaskById,
  pruneLocalTasks,
} from '../lib/localSync';
import fs from 'fs';
import path from 'path';

export function registerSyncCommands(program: Command) {
  const syncCommand = program
    .command('sync')
    .description('Sync ClickUp tasks with local files');

  // Command to export a single task as a local file
  syncCommand
    .command('export-task <task_id>')
    .description('Export a single task to a local Markdown file')
    .action(async (taskId: string) => {
      try {
        const filePath = await exportTask(taskId);
        console.log(`Task exported successfully to: ${filePath}`);
      } catch (error) {
        console.error(`Failed to export task ${taskId}.`);
      }
    });

  // Command to export all tasks from a list
  syncCommand
    .command('export-list <list_id>')
    .description('Export all tasks from a list to local Markdown files')
    .option('-a, --archived', 'Include archived tasks')
    .action(async (listId: string, options: any) => {
      try {
        console.log(`Exporting all tasks from list ${listId}...`);
        
        const queryParams: any = {};
        if (options.archived) queryParams.archived = true;
        
        const tasks = await getTasks(listId, queryParams);
        if (!tasks || tasks.length === 0) {
          console.log('No tasks found in the list.');
          return;
        }
        
        const filePaths = await exportTasks(tasks);
        console.log(`Exported ${filePaths.length} tasks to the 'tasks' directory.`);
      } catch (error) {
        console.error(`Failed to export tasks from list ${listId}.`);
      }
    });

  // Command to push changes from a local file back to ClickUp
  syncCommand
    .command('push <file_path>')
    .description('Push changes from a local Markdown file back to ClickUp')
    .action(async (filePath: string) => {
      try {
        // Resolve relative paths
        const resolvedPath = path.resolve(process.cwd(), filePath);
        
        if (!fs.existsSync(resolvedPath)) {
          console.error(`File not found: ${resolvedPath}`);
          return;
        }
        
        console.log(`Pushing changes from ${resolvedPath} to ClickUp...`);
        const success = await importTask(resolvedPath);
        
        if (success) {
          console.log('Task updated successfully in ClickUp.');
        } else {
          console.error('Failed to update task in ClickUp.');
        }
      } catch (error) {
        console.error(`Failed to push changes from ${filePath}.`);
      }
    });

  // Command to push a specific task by ID
  syncCommand
    .command('push-task <task_id>')
    .description('Push changes for a specific task ID back to ClickUp')
    .action(async (taskId: string) => {
      try {
        const filePath = getLocalTaskById(taskId);
        
        if (!filePath) {
          console.error(`No local file found for task ID: ${taskId}`);
          return;
        }
        
        console.log(`Pushing changes from ${filePath} to ClickUp...`);
        const success = await importTask(filePath);
        
        if (success) {
          console.log('Task updated successfully in ClickUp.');
        } else {
          console.error('Failed to update task in ClickUp.');
        }
      } catch (error) {
        console.error(`Failed to push changes for task ${taskId}.`);
      }
    });

  // Export open tasks from whole workspace, then prune local terminal-status files
  syncCommand
    .command('refresh-open')
    .description(
      'Export all non-terminal tasks workspace-wide (same filter as "list all -e" default), then run prune-local for done/complete/closed'
    )
    .option(
      '-w, --workspace <workspace_id>',
      'Workspace ID (default: CLICKUP_WORKSPACE_ID from .env)'
    )
    .option('-a, --archived', 'Include archived tasks when fetching lists')
    .option(
      '--prune-dry-run',
      'Only for the prune step: print deletions without removing files (export still writes)'
    )
    .option(
      '--match <statuses>',
      'Comma-separated statuses for the prune step (default: closed,done,complete)'
    )
    .action(
      async (options: {
        workspace?: string;
        archived?: boolean;
        pruneDryRun?: boolean;
        match?: string;
      }) => {
        try {
          const workspaceId = options.workspace || getDefaultWorkspaceId();
          if (!workspaceId) {
            console.error(
              'Workspace ID required: use -w <id> or set CLICKUP_WORKSPACE_ID in your .env file.'
            );
            return;
          }

          console.log('Step 1 — collecting tasks from ClickUp (excludes done, complete, closed)…');
          const tasks = await collectWorkspaceTasks(workspaceId, {
            includeArchived: !!options.archived,
            filterMode: 'default',
            verbose: false,
          });
          console.log(
            `Found ${tasks.length} task(s) — ${listAllFilterLabel('default')}`
          );

          if (tasks.length > 0) {
            const paths = await exportTasks(tasks);
            console.log(`Exported ${paths.length} task(s) under ./tasks\n`);
          } else {
            console.log('No tasks to export.\n');
          }

          const matchStatuses =
            options.match && options.match.trim()
              ? options.match
                  .split(',')
                  .map(s => s.toLowerCase().trim())
                  .filter(Boolean)
              : ['closed', 'done', 'complete'];

          console.log(
            `Step 2 — prune local files (status in: ${matchStatuses.join(', ')})${options.pruneDryRun ? ' [dry-run]' : ''}…`
          );
          const r = pruneLocalTasks({
            dryRun: !!options.pruneDryRun,
            matchStatuses,
          });
          console.log(
            `\nPrune summary: ${r.removedFiles} markdown file(s), ${r.removedAttachmentDirs} attachment folder(s) ` +
              `${options.pruneDryRun ? 'would be removed' : 'removed'}; ` +
              `${r.kept} kept; ${r.skippedNoId} skipped (missing id).`
          );
        } catch (error) {
          console.error('Failed refresh-open:', error);
        }
      }
    );

  // Remove local exports for terminal / chosen statuses (based on frontmatter only)
  syncCommand
    .command('prune-local')
    .description(
      'Delete local task .md files whose frontmatter status matches, and their <taskId>-attachments folders'
    )
    .option('--dry-run', 'Print what would be deleted; do not remove files')
    .option(
      '--match <statuses>',
      'Comma-separated status names (case-insensitive). Default: closed,done,complete'
    )
    .action((options: { dryRun?: boolean; match?: string }) => {
      try {
        const matchStatuses =
          options.match && options.match.trim()
            ? options.match
                .split(',')
                .map(s => s.toLowerCase().trim())
                .filter(Boolean)
            : ['closed', 'done', 'complete'];

        const r = pruneLocalTasks({
          dryRun: !!options.dryRun,
          matchStatuses,
        });

        console.log(
          `\nPrune ${options.dryRun ? '(dry-run) ' : ''}summary: ` +
            `${r.removedFiles} markdown file(s), ${r.removedAttachmentDirs} attachment folder(s) ` +
            `${options.dryRun ? 'would be removed' : 'removed'}; ` +
            `${r.kept} kept (status not matched); ${r.skippedNoId} skipped (missing id).`
        );
      } catch (error) {
        console.error('Failed to prune local tasks.');
      }
    });

  // Command to list all local task files
  syncCommand
    .command('list-local')
    .description('List all local task files')
    .action(() => {
      try {
        const localTasks = getLocalTasks();
        
        if (localTasks.length === 0) {
          console.log('No local task files found.');
          return;
        }
        
        console.log(`\nLocal Tasks (${localTasks.length}):`);
        localTasks.forEach(filePath => {
          const fileName = path.basename(filePath);
          const [taskId] = fileName.split('_');
          console.log(`  ID: ${taskId}`);
          console.log(`  File: ${filePath}`);
          console.log('');
        });
      } catch (error) {
        console.error('Failed to list local tasks.');
      }
    });

  // Command to pull the latest version of a task from ClickUp
  syncCommand
    .command('pull <task_id>')
    .description('Pull the latest version of a task from ClickUp')
    .action(async (taskId: string) => {
      try {
        console.log(`Pulling latest version of task ${taskId} from ClickUp...`);
        const filePath = await exportTask(taskId);
        console.log(`Task updated locally at: ${filePath}`);
      } catch (error) {
        console.error(`Failed to pull task ${taskId}.`);
      }
    });
} 