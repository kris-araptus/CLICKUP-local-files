#!/usr/bin/env node

import { Command } from 'commander';
import { registerTaskCommands } from './commands/taskCommands';
import { registerListCommands } from './commands/listCommands';
import { registerSyncCommands } from './commands/syncCommands';
import { registerDocCommands } from './commands/docCommands';
import { registerWorkCommands } from './commands/workCommands';

// Initialize Commander
const program = new Command();

// Basic application info
program
  .version('1.0.0') // Read from package.json ideally
  .description('ClickUp Local Updater CLI');

// Register command groups
registerTaskCommands(program);
registerListCommands(program);
registerSyncCommands(program);
registerDocCommands(program);
registerWorkCommands(program);

// Parse command-line arguments
program.parse(process.argv);

// Handle cases where no command is provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 