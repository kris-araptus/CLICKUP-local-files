import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { exportTask } from '../lib/localSync';

const PROJECT_MAP_PATH = path.join(process.cwd(), 'project-map.json');
const SOFTWARE_BASE    = '/Users/kristopherblack/Software';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadProjectMap(): Record<string, string | null> {
  if (!fs.existsSync(PROJECT_MAP_PATH)) return {};
  try {
    const raw = fs.readFileSync(PROJECT_MAP_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Strip the _readme meta key
    delete parsed._readme;
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Resolve a ClickUp space name to a /Software/ directory path.
 * Matching logic:
 *   1. Check project-map.json for an explicit override (value null = skip)
 *   2. Fall back to exact match (space name === directory name)
 */
function resolveProjectDir(spaceName: string): string | null {
  const map = loadProjectMap();

  if (spaceName in map) {
    const mapped = map[spaceName];
    if (mapped === null) return null; // explicitly skipped
    return path.join(SOFTWARE_BASE, mapped);
  }

  // Exact-match fallback
  const exactPath = path.join(SOFTWARE_BASE, spaceName);
  return fs.existsSync(exactPath) ? exactPath : null;
}

/**
 * Read the task ID from a CURRENT_TASK.md frontmatter (first 500 bytes only).
 * Returns null if the file doesn't exist or has no id field.
 */
function readCurrentTaskId(projectDir: string): string | null {
  const filePath = path.join(projectDir, 'CURRENT_TASK.md');
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8').slice(0, 500);
    const m = raw.match(/^id:\s*"([^"]+)"/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerWorkCommands(program: Command): void {
  program
    .command('work <task_id>')
    .description(
      'Pull a task from ClickUp and write CURRENT_TASK.md into the matching /Software/ project directory'
    )
    .option('-f, --force', 'Overwrite existing CURRENT_TASK.md without prompting')
    .action(async (taskId: string, options: { force?: boolean }) => {
      // 1 — Fresh pull
      console.log(`Pulling task ${taskId} from ClickUp…`);
      let exportedPath: string;
      try {
        exportedPath = await exportTask(taskId);
      } catch {
        process.exit(1);
      }

      // 2 — Read space_name from the exported frontmatter
      const raw = fs.readFileSync(exportedPath, 'utf8').slice(0, 800);
      const spaceMatch = raw.match(/^space_name:\s*"([^"]*)"/m);
      const spaceName  = spaceMatch ? spaceMatch[1] : '';

      if (!spaceName) {
        console.warn('Warning: space_name is empty in the exported task — cannot resolve project dir.');
        console.log(`Task saved to: ${exportedPath}`);
        process.exit(0);
      }

      // 3 — Resolve project directory
      const projectDir = resolveProjectDir(spaceName);
      if (!projectDir) {
        console.warn(`Warning: No /Software/ directory mapped for space "${spaceName}".`);
        console.log(`Task saved to: ${exportedPath}`);
        console.log(`Add an entry to project-map.json if the directory name differs from the space name.`);
        process.exit(0);
      }

      if (!fs.existsSync(projectDir)) {
        console.warn(`Warning: Resolved project dir does not exist: ${projectDir}`);
        console.log(`Task saved to: ${exportedPath}`);
        process.exit(0);
      }

      // 4 — Collision check
      const currentTaskPath  = path.join(projectDir, 'CURRENT_TASK.md');
      const existingTaskId   = readCurrentTaskId(projectDir);

      if (existingTaskId && existingTaskId !== taskId && !options.force) {
        console.warn(
          `Warning: ${projectDir}/CURRENT_TASK.md already tracks task ${existingTaskId}.\n` +
          `Use --force to overwrite.`
        );
        process.exit(1);
      }

      // 5 — Write CURRENT_TASK.md
      const content = fs.readFileSync(exportedPath, 'utf8');
      fs.writeFileSync(currentTaskPath, content, 'utf8');

      console.log(`\nCurrent task set:`);
      console.log(`  Project : ${projectDir}`);
      console.log(`  Task    : ${exportedPath}`);
      console.log(`  Context : ${currentTaskPath}`);
      console.log(`\nNext steps:`);
      console.log(`  cursor ${projectDir}          # open project in Cursor`);
      console.log(`  pnpm exec ts-node src/cli.ts sync push ${exportedPath}   # push changes back`);
    });
}
