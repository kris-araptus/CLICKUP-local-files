import fs from 'fs';
import path from 'path';
import { getTask, updateTask, getApiClient, getTaskComments, postComment } from './clickup';

// Directory where task documents will be stored (project subdirs go under this)
const TASKS_DIR = path.join(process.cwd(), 'tasks');

// Make sure tasks directory exists
if (!fs.existsSync(TASKS_DIR)) {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
}

/** Safe directory name from space/project name (no path overflow, no invalid chars) */
function sanitizeDirName(name: string): string {
  if (!name || !name.trim()) return '_unsorted';
  const sanitized = name
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '');
  return sanitized || '_unsorted';
}

/** Get project directory path and ensure it exists (tasks/<project>/) */
function getTaskDir(spaceName: string): string {
  const dir = path.join(TASKS_DIR, sanitizeDirName(spaceName));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Safe filename slug from task name */
const MAX_SLUG_LENGTH = 80;

function taskNameToSlug(name: string): string {
  if (!name || !name.trim()) return 'task';
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
  if (!slug) return 'task';
  return slug.length > MAX_SLUG_LENGTH ? slug.slice(0, MAX_SLUG_LENGTH) : slug;
}

/**
 * Scan a directory for an existing .md file whose frontmatter `id` matches taskId.
 * Returns the full path if found, null otherwise.
 * Used to make export idempotent — same task always overwrites its own file.
 */
function findFileByTaskId(dir: string, taskId: string): string | null {
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(dir, file);
      const raw = fs.readFileSync(filePath, 'utf8').slice(0, 500);
      const m = raw.match(/^id:\s*"([^"]+)"/m);
      if (m && m[1] === taskId) return filePath;
    }
  } catch { /* unreadable dir — ignore */ }
  return null;
}

/**
 * Resolve the file path for a task export.
 * If the task was previously exported (matched by ID), returns that path so it
 * gets overwritten in place. Otherwise generates a new slug-based filename.
 */
function resolveFilePath(dir: string, slug: string, taskId: string): string {
  const existing = findFileByTaskId(dir, taskId);
  if (existing) return existing;

  // New file — use slug, appending _2, _3 only to avoid clobbering a *different* task
  const base = `${slug}.md`;
  const pathFor = (name: string) => path.join(dir, name);
  if (!fs.existsSync(pathFor(base))) return path.join(dir, base);
  let n = 2;
  while (fs.existsSync(pathFor(`${slug}_${n}.md`))) n++;
  return path.join(dir, `${slug}_${n}.md`);
}

// ---------------------------------------------------------------------------
// Fix 1 — HTML-to-markdown
// ---------------------------------------------------------------------------

/**
 * Minimal HTML-to-markdown converter.
 * Feedbucket embeds clickable links as <a> tags in ClickUp task descriptions.
 * This preserves them as markdown links instead of stripping the href.
 */
