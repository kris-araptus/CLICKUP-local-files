import fs from 'fs';
import path from 'path';
import { getDoc, updateDoc } from './clickup';

// Directory where doc files will be stored
const DOCS_DIR = path.join(process.cwd(), 'docs');

// Make sure docs directory exists
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

/**
 * Convert a doc to a markdown document
 * @param doc The doc data from ClickUp
 * @returns A markdown string representation of the doc
 */
function docToMarkdown(doc: any): string {
  const metadata = {
    id: doc.id,
    title: doc.title,
    parent: doc.parent?.id || '',
    workspace_id: doc.team_id || '',
    updated_at: new Date().toISOString(),
  };

  // Convert to YAML front matter
  const frontMatter = Object.entries(metadata)
    .map(([key, value]) => `${key}: "${value}"`)
    .join('\n');

  // Create markdown content - first convert HTML to Markdown if needed
  let content = doc.content || '';
  
  // Simple HTML to Markdown conversion
  // Replace <p> tags with newlines
  content = content.replace(/<p>/g, '\n\n').replace(/<\/p>/g, '');
  // Replace <strong> tags with **
  content = content.replace(/<strong>/g, '**').replace(/<\/strong>/g, '**');
  // Replace <em> tags with _
  content = content.replace(/<em>/g, '_').replace(/<\/em>/g, '_');
  // Replace <h1>, <h2>, etc. with markdown headings
  content = content.replace(/<h1>/g, '\n# ').replace(/<\/h1>/g, '\n');
  content = content.replace(/<h2>/g, '\n## ').replace(/<\/h2>/g, '\n');
  content = content.replace(/<h3>/g, '\n### ').replace(/<\/h3>/g, '\n');
  // Replace <ul> and <li> tags
  content = content.replace(/<ul>/g, '\n').replace(/<\/ul>/g, '\n');
  content = content.replace(/<li>/g, '- ').replace(/<\/li>/g, '\n');
  // Remove other HTML tags
  content = content.replace(/<[^>]*>/g, '');

  return `---
${frontMatter}
---

# ${doc.title}

${content}`;
}

/**
 * Parse a markdown file back into doc data
 * @param markdown The markdown content
 * @returns An object with doc data and content
 */
function markdownToDoc(markdown: string): { metadata: any, content: string, title: string } {
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
  
  // Extract doc title and content
  const titleMatch = content.match(/# (.*)\n\n([\s\S]*)/);
  let title = metadata.title;
  let docContent = content;
  
  if (titleMatch) {
    // Title was found in the content, use it and remove from content
    title = titleMatch[1];
    docContent = titleMatch[2];
  }
  
  // Convert Markdown to simple HTML
  let htmlContent = docContent;
  
  // Convert headers
  htmlContent = htmlContent.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  htmlContent = htmlContent.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  htmlContent = htmlContent.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // Convert bold and italic
  htmlContent = htmlContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  htmlContent = htmlContent.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Convert lists
  htmlContent = htmlContent.replace(/^- (.*?)$/gm, '<li>$1</li>');
  
  // Wrap paragraphs
  htmlContent = '<p>' + htmlContent.replace(/\n\n/g, '</p>\n\n<p>') + '</p>';
  
  // Wrap lists
  htmlContent = htmlContent.replace(/(<li>.*?<\/li>\n)+/g, '<ul>$&</ul>');
  
  return { 
    metadata, 
    content: htmlContent,
    title
  };
}

/**
 * Export a doc from ClickUp to a local markdown file
 * @param docId The ID of the doc to export
 * @returns The path to the created file
 */
export async function exportDoc(docId: string): Promise<string> {
  try {
    const doc = await getDoc(docId);
    const markdown = docToMarkdown(doc);
    
    // Create filename from doc ID and sanitized title
    const safeTitle = doc.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${doc.id}_${safeTitle}.md`;
    const filePath = path.join(DOCS_DIR, filename);
    
    // Write to file
    fs.writeFileSync(filePath, markdown, 'utf8');
    return filePath;
  } catch (error) {
    console.error(`Failed to export doc ${docId}:`, error);
    throw error;
  }
}

/**
 * Export multiple docs
 * @param docs Array of doc objects
 * @returns Array of file paths created
 */
export function exportDocs(docs: any[]): string[] {
  const filePaths: string[] = [];
  
  docs.forEach(doc => {
    try {
      const markdown = docToMarkdown(doc);
      
      // Create filename from doc ID and sanitized title
      const safeTitle = doc.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${doc.id}_${safeTitle}.md`;
      const filePath = path.join(DOCS_DIR, filename);
      
      // Write to file
      fs.writeFileSync(filePath, markdown, 'utf8');
      filePaths.push(filePath);
    } catch (error) {
      console.error(`Failed to export doc ${doc.id}:`, error);
    }
  });
  
  return filePaths;
}

/**
 * Import a doc from a local markdown file back to ClickUp
 * @param filePath Path to the markdown file
 * @returns True if the update was successful
 */
export async function importDoc(filePath: string): Promise<boolean> {
  try {
    const markdown = fs.readFileSync(filePath, 'utf8');
    const { metadata, content, title } = markdownToDoc(markdown);
    
    // Prepare update payload
    const updatePayload = {
      title,
      content,
    };
    
    // Call the ClickUp API to update the doc
    await updateDoc(metadata.id, updatePayload);
    return true;
  } catch (error) {
    console.error(`Failed to import doc from ${filePath}:`, error);
    return false;
  }
}

/**
 * Get all local doc files
 * @returns Array of doc file paths
 */
export function getLocalDocs(): string[] {
  if (!fs.existsSync(DOCS_DIR)) {
    return [];
  }
  
  return fs.readdirSync(DOCS_DIR)
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(DOCS_DIR, file));
}

/**
 * Get a specific local doc by ID
 * @param docId The doc ID to find
 * @returns The path to the doc file or null if not found
 */
export function getLocalDocById(docId: string): string | null {
  if (!fs.existsSync(DOCS_DIR)) {
    return null;
  }
  
  const files = fs.readdirSync(DOCS_DIR);
  const docFile = files.find(file => file.startsWith(`${docId}_`));
  
  if (docFile) {
    return path.join(DOCS_DIR, docFile);
  }
  
  return null;
} 