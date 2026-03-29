import { Command } from 'commander';
import { getTask, getTasks, getDefaultWorkspaceId } from '../lib/clickup';
import {
  collectWorkspaceTasks,
  collectTasksForSpace,
  listAllFilterLabel,
  listAllFilterModeFromFlags,
} from '../lib/workspaceTasks';
import {
  exportTask,
  exportTasks,
  importTask,
  getLocalTasks,
  getLocalTaskById,
  pruneLocalTasks,
  pruneOrphanExports,
} from '../lib/localSync';
import {
  findStaleTaskSpaceDirNames,
  findStaleProjectMapKeys,
  removeTaskSpaceDirs,
  removeProjectMapKeys,
} from '../lib/staleSpaces';
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

  syncCommand
    .command('export-space <space_id>')
    .description(
      'Export tasks from one ClickUp space, prune terminal statuses, then remove orphan locals not in this export'
    )
    .option('-a', '--archived', 'Include archived tasks when fetching lists')
    .option('--all-statuses', 'Include done, complete, closed')
    .option('--without-closed', 'Include all except status "closed"')
    .option('--no-prune', 'Skip all pruning after export')
    .option(
      '--no-prune-orphans',
      'Keep local .md files for tasks not in this export (e.g. keep copies of done tasks that were filtered out)'
    )
    .option(
      '--prune-dry-run',
      'Prune steps only: print deletions; export still writes files'
    )
    .option(
      '--match <statuses>',
      'Comma-separated statuses for prune (default: closed,done,complete)'
    )
    .action(
      async (
        spaceId: string,
        options: {
          archived?: boolean;
          allStatuses?: boolean;
          withoutClosed?: boolean;
          noPrune?: boolean;
          noPruneOrphans?: boolean;
          pruneDryRun?: boolean;
          match?: string;
        }
      ) => {
        try {
          const filterMode = listAllFilterModeFromFlags(
            options.allStatuses,
            options.withoutClosed
          );
          const { tasks, projectSubdir } = await collectTasksForSpace(spaceId, {
            includeArchived: !!options.archived,
            filterMode,
            verbose: true,
          });

          if (tasks.length > 0) {
            const paths = await exportTasks(tasks);
            console.log(`Exported ${paths.length} tasks to the 'tasks' directory.\n`);
          } else {
            console.log('No tasks to export.\n');
          }

          if (options.noPrune) {
            return;
          }

          const matchStatuses =
            options.match && options.match.trim()
              ? options.match
                  .split(',')
                  .map(s => s.toLowerCase().trim())
                  .filter(Boolean)
              : ['closed', 'done', 'complete'];

          console.log(
            `Pruning local files under tasks/${projectSubdir}/ (status: ${matchStatuses.join(', ')})${options.pruneDryRun ? ' [dry-run]' : ''}…`
          );
          const r = pruneLocalTasks({
            dryRun: !!options.pruneDryRun,
            matchStatuses,
            onlySubdir: projectSubdir,
          });
          console.log(
            `\nPrune summary: ${r.removedFiles} markdown file(s), ${r.removedAttachmentDirs} attachment folder(s) ` +
              `${options.pruneDryRun ? 'would be removed' : 'removed'}; ` +
              `${r.kept} kept; ${r.skippedNoId} skipped (missing id).`
          );

          if (options.noPruneOrphans) {
            return;
          }

          const validIds = new Set(tasks.map((t: { id: string }) => String(t.id)));
          if (validIds.size === 0) {
            console.log('\nSkipping orphan prune (no tasks in this export).');
            return;
          }

          console.log(
            `\nRemoving local files under tasks/${projectSubdir}/ that are not in this export (${validIds.size} task id(s))${options.pruneDryRun ? ' [dry-run]' : ''}…`
          );
          const o = pruneOrphanExports({
            onlySubdir: projectSubdir,
            validTaskIds: validIds,
            dryRun: !!options.pruneDryRun,
          });
          console.log(
            `Orphan prune: ${o.removedFiles} markdown file(s), ${o.removedAttachmentDirs} attachment folder(s) ` +
              `${options.pruneDryRun ? 'would be removed' : 'removed'}; ` +
              `${o.skippedNoId} skipped (missing id).`
          );
        } catch (error) {
          console.error(`Failed to export space ${spaceId}.`);
        }
      }
    );

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

  syncCommand
    .command('prune-stale-spaces')
    .description(
      'Compare live ClickUp spaces to ./tasks subfolders and project-map.json; list or remove stale entries'
    )
    .option(
      '-w, --workspace <workspace_id>',
      'Workspace ID (default: CLICKUP_WORKSPACE_ID from .env)'
    )
    .option(
      '--execute',
      'Delete stale ./tasks/<Space>/ directories and/or project-map keys (default is report only)'
    )
    .option(
      '--no-task-dirs',
      'With --execute, skip deleting stale folders under ./tasks (only useful with --project-map)'
    )
    .option(
      '--project-map',
      'With --execute, remove stale keys from project-map.json (space names no longer in the workspace)'
    )
    .action(
      async (options: {
        workspace?: string;
        execute?: boolean;
        noTaskDirs?: boolean;
        projectMap?: boolean;
      }) => {
        try {
          const workspaceId = options.workspace || getDefaultWorkspaceId();
          if (!workspaceId) {
            console.error(
              'Workspace ID required: use -w <id> or set CLICKUP_WORKSPACE_ID in your .env file.'
            );
            return;
          }

          const { staleDirNames } = await findStaleTaskSpaceDirNames(workspaceId);
          const { staleKeys } = await findStaleProjectMapKeys(workspaceId);

          console.log('Stale task export folders (no matching ClickUp space name after sanitization):');
          if (staleDirNames.length === 0) {
            console.log('  (none)');
          } else {
            staleDirNames.forEach(d => console.log(`  tasks/${d}/`));
          }

          console.log('\nStale project-map.json keys (not a current space name):');
          if (staleKeys.length === 0) {
            console.log('  (none)');
          } else {
            staleKeys.forEach(k => console.log(`  ${k}`));
          }

          if (!options.execute) {
            console.log(
              '\nReport only. Run with --execute to delete stale task folders. Add --project-map to also remove stale map keys.'
            );
            return;
          }

          if (!options.noTaskDirs && staleDirNames.length > 0) {
            removeTaskSpaceDirs(staleDirNames);
            console.log(`\nRemoved ${staleDirNames.length} stale folder(s) under ./tasks.`);
          } else if (options.noTaskDirs) {
            console.log('\nSkipped deleting task folders (--no-task-dirs).');
          }

          if (options.projectMap && staleKeys.length > 0) {
            removeProjectMapKeys(staleKeys);
            console.log(`Removed ${staleKeys.length} stale key(s) from project-map.json.`);
          } else if (options.projectMap && staleKeys.length === 0) {
            console.log('No stale project-map keys to remove.');
          } else if (!options.projectMap && staleKeys.length > 0) {
            console.log(
              '\nStale map keys were not removed (omit --project-map). Re-run with --execute --project-map to update project-map.json.'
            );
          }

          console.log('');
        } catch (error) {
          console.error('Failed prune-stale-spaces:', error);
        }
      }
    );

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