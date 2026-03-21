import { Command } from 'commander';
import {
  getWorkspaces,
  getSpaces,
  getLists,
  getFolders,
  getListsInFolder,
  getTasks,
  getDefaultWorkspaceId,
} from '../lib/clickup';
import { exportTasks } from '../lib/localSync';

export function registerListCommands(program: Command) {
  const listCommand = program
    .command('list')
    .description('List various ClickUp resources');

  // List entire workspace: spaces → folders → lists → tasks (optionally export all tasks)
  const CLOSED_STATUSES = ['done', 'complete', 'closed'];

  /** Include open, in progress, and any other status that isn't done/complete/closed */
  function isOpenTask(task: any): boolean {
    const status = (task.status?.status || '').toLowerCase().trim();
    if (!status) return false;
    if (CLOSED_STATUSES.includes(status)) return false;
    return true;
  }

  listCommand
    .command('all')
    .description('List all spaces (projects), lists, and tasks in a workspace')
    .option(
      '-w, --workspace <workspace_id>',
      'Workspace ID (default: CLICKUP_WORKSPACE_ID from .env)'
    )
    .option('-e, --export', 'Export all tasks to local Markdown files in ./tasks')
    .option('-a, --archived', 'Include archived tasks')
    .option('--all-statuses', 'Include done/closed tasks (default: only open + in progress)')
    .action(async (options: { workspace?: string; export?: boolean; archived?: boolean; allStatuses?: boolean }) => {
      try {
        const workspaceId = options.workspace || getDefaultWorkspaceId();
        if (!workspaceId) {
          console.error(
            'Workspace ID required: use -w <id> or set CLICKUP_WORKSPACE_ID in your .env file.'
          );
          return;
        }
        const includeArchived = !!options.archived;
        const doExport = !!options.export;
        const includeClosed = !!options.allStatuses;
        const taskParams = includeArchived ? { archived: true } : {};

        const spaces = await getSpaces(workspaceId);
        if (!spaces || spaces.length === 0) {
          console.log('\nNo spaces found in this workspace.');
          return;
        }

        const allTasks: any[] = [];

        for (const space of spaces) {
          console.log(`\n📁 Space: ${space.name} (ID: ${space.id})`);

          const folders = await getFolders(space.id).catch(() => []) || [];
          const folderlessLists = await getLists(space.id).catch(() => []) || [];

          for (const folder of folders) {
            console.log(`  📂 Folder: ${folder.name} (ID: ${folder.id})`);
            const lists = await getListsInFolder(folder.id).catch(() => []) || [];
            for (const list of lists) {
              const tasks = await getTasks(list.id, taskParams).catch(() => []) || [];
              const openTasks = includeClosed ? tasks : tasks.filter(isOpenTask);
              console.log(`    📋 List: ${list.name} (ID: ${list.id}) — ${openTasks.length} task(s)${!includeClosed && openTasks.length < tasks.length ? ` (${tasks.length - openTasks.length} done/closed skipped)` : ''}`);
              openTasks.forEach((t: any) => {
                t._space_name = space.name;
                t._folder_name = folder.name;
                t._list_name = list.name;
                console.log(`       • [${t.status?.status || '?'}] ${t.name} (ID: ${t.id})`);
                allTasks.push(t);
              });
            }
          }

          for (const list of folderlessLists) {
            const tasks = await getTasks(list.id, taskParams).catch(() => []) || [];
            const openTasks = includeClosed ? tasks : tasks.filter(isOpenTask);
            console.log(`  📋 List: ${list.name} (ID: ${list.id}) — ${openTasks.length} task(s)${!includeClosed && openTasks.length < tasks.length ? ` (${tasks.length - openTasks.length} done/closed skipped)` : ''}`);
            openTasks.forEach((t: any) => {
              t._space_name = space.name;
              t._folder_name = '';
              t._list_name = list.name;
              console.log(`     • [${t.status?.status || '?'}] ${t.name} (ID: ${t.id})`);
              allTasks.push(t);
            });
          }
        }

        console.log(`\n--- Total: ${allTasks.length} task(s)${includeClosed ? '' : ' (open + in progress)'} ---\n`);

        if (doExport && allTasks.length > 0) {
          const paths = await exportTasks(allTasks);
          console.log(`Exported ${paths.length} tasks to the 'tasks' directory.\n`);
        }
      } catch (error) {
        console.error('Failed to list workspace.');
      }
    });

  listCommand
    .command('workspaces')
    .description('List all accessible workspaces')
    .action(async () => {
      try {
        const workspaces = await getWorkspaces();
        console.log('\nWorkspaces:');
        workspaces.forEach((workspace: any) => {
          console.log(`  ID: ${workspace.id}`);
          console.log(`  Name: ${workspace.name}`);
          console.log('');
        });
      } catch (error) {
        console.error('Failed to list workspaces.');
      }
    });

  listCommand
    .command('spaces')
    .description('List all spaces in a workspace')
    .option(
      '-w, --workspace <workspace_id>',
      'Workspace ID (default: CLICKUP_WORKSPACE_ID from .env)'
    )
    .action(async (options: { workspace?: string }) => {
      const workspaceId = options.workspace || getDefaultWorkspaceId();
      if (!workspaceId) {
        console.error(
          'Workspace ID required: use -w <id> or set CLICKUP_WORKSPACE_ID in your .env file.'
        );
        return;
      }
      try {
        const spaces = await getSpaces(workspaceId);
        console.log('\nSpaces:');
        spaces.forEach((space: any) => {
          console.log(`  ID: ${space.id}`);
          console.log(`  Name: ${space.name}`);
          console.log('');
        });
      } catch (error) {
        console.error(`Failed to list spaces for workspace ${workspaceId}.`);
      }
    });

  listCommand
    .command('folders')
    .description('List all folders in a space')
    .requiredOption('-s, --space <space_id>', 'Space ID')
    .action(async (options) => {
      try {
        const folders = await getFolders(options.space);
        console.log('\nFolders:');
        folders.forEach((folder: any) => {
          console.log(`  ID: ${folder.id}`);
          console.log(`  Name: ${folder.name}`);
          console.log('');
        });
      } catch (error) {
        console.error(`Failed to list folders for space ${options.space}.`);
      }
    });

  listCommand
    .command('lists')
    .description('List all lists in a space or folder')
    .option('-s, --space <space_id>', 'Space ID')
    .option('-f, --folder <folder_id>', 'Folder ID')
    .action(async (options) => {
      try {
        let lists;
        
        if (options.folder) {
          lists = await getListsInFolder(options.folder);
          console.log(`\nLists in folder ${options.folder}:`);
        } else if (options.space) {
          lists = await getLists(options.space);
          console.log(`\nLists in space ${options.space}:`);
        } else {
          console.error('Either --space or --folder option is required.');
          return;
        }
        
        lists.forEach((list: any) => {
          console.log(`  ID: ${list.id}`);
          console.log(`  Name: ${list.name}`);
          console.log('');
        });
      } catch (error) {
        console.error(`Failed to list lists.`);
      }
    });

  listCommand
    .command('tasks')
    .description('List tasks in a list')
    .requiredOption('-l, --list <list_id>', 'List ID')
    .option('-a, --archived', 'Include archived tasks')
    .option('-p, --page <page>', 'Page number')
    .option('-o, --order-by <field>', 'Order by field (e.g., due_date, created, updated)')
    .option('-r, --reverse', 'Reverse order')
    .action(async (options) => {
      try {
        const queryParams: any = {};
        
        if (options.archived) queryParams.archived = true;
        if (options.page) queryParams.page = options.page;
        if (options.orderBy) queryParams.order_by = options.orderBy;
        if (options.reverse) queryParams.reverse = true;
        
        const tasks = await getTasks(options.list, queryParams);
        console.log(`\nTasks in list ${options.list}:`);
        tasks.forEach((task: any) => {
          console.log(`  ID: ${task.id}`);
          console.log(`  Name: ${task.name}`);
          console.log(`  Status: ${task.status.status}`);
          if (task.due_date) {
            console.log(`  Due Date: ${new Date(task.due_date).toLocaleString()}`);
          }
          console.log('');
        });
      } catch (error) {
        console.error(`Failed to list tasks for list ${options.list}.`);
      }
    });
} 