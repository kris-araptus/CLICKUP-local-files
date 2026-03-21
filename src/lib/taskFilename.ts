import fs from 'fs';
import path from 'path';

/** Max length for the title slug segment (after `status__`). */
export const MAX_SLUG_LENGTH = 80;

/**
 * Maps ClickUp status text to a short, filesystem-safe token (lowercase, hyphens).
 * Example: "in progress" → "in-progress", "AI Approved" → "ai-approved"
 */
export function statusToFilenameToken(status: string): string {
  if (!status || !status.trim()) return 'unknown';
  let s = status.trim().toLowerCase();
  s = s.replace(/[/\\|]+/g, '-');
  s = s.replace(/\s+/g, '-');
  s = s.replace(/[^a-z0-9_-]/g, '');
  s = s.replace(/_+/g, '-');
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s || 'unknown';
}

/** Safe filename slug from task name (underscores between words). */
export function taskNameToSlug(name: string): string {
  if (!name || !name.trim()) return 'task';
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
  if (!slug) return 'task';
  return slug.length > MAX_SLUG_LENGTH ? slug.slice(0, MAX_SLUG_LENGTH) : slug;
}

export function readTaskIdFromMdFile(filePath: string): string | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').slice(0, 800);
    const m = raw.match(/^id:\s*"([^"]+)"/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Read `status` from YAML frontmatter (quoted value).
 */
export function readStatusFromMdFile(filePath: string): string | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').slice(0, 2000);
    const m = raw.match(/^status:\s*"([^"]*)"/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Read `name` from YAML frontmatter (quoted value; best-effort).
 */
export function readNameFromMdFile(filePath: string): string | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').slice(0, 2000);
    const m = raw.match(/^name:\s*"(.*)"$/m);
    return m ? m[1].replace(/\\"/g, '"') : null;
  } catch {
    return null;
  }
}

/**
 * From `statusToken__slug_part.md` return `slug_part`; from legacy `slug.md` return full stem.
 */
export function extractSlugPartFromFilename(basenameWithExt: string): string {
  const base = basenameWithExt.replace(/\.md$/i, '');
  const m = base.match(/^([a-z0-9-]+)__(.+)$/);
  if (m) return m[2];
  return base;
}

/**
 * Filename pattern: `<statusToken>__<slugPart>.md`
 */
export function formatTaskMarkdownFilename(statusToken: string, slugPart: string): string {
  return `${statusToken}__${slugPart}.md`;
}

/**
 * Pick a slug part so `statusToken__<slugPart>.md` is unused or already owned by taskId.
 */
export function pickSlugPartForNew(
  dir: string,
  statusToken: string,
  baseSlug: string,
  taskId: string
): string {
  const tryPart = (part: string): boolean => {
    const p = path.join(dir, formatTaskMarkdownFilename(statusToken, part));
    if (!fs.existsSync(p)) return true;
    const idThere = readTaskIdFromMdFile(p);
    return idThere === taskId;
  };

  if (tryPart(baseSlug)) return baseSlug;
  let n = 2;
  for (;;) {
    const part = `${baseSlug}_${n}`;
    if (tryPart(part)) return part;
    n++;
    if (n > 10_000) throw new Error('Could not allocate unique task filename');
  }
}