function htmlToMarkdown(text: string): string {
  if (!text) return '';
  return text
    // Anchor tags → markdown links
    .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    // Block-level elements → newlines
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    // Strip any remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// ---------------------------------------------------------------------------
// Fix 3 — Feedbucket metadata parser
// ---------------------------------------------------------------------------

interface FeedbucketMeta {
  fb_reporter?: string;
  fb_page?: string;
  fb_device?: string;
  fb_system?: string;
  fb_browser?: string;
  fb_viewport?: string;
  fb_type?: string;
}

/**
 * Parse Feedbucket's structured metadata block out of a task description.
 * Feedbucket always includes "Feedbucket:" in the description, so we use that
 * as the detection signal.
 * Returns null when the task was not created by Feedbucket.
 */
function parseFeedbucketMeta(description: string): FeedbucketMeta | null {
  if (!description || !description.includes('Feedbucket')) return null;

  const grab = (label: string): string | undefined => {
    const m = description.match(new RegExp(`${label}:\\s*(.+)`));
    if (!m) return undefined;
    return m[1]
      .replace(/<[^>]+>/g, '')   // strip any inline HTML tags
      .replace(/"/g, "'")        // escape quotes for YAML safety
      .trim();
  };

  const meta: FeedbucketMeta = {
    fb_reporter: grab('Reporter'),
    fb_page:     grab('Page'),
    fb_device:   grab('Device'),
    fb_system:   grab('System'),
    fb_browser:  grab('Browser'),
    fb_viewport: grab('Viewport'),
    fb_type:     grab('Type'),
  };

  // Remove undefined keys so they don't pollute the frontmatter
  (Object.keys(meta) as (keyof FeedbucketMeta)[]).forEach(k => {
    if (!meta[k]) delete meta[k];
  });

  return Object.keys(meta).length > 0 ? meta : null;
}

// ---------------------------------------------------------------------------
// Fix 2 — Attachment downloader
// ---------------------------------------------------------------------------

/**
 * Download all attachments for a task into tasks/<project>/<taskId>-attachments/.
 * Returns a map of { filename → relative path from the .md file } for embedding.
 *
 * ClickUp attachment URLs are absolute. We use the authenticated API client so
 * the Bearer token is sent — required for non-public attachments.
 *
 * Already-downloaded files are skipped (idempotent on re-export).
 */
async function downloadAttachments(
  task: any,
  taskDir: string,
  taskId: string
): Promise<Record<string, string>> {
  const attachments: any[] = task.attachments || [];
  if (attachments.length === 0) return {};

  const attachDir = path.join(taskDir, `${taskId}-attachments`);
  if (!fs.existsSync(attachDir)) {
    fs.mkdirSync(attachDir, { recursive: true });
  }

  // Authenticated client — works for absolute URLs (axios ignores baseURL for absolute)
  const apiClient = await getApiClient();
  const localPaths: Record<string, string> = {};

  for (const attachment of attachments) {
    const filename: string = attachment.title || attachment.id;
    const localPath = path.join(attachDir, filename);
    const relativePath = `./${taskId}-attachments/${filename}`;

    if (fs.existsSync(localPath)) {
      localPaths[filename] = relativePath;
      continue;
    }

    if (!attachment.url) {
      console.warn(`  Attachment "${filename}" has no URL, skipping.`);
      continue;
    }

    try {
      const response = await apiClient.get(attachment.url, {
        responseType: 'arraybuffer',
      });
      fs.writeFileSync(localPath, Buffer.from(response.data));
      localPaths[filename] = relativePath;
      console.log(`  Downloaded attachment: ${filename}`);
    } catch (err: any) {
      console.warn(`  Could not download "${filename}": ${err?.message || err}`);
    }
  }

  return localPaths;
}

// ---------------------------------------------------------------------------
// Markdown serialisation
// ---------------------------------------------------------------------------

/**
 * Convert a task to a markdown document.
 *
 * @param task             Raw task data from ClickUp API
 * @param localAttachments Map of { filename → relative path } from downloadAttachments()
 * @param feedbucketMeta   Parsed Feedbucket fields, or null for non-Feedbucket tasks
 */
function taskToMarkdown(
  task: any,
  localAttachments: Record<string, string> = {},
  feedbucketMeta: FeedbucketMeta | null = null
): string {
  const base: Record<string, string> = {
    id:          task.id,
    name:        task.name,
    status:      task.status?.status || 'unknown',
    due_date:    task.due_date || '',
    list_id:     task.list?.id || '',
    list_name:   task._list_name || task.list?.name || '',
    folder_name: task._folder_name || task.folder?.name || '',
    space_name:  task._space_name || task.space?.name || task.team?.name || '',
    updated_at:  new Date().toISOString(),
  };

  // Merge Feedbucket fields into frontmatter (prefixed fb_* for clarity)
  const metadata = feedbucketMeta ? { ...base, ...feedbucketMeta } : base;

  const frontMatter = Object.entries(metadata)
    .map(([key, value]) => `${key}: "${value}"`)
    .join('\n');

  const projectPath = [metadata.space_name, metadata.folder_name, metadata.list_name]
    .filter(Boolean)
    .join(' › ') || 'Unknown';

  // Fix 1: convert HTML description so links survive
  const description = htmlToMarkdown(task.description || '');

  // Fix 2: embed attachments — local image when downloaded, remote link as fallback
  const attachmentLines: string[] = (task.attachments || []).map((a: any) => {
    const filename: string = a.title || a.id;
    const local = localAttachments[filename];
    return local
      ? `![${filename}](${local})`          // renders inline in VS Code / Obsidian
      : `[${filename}](${a.url || '#'})`;    // clickable fallback
  });

  const attachmentsSection = attachmentLines.length > 0
    ? `\n## Attachments\n\n${attachmentLines.join('\n\n')}\n`
    : '';

  // Render comments with embedded ID so push can distinguish new from existing.
  // Format: ### Username · Jan 15 2026, 10:30 AM [id:462]
  // New comments written locally omit the [id:...] marker — push detects and posts them.
  const commentsSection = (task.comments || [])
    .map((comment: any) => {
      const user = comment.user?.username || comment.user?.email || 'User';
      const ts   = Number(comment.date);
      const date = isNaN(ts) ? String(comment.date || '') : new Date(ts).toLocaleString();
      const id   = comment.id ? ` [id:${comment.id}]` : '';
      const text = htmlToMarkdown(comment.comment_text || '');
      return `### ${user} · ${date}${id}\n\n${text}`;
    })
    .join('\n\n---\n\n');

  return `---
${frontMatter}
---

# ${task.name}

**Project:** ${projectPath}

${description}
${attachmentsSection}
## Comments

${commentsSection}
`;
}

// ---------------------------------------------------------------------------
// Markdown deserialisation (push back to ClickUp)
// ---------------------------------------------------------------------------

/**
 * Parse a markdown file back into task data.
 */
function markdownToTask(markdown: string): { metadata: any; content: string } {
  const frontMatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontMatterMatch) {
    throw new Error('Invalid markdown format: Missing front matter');
  }

  const [, frontMatter, content] = frontMatterMatch;

  const metadata: Record<string, string> = {};
  frontMatter.split('\n').forEach(line => {
    const match = line.match(/^([\w_]+):\s*"(.*)"$/);
    if (match) {
      const [, key, value] = match;
      metadata[key] = value;
    }
  });

  return { metadata, content };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export a task from ClickUp to a local markdown file.
 * Downloads all attachments as local files and embeds them inline.
 */
export async function exportTask(taskId: string): Promise<string> {
  try {
    const task = await getTask(taskId);
    const projectName = task._space_name || task.space?.name || task.list?.name || '_unsorted';
    const dir = getTaskDir(projectName);
    const filePath = resolveFilePath(dir, taskNameToSlug(task.name), task.id);

    task.comments = await getTaskComments(task.id);

    const localAttachments = await downloadAttachments(task, dir, task.id);
    const feedbucketMeta   = parseFeedbucketMeta(task.description || '');

    const markdown = taskToMarkdown(task, localAttachments, feedbucketMeta);
    fs.writeFileSync(filePath, markdown, 'utf8');

    if (Object.keys(localAttachments).length > 0) {
      console.log(`  Attachments saved to: ${dir}/${task.id}-attachments/`);
    }
    if (task.comments.length > 0) {
      console.log(`  ${task.comments.length} comment(s) included.`);
    }

    return filePath;
  } catch (error) {
    console.error(`Failed to export task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Export multiple tasks from a list, downloading attachments for each.
 *
 * The ClickUp list endpoint should return attachments when include_attachments=true
 * is passed (handled in getTasks). If a task still comes back without the field
 * (older API behaviour), we do a single individual getTask() fetch to get the
 * full data before writing the file.
 */
export async function exportTasks(tasks: any[]): Promise<string[]> {
  const filePaths: string[] = [];

  for (const task of tasks) {
    try {
      // Preserve metadata injected by listCommands (space/folder/list names)
      const spaceName  = task._space_name;
      const folderName = task._folder_name;
      const listName   = task._list_name;

      // If the list endpoint didn't return attachments, fetch the full task
      let fullTask = task;
      if (task.attachments === undefined) {
        try {
          fullTask = await getTask(task.id);
          // Re-attach the display metadata stripped by the individual fetch
          fullTask._space_name  = spaceName;
          fullTask._folder_name = folderName;
          fullTask._list_name   = listName;
        } catch {
          // Fall back to the original task data if the individual fetch fails
          fullTask = task;
        }
      }

      const projectName = fullTask._space_name || fullTask.space?.name || fullTask.list?.name || '_unsorted';
      const dir      = getTaskDir(projectName);
      const filePath = resolveFilePath(dir, taskNameToSlug(fullTask.name), fullTask.id);

      fullTask.comments = await getTaskComments(fullTask.id);

      const localAttachments = await downloadAttachments(fullTask, dir, fullTask.id);
      const feedbucketMeta   = parseFeedbucketMeta(fullTask.description || '');

      const markdown = taskToMarkdown(fullTask, localAttachments, feedbucketMeta);
      fs.writeFileSync(filePath, markdown, 'utf8');
      filePaths.push(filePath);
    } catch (error) {
      console.error(`Failed to export task ${task.id}:`, error);
    }
  }

  return filePaths;
}

/**
 * Import a task from a local markdown file back to ClickUp.
 * Strips the Attachments section before pushing — we never push local image paths
 * back to ClickUp as task content.
 */
export async function importTask(filePath: string): Promise<boolean> {
  try {
    const markdown = fs.readFileSync(filePath, 'utf8');
    const { metadata, content } = markdownToTask(markdown);

    // Extract description: everything after the heading, stop before Attachments or Comments
    const descriptionMatch = content.match(
      /# .*\n\n([\s\S]*?)(?:\n## Attachments|\n## Comments|$)/
    );
    let description = descriptionMatch ? descriptionMatch[1].trim() : '';
    // Remove the **Project:** context line (display-only)
    description = description.replace(/^\*\*Project:\*\* .+$/m, '').trim();

    const updatePayload = {
      name:        metadata.name,
      description,
      status:      metadata.status,
    };

    await updateTask(metadata.id, updatePayload);

    // Find and post any new comments — blocks under ## Comments that have no [id:xxx] marker.
    // To add a comment locally: append a new ### block without [id:...] before pushing.
    const commentsSectionMatch = content.match(/## Comments\n\n([\s\S]*)$/);
    if (commentsSectionMatch) {
      const blocks = commentsSectionMatch[1]
        .split(/\n\n---\n\n/)
        .map(b => b.trim())
        .filter(b => b.startsWith('### '));

      let posted = 0;
      for (const block of blocks) {
        const headerLine = block.split('\n')[0];
        const isExisting = /\[id:[^\]]+\]/.test(headerLine);
        if (isExisting) continue;

        const text = block.split('\n').slice(1).join('\n').trim();
        if (!text) continue;

        await postComment(metadata.id, text);
        posted++;
      }

      if (posted > 0) {
        console.log(`  Posted ${posted} new comment(s) to ClickUp. Run sync pull to refresh IDs.`);
      }
    }

    return true;
  } catch (error) {
    console.error(`Failed to import task from ${filePath}:`, error);
    return false;
  }
}

/**
 * Get all local task files (under tasks/ and any tasks/<project>/ subdirs).
 * Skips attachment directories.
 */
export function getLocalTasks(): string[] {
  const paths: string[] = [];
  const entries = fs.readdirSync(TASKS_DIR, { withFileTypes: true });

  for (const e of entries) {
    if (e.isDirectory()) {
      const subDir = path.join(TASKS_DIR, e.name);
      const files = fs.readdirSync(subDir)
        .filter(f => f.endsWith('.md'));
      files.forEach(f => paths.push(path.join(subDir, f)));
    } else if (e.name.endsWith('.md')) {
      paths.push(path.join(TASKS_DIR, e.name));
    }
  }

  return paths;
}

/**
 * Get a specific local task by ID (searches all project subdirs by frontmatter).
 */
export function getLocalTaskById(taskId: string): string | null {
  const all = getLocalTasks();
  for (const filePath of all) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8').slice(0, 800);
      const idMatch = raw.match(/^id:\s*"([^"]+)"/m);
      if (idMatch && idMatch[1] === taskId) return filePath;
    } catch {
      // skip unreadable files
    }
  }
  return null;
}
