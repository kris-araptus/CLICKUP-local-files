import { Command } from 'commander';
import { getTask, getTasks } from '../lib/clickup';
import { exportTask, exportTasks, importTask, getLocalTasks, getLocalTaskById } from '../lib/localSync';
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