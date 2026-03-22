import {
  getSpaces,
  getFolders,
  getLists,
  getListsInFolder,
  getTasks,
} from './clickup';

const CLOSED_STATUSES = ['done', 'complete', 'closed'];

export type ListAllFilterMode = 'default' | 'all' | 'without-closed';

/** Tasks that are not done / complete / closed (ClickUp status string, lowercased). */
export function isOpenTask(task: any): boolean {
  const status = (task.status?.status || '').toLowerCase().trim();
  if (!status) return false;
  if (CLOSED_STATUSES.includes(status)) return false;
  return true;
}

export function filterTasksForListAll(tasks: any[], mode: ListAllFilterMode): any[] {
  if (mode === 'all') return tasks;
  if (mode === 'without-closed') {
    return tasks.filter(
      (t: any) => (t.status?.status || '').toLowerCase().trim() !== 'closed'
    );
  }
  return tasks.filter(isOpenTask);
}

export function listAllFilterLabel(mode: ListAllFilterMode): string {
  if (mode === 'all') return 'all statuses';
  if (mode === 'without-closed') return 'all except status "closed"';
  return 'open + in progress (+ on hold, review, etc.; excludes done, complete, closed)';
}

export function listAllFilterModeFromFlags(
  allStatuses?: boolean,
  withoutClosed?: boolean
): ListAllFilterMode {
  if (allStatuses) return 'all';
  if (withoutClosed) return 'without-closed';
  return 'default';
}

/**
 * Walk workspace → spaces → lists and collect tasks with `_space_name`, `_folder_name`, `_list_name`.
 */
export async function collectWorkspaceTasks(
  workspaceId: string,
  options: {
    includeArchived: boolean;
    filterMode: ListAllFilterMode;
    verbose: boolean;
  }
): Promise<any[]> {
  const taskParams = options.includeArchived ? { archived: true } : {};
  const { filterMode, verbose } = options;

  const spaces = await getSpaces(workspaceId);
  if (!spaces || spaces.length === 0) {
    if (verbose) console.log('\nNo spaces found in this workspace.');
    return [];
  }

  const allTasks: any[] = [];

  for (const space of spaces) {
    if (verbose) console.log(`\n📁 Space: ${space.name} (ID: ${space.id})`);

    const folders = (await getFolders(space.id).catch(() => []) as any[]) || [];
    const folderlessLists = (await getLists(space.id).catch(() => []) as any[]) || [];

    for (const folder of folders) {
      if (verbose) console.log(`  📂 Folder: ${folder.name} (ID: ${folder.id})`);
      const lists = (await getListsInFolder(folder.id).catch(() => []) as any[]) || [];
      for (const list of lists) {
        const tasks = (await getTasks(list.id, taskParams).catch(() => []) as any[]) || [];
        const picked = filterTasksForListAll(tasks, filterMode);
        const skipped = tasks.length - picked.length;
        if (verbose) {
          const skipHint = skipped > 0 ? ` (${skipped} filtered out)` : '';
          console.log(
            `    📋 List: ${list.name} (ID: ${list.id}) — ${picked.length} task(s)${skipHint}`
          );
          picked.forEach((t: any) => {
            console.log(`       • [${t.status?.status || '?'}] ${t.name} (ID: ${t.id})`);
          });
        }
        picked.forEach((t: any) => {
          t._space_name = space.name;
          t._folder_name = folder.name;
          t._list_name = list.name;
          allTasks.push(t);
        });
      }
    }

    for (const list of folderlessLists) {
      const tasks = (await getTasks(list.id, taskParams).catch(() => []) as any[]) || [];
      const picked = filterTasksForListAll(tasks, filterMode);
      const skipped = tasks.length - picked.length;
      if (verbose) {
        const skipHint = skipped > 0 ? ` (${skipped} filtered out)` : '';
        console.log(
          `  📋 List: ${list.name} (ID: ${list.id}) — ${picked.length} task(s)${skipHint}`
        );
        picked.forEach((t: any) => {
          console.log(`     • [${t.status?.status || '?'}] ${t.name} (ID: ${t.id})`);
        });
      }
      picked.forEach((t: any) => {
        t._space_name = space.name;
        t._folder_name = '';
        t._list_name = list.name;
        allTasks.push(t);
      });
    }
  }

  if (verbose) {
    console.log(
      `\n--- Total: ${allTasks.length} task(s) — ${listAllFilterLabel(filterMode)} ---\n`
    );
  }

  return allTasks;
}
