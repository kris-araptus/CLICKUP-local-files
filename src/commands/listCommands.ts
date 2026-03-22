import { Command } from 'commander';
import {
  getWorkspaces,
  getSpaces,
  getFolders,
  getLists,
  getListsInFolder,
  getTasks,
  getDefaultWorkspaceId,
} from '../lib/clickup';
import { exportTasks } from '../lib/localSync';
import {
  collectWorkspaceTasks,
  listAllFilterModeFromFlags,
} from '../lib/workspaceTasks';

export function registerListCommands(program: Command) {
  const listCommand = program
    .command('list')
    .description('List various ClickUp resources');

  listCommand
    .command('all')
    .description('List all spaces (projects), lists, and tasks in a workspace')
    .option(
      '-w, --workspace <workspace_id>',
      'Workspace ID (default: CLICKUP_WORKSPACE_ID from .env)'
    )
    .option('-e, --export', 'Export all tasks to local Markdown files in ./tasks')
    .option('-a, --archived', 'Include archived tasks')
    .option(
      '--all-statuses',
      'Include every task (done, complete, closed, etc.). Ignores --without-closed.'
    )
    .option(
      '--without-closed',
      'Omit only tasks whose status is exactly "closed" (includes Done, Complete, on hold, etc.). If you also pass --all-statuses, every task is included and this flag is ignored.'
    )
    .action(
      async (options: {
        workspace?: string;
        export?: boolean;
        archived?: boolean;
        allStatuses?: boolean;
        withoutClosed?: boolean;
      }) => {
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
        const filterMode = listAllFilterModeFromFlags(options.allStatuses, options.withoutClosed);

        const allTasks = await collectWorkspaceTasks(workspaceId, {
          includeArchived,
          filterMode,
          verbose: true,
        });

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