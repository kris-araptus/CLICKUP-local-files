/**
 * One-time (or repeat-safe) migration: rename task markdown files to
 * `<status-token>__<slug-part>.md` using frontmatter `status` and preserving
 * slug disambiguators from the current basename. Attachment folders
 * `<taskId>-attachments/` are not renamed.
 *
 * Usage (from repo root):
 *   pnpm exec ts-node scripts/migrate-task-filenames.ts
 *   pnpm exec ts-node scripts/migrate-task-filenames.ts --dry-run
 */

import fs from 'fs';
import path from 'path';
import {
  statusToFilenameToken,
  extractSlugPartFromFilename,
  pickSlugPartForNew,
  taskNameToSlug,
  readTaskIdFromMdFile,
  readStatusFromMdFile,
  readNameFromMdFile,
  formatTaskMarkdownFilename,
} from '../src/lib/taskFilename';

const TASKS_DIR = path.join(process.cwd(), 'tasks');

function collectMdFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.endsWith('-attachments')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...collectMdFiles(p));
    } else if (ent.name.endsWith('.md')) {
      out.push(p);
    }
  }
  return out.sort();
}

function filenameAlreadyMatchesStatus(basename: string, statusToken: string): boolean {
  const m = basename.match(/^([a-z0-9-]+)__(.+)\.md$/i);
  if (!m) return false;
  return m[1].toLowerCase() === statusToken;
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const files = collectMdFiles(TASKS_DIR);

  if (files.length === 0) {
    console.log(`No .md files under ${TASKS_DIR} (nothing to do).`);
    return;
  }

  let renamed = 0;
  let skipped = 0;

  for (const filePath of files) {
    const id = readTaskIdFromMdFile(filePath);
    if (!id) {
      console.warn(`Skip (no id in frontmatter): ${filePath}`);
      skipped++;
      continue;
    }

    const statusRaw = readStatusFromMdFile(filePath) ?? 'unknown';
    const statusToken = statusToFilenameToken(statusRaw);
    const basename = path.basename(filePath);
    const dir = path.dirname(filePath);

    if (filenameAlreadyMatchesStatus(basename, statusToken)) {
      skipped++;
      continue;
    }

    let slugPart = extractSlugPartFromFilename(basename);
    const nameFm = readNameFromMdFile(filePath);
    const baseSlug = nameFm ? taskNameToSlug(nameFm) : slugPart;

    let targetPath = path.join(dir, formatTaskMarkdownFilename(statusToken, slugPart));

    if (fs.existsSync(targetPath) && path.normalize(targetPath) !== path.normalize(filePath)) {
      const otherId = readTaskIdFromMdFile(targetPath);
      if (otherId && otherId !== id) {
        slugPart = pickSlugPartForNew(dir, statusToken, baseSlug, id);
        targetPath = path.join(dir, formatTaskMarkdownFilename(statusToken, slugPart));
      }
    }

    if (path.normalize(targetPath) === path.normalize(filePath)) {
      skipped++;
      continue;
    }

    console.log(`${dryRun ? '[dry-run] ' : ''}${basename}  →  ${path.basename(targetPath)}`);

    if (!dryRun) {
      fs.renameSync(filePath, targetPath);
    }
    renamed++;
  }

  console.log(
    `\nDone. ${dryRun ? 'Would rename' : 'Renamed'}: ${renamed}, skipped (already OK or no id): ${skipped}.`
  );
}

main();
