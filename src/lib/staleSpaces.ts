import fs from 'fs';
import path from 'path';
import { getSpaces } from './clickup';
import { TASKS_DIR, sanitizeDirName } from './localSync';

const PROJECT_MAP_PATH = path.join(process.cwd(), 'project-map.json');

/**
 * Task export folders under tasks/ whose names no longer match any ClickUp space
 * (after the same sanitizeDirName used for exports).
 */
export async function findStaleTaskSpaceDirNames(workspaceId: string): Promise<{
  staleDirNames: string[];
}> {
  const spaces = await getSpaces(workspaceId);
  const validDirNames = new Set(spaces.map((s: any) => sanitizeDirName(s.name)));

  if (!fs.existsSync(TASKS_DIR)) {
    return { staleDirNames: [] };
  }

  const staleDirNames: string[] = [];
  for (const ent of fs.readdirSync(TASKS_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (ent.name === '_unsorted') continue;
    if (!validDirNames.has(ent.name)) {
      staleDirNames.push(ent.name);
    }
  }
  staleDirNames.sort();
  return { staleDirNames };
}

/**
 * project-map.json keys (other than _readme) that are not current ClickUp space names.
 */
export async function findStaleProjectMapKeys(workspaceId: string): Promise<{
  staleKeys: string[];
}> {
  const spaces = await getSpaces(workspaceId);
  const liveSpaceNames = new Set(
    spaces.map((s: any) => String(s.name || '').trim()).filter(Boolean)
  );

  if (!fs.existsSync(PROJECT_MAP_PATH)) {
    return { staleKeys: [] };
  }

  let map: Record<string, unknown>;
  try {
    map = JSON.parse(fs.readFileSync(PROJECT_MAP_PATH, 'utf8'));
  } catch {
    return { staleKeys: [] };
  }

  const staleKeys: string[] = [];
  for (const key of Object.keys(map)) {
    if (key === '_readme') continue;
    if (!liveSpaceNames.has(key)) {
      staleKeys.push(key);
    }
  }
  staleKeys.sort();
  return { staleKeys };
}

export function removeTaskSpaceDirs(dirNames: string[]): void {
  for (const name of dirNames) {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error(`Invalid dir name: ${name}`);
    }
    const full = path.join(TASKS_DIR, name);
    if (!fs.existsSync(full)) continue;
    fs.rmSync(full, { recursive: true, force: true });
  }
}

/** Remove keys from project-map.json; keeps _readme and stable key order (_readme first, rest sorted). */
export function removeProjectMapKeys(keys: string[]): void {
  if (!fs.existsSync(PROJECT_MAP_PATH) || keys.length === 0) return;
  const map = JSON.parse(fs.readFileSync(PROJECT_MAP_PATH, 'utf8')) as Record<string, unknown>;
  const readme = map._readme;
  for (const k of keys) {
    if (k === '_readme') continue;
    delete map[k];
  }
  const out: Record<string, unknown> = {};
  if (readme !== undefined) out._readme = readme;
  for (const k of Object.keys(map).filter(k => k !== '_readme').sort()) {
    out[k] = map[k];
  }
  fs.writeFileSync(PROJECT_MAP_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
}
