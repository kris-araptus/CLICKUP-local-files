import { Command } from 'commander';
import { getTask } from '../lib/clickup'; // Adjust path as needed

export function registerTaskCommands(program: Command) {
  const taskCommand = program
    .command('task')
    .description('Interact with ClickUp tasks');

  taskCommand
    .command('get <task_id>')
    .description('Fetch details for a specific task')
    .action(async (taskId: string) => {
      try {
        const taskData = await getTask(taskId);
        console.log('Task Details:');
        // Output relevant task details (customize as needed)
        console.log(`  ID: ${taskData.id}`);
        console.log(`  Name: ${taskData.name}`);
        console.log(`  Status: ${taskData.status.status}`);
        console.log(`  URL: ${taskData.url}`);
        // console.log(JSON.stringify(taskData, null, 2)); // Uncomment to see full data
      } catch (error) {
        // Error is already logged in clickup.ts, but we might add context here
        console.error(`Failed to get task ${taskId}.`);
        // Optionally exit with error code: process.exit(1);
      }
    });

  taskCommand
    .command('update <task_id>')
    .description('Update a specific task (Not implemented yet)')
    // Add options for status, assignees etc. e.g., .option('-s, --status <status>', 'Set task status')
    .action(async (taskId: string, options: any) => {
      console.log(`Update command for task ${taskId} called.`);
      console.log('Options:', options);
      console.log('This command is not yet implemented.');
      // Implementation will go here:
      // try {
      //   const updatePayload = { ... }; // Construct payload from options
      //   await updateTask(taskId, updatePayload);
      //   console.log(`Task ${taskId} updated successfully.`);
      // } catch (error) {
      //   console.error(`Failed to update task ${taskId}.`);
      // }
    });

  // Add more subcommands for tasks if needed (e.g., create, list)
} 