import { Command } from 'commander';
import { getWorkspaces, getSpaces, getLists, getFolders, getListsInFolder, getTasks } from '../lib/clickup';

export function registerListCommands(program: Command) {
  const listCommand = program
    .command('list')
    .description('List various ClickUp resources');

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
    .requiredOption('-w, --workspace <workspace_id>', 'Workspace ID')
    .action(async (options) => {
      try {
        const spaces = await getSpaces(options.workspace);
        console.log('\nSpaces:');
        spaces.forEach((space: any) => {
          console.log(`  ID: ${space.id}`);
          console.log(`  Name: ${space.name}`);
          console.log('');
        });
      } catch (error) {
        console.error(`Failed to list spaces for workspace ${options.workspace}.`);
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