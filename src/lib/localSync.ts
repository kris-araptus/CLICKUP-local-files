import fs from 'fs';
import path from 'path';
import { getTask, updateTask } from './clickup';

// Directory where task documents will be stored
const TASKS_DIR = path.join(process.cwd(), 'tasks');

// Make sure tasks directory exists
if (!fs.existsSync(TASKS_DIR)) {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
}

/**
 * Convert a task to a markdown document
 * @param task The task data from ClickUp
 * @returns A markdown string representation of the task
 */
function taskToMarkdown(task: any): string {
  const metadata = {
    id: task.id,
    name: task.name,
    status: task.status?.status || 'unknown',
    due_date: task.due_date || '',
    list_id: task.list?.id || '',
    updated_at: new Date().toISOString(),
  };

  // Convert to YAML front matter
  const frontMatter = Object.entries(metadata)
    .map(([key, value]) => `${key}: "${value}"`)
    .join('\n');

  // Create markdown content
  return `---
${frontMatter}
---

# ${task.name}

${task.description || ''}

## Comments

${(task.comments || []).map((comment: any) => 
  `### ${comment.user?.username || 'User'} (${new Date(comment.date).toLocaleString()})
${comment.comment_text || ''}`
).join('\n\n')}
`;
}

/**
 * Parse a markdown file back into task data
 * @param markdown The markdown content
 * @returns An object with task data and content
 */
function markdownToTask(markdown: string): { metadata: any, content: string } {
  // Extract front matter
  const frontMatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontMatterMatch) {
    throw new Error('Invalid markdown format: Missing front matter');
  }
  
  const [, frontMatter, content] = frontMatterMatch;
  
  // Parse front matter into metadata
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

/**
 * Export a task from ClickUp to a local markdown file
 * @param taskId The ID of the task to export
 * @returns The path to the created file
 */
export async function exportTask(taskId: string): Promise<string> {
  try {
    const task = await getTask(taskId);
    const markdown = taskToMarkdown(task);
    
    // Create filename from task ID and sanitized name
    const safeTitle = task.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${task.id}_${safeTitle}.md`;
    const filePath = path.join(TASKS_DIR, filename);
    
    // Write to file
    fs.writeFileSync(filePath, markdown, 'utf8');
    return filePath;
  } catch (error) {
    console.error(`Failed to export task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Export multiple tasks from a list
 * @param tasks Array of task objects
 * @returns Array of file paths created
 */
export function exportTasks(tasks: any[]): string[] {
  const filePaths: string[] = [];
  
  tasks.forEach(task => {
    try {
      const markdown = taskToMarkdown(task);
      
      // Create filename from task ID and sanitized name
      const safeTitle = task.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${task.id}_${safeTitle}.md`;
      const filePath = path.join(TASKS_DIR, filename);
      
      // Write to file
      fs.writeFileSync(filePath, markdown, 'utf8');
      filePaths.push(filePath);
    } catch (error) {
      console.error(`Failed to export task ${task.id}:`, error);
    }
  });
  
  return filePaths;
}

/**
 * Import a task from a local markdown file back to ClickUp
 * @param filePath Path to the markdown file
 * @returns True if the update was successful
 */
export async function importTask(filePath: string): Promise<boolean> {
  try {
    const markdown = fs.readFileSync(filePath, 'utf8');
    const { metadata, content } = markdownToTask(markdown);
    
    // Extract task description (everything after the heading but before comments)
    const descriptionMatch = content.match(/# .*\n\n([\s\S]*?)(?:\n## Comments|$)/);
    const description = descriptionMatch ? descriptionMatch[1].trim() : '';
    
    // Prepare update payload
    const updatePayload = {
      name: metadata.name,
      description,
      status: metadata.status,
    };
    
    // Call the ClickUp API to update the task
    await updateTask(metadata.id, updatePayload);
    return true;
  } catch (error) {
    console.error(`Failed to import task from ${filePath}:`, error);
    return false;
  }
}

/**
 * Get all local task files
 * @returns Array of task file paths
 */
export function getLocalTasks(): string[] {
  return fs.readdirSync(TASKS_DIR)
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(TASKS_DIR, file));
}

/**
 * Get a specific local task by ID
 * @param taskId The task ID to find
 * @returns The path to the task file or null if not found
 */
export function getLocalTaskById(taskId: string): string | null {
  const files = fs.readdirSync(TASKS_DIR);
  const taskFile = files.find(file => file.startsWith(`${taskId}_`));
  
  if (taskFile) {
    return path.join(TASKS_DIR, taskFile);
  }
  
  return null;
} 