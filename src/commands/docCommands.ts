import { Command } from 'commander';
import { getDoc, getDocs, createDoc, updateDoc } from '../lib/clickup';
import { exportDoc, exportDocs, importDoc, getLocalDocs, getLocalDocById } from '../lib/docSync';
import fs from 'fs';
import path from 'path';
import { getApiClient } from '../lib/clickup';

export function registerDocCommands(program: Command) {
  const docCommand = program
    .command('doc')
    .description('Interact with ClickUp docs');

  // Command to get doc details
  docCommand
    .command('get <doc_id>')
    .description('Fetch details for a specific doc')
    .action(async (docId: string) => {
      try {
        const docData = await getDoc(docId);
        console.log('Doc Details:');
        console.log(`  ID: ${docData.id}`);
        console.log(`  Title: ${docData.title}`);
        console.log(`  URL: ${docData.url || 'N/A'}`);
        // console.log(JSON.stringify(docData, null, 2)); // Uncomment to see full data
      } catch (error) {
        console.error(`Failed to get doc ${docId}.`);
      }
    });

  // Command to list docs in a workspace
  docCommand
    .command('list')
    .description('List all docs in a workspace')
    .requiredOption('-w, --workspace <workspace_id>', 'Workspace ID')
    .action(async (options) => {
      try {
        const docs = await getDocs(options.workspace);
        
        if (!docs || docs.length === 0) {
          console.log('No docs found in this workspace.');
          return;
        }
        
        console.log('\nDocs:');
        docs.forEach((doc: any) => {
          console.log(`  ID: ${doc.id}`);
          console.log(`  Title: ${doc.title}`);
          if (doc.date_created) {
            console.log(`  Created: ${new Date(doc.date_created).toLocaleString()}`);
          }
          console.log('');
        });
      } catch (error) {
        console.error(`Failed to list docs for workspace ${options.workspace}.`);
      }
    });

  // Command to create a new doc
  docCommand
    .command('create')
    .description('Create a new doc')
    .requiredOption('-l, --list <list_id>', 'List ID')
    .requiredOption('-t, --title <title>', 'Doc title')
    .option('-c, --content <content>', 'Doc content')
    .action(async (options) => {
      try {
        const docData = {
          title: options.title,
          content: options.content || '',
        };
        
        const newDoc = await createDoc(options.list, docData);
        console.log(`Doc created successfully with ID: ${newDoc.id}`);
        console.log(`URL: ${newDoc.url || 'N/A'}`);
      } catch (error) {
        console.error('Failed to create doc.');
      }
    });
    
  // Command to export doc to local file
  docCommand
    .command('export <doc_id>')
    .description('Export a doc to a local Markdown file')
    .action(async (docId: string) => {
      try {
        const filePath = await exportDoc(docId);
        console.log(`Doc exported successfully to: ${filePath}`);
      } catch (error) {
        console.error(`Failed to export doc ${docId}.`);
      }
    });

  // Command to pull doc from ClickUp
  docCommand
    .command('pull <doc_id>')
    .description('Pull the latest version of a doc from ClickUp')
    .action(async (docId: string) => {
      try {
        const filePath = await exportDoc(docId);
        console.log(`Doc updated locally at: ${filePath}`);
      } catch (error) {
        console.error(`Failed to pull doc ${docId}.`);
      }
    });

  // Command to push doc changes back to ClickUp
  docCommand
    .command('push <file_path>')
    .description('Push changes from a local file back to ClickUp')
    .action(async (filePath: string) => {
      try {
        // Resolve relative paths
        const resolvedPath = path.resolve(process.cwd(), filePath);
        
        if (!fs.existsSync(resolvedPath)) {
          console.error(`File not found: ${resolvedPath}`);
          return;
        }
        
        console.log(`Pushing changes from ${resolvedPath} to ClickUp...`);
        const success = await importDoc(resolvedPath);
        
        if (success) {
          console.log('Doc updated successfully in ClickUp.');
        } else {
          console.error('Failed to update doc in ClickUp.');
        }
      } catch (error) {
        console.error(`Failed to push changes from ${filePath}.`);
      }
    });

  // Command to list all local docs
  docCommand
    .command('list-local')
    .description('List all local doc files')
    .action(() => {
      try {
        const localDocs = getLocalDocs();
        
        if (localDocs.length === 0) {
          console.log('No local doc files found.');
          return;
        }
        
        console.log(`\nLocal Docs (${localDocs.length}):`);
        localDocs.forEach(filePath => {
          const fileName = path.basename(filePath);
          const [docId] = fileName.split('_');
          console.log(`  ID: ${docId}`);
          console.log(`  File: ${filePath}`);
          console.log('');
        });
      } catch (error) {
        console.error('Failed to list local docs.');
      }
    });

  // Command to export all docs from a workspace
  docCommand
    .command('export-all')
    .description('Export all docs from a workspace to local Markdown files')
    .requiredOption('-w, --workspace <workspace_id>', 'Workspace ID')
    .action(async (options) => {
      try {
        console.log(`Exporting all docs from workspace ${options.workspace}...`);
        
        const docs = await getDocs(options.workspace);
        if (!docs || docs.length === 0) {
          console.log('No docs found in the workspace.');
          return;
        }
        
        const filePaths = exportDocs(docs);
        console.log(`Exported ${filePaths.length} docs to the 'docs' directory.`);
      } catch (error) {
        console.error(`Failed to export docs from workspace ${options.workspace}.`);
      }
    });

  // Command to search for docs by ID or URL
  docCommand
    .command('find')
    .description('Attempt to find a doc using its URL or by searching all locations')
    .option('-u, --url <doc_url>', 'URL of the doc')
    .option('-i, --id <doc_id>', 'ID of the doc')
    .option('-w, --workspace <workspace_id>', 'Workspace ID (optional)')
    .action(async (options) => {
      try {
        let docId = options.id;
        
        // If URL is provided, extract the doc ID from it
        if (options.url) {
          const urlMatch = options.url.match(/app\.clickup\.com\/(?:d|doc)\/([a-zA-Z0-9]+)/);
          if (urlMatch && urlMatch[1]) {
            docId = urlMatch[1];
            console.log(`Extracted doc ID from URL: ${docId}`);
          } else {
            console.error('Could not extract doc ID from the provided URL');
            return;
          }
        }
        
        if (!docId) {
          console.error('Please provide either a doc ID or URL');
          return;
        }
        
        console.log(`Attempting to find doc with ID: ${docId}...`);
        
        // Attempt to fetch the doc directly
        try {
          const clickupApi = await getApiClient();
          
          // Try direct doc API
          try {
            const docResponse = await clickupApi.get(`/doc/${docId}`);
            
            console.log('\nFound doc info:');
            console.log(`  ID: ${docResponse.data.id}`);
            console.log(`  Title: ${docResponse.data.title || docResponse.data.name}`);
            console.log(`  URL: ${docResponse.data.url || 'N/A'}`);
            
            console.log('\nTo export this doc, use:');
            console.log(`npx ts-node src/cli.ts doc export ${docId}`);
            return;
          } catch (err) {
            console.log('Could not find doc via direct API. Trying other methods...');
          }
          
          // Try view API
          try {
            const viewResponse = await clickupApi.get(`/view/${docId}`);
            
            console.log('\nFound doc as a view:');
            console.log(`  ID: ${viewResponse.data.id}`);
            console.log(`  Name: ${viewResponse.data.name}`);
            console.log(`  Type: ${viewResponse.data.type}`);
            console.log(`  URL: ${viewResponse.data.url || 'N/A'}`);
            
            console.log('\nTo export this view as a doc, use:');
            console.log(`npx ts-node src/cli.ts doc export ${docId}`);
            return;
          } catch (err) {
            console.log('Could not find doc as a view. Trying other methods...');
          }
          
          // If we have a workspace ID, try searching for it in tasks and lists
          if (options.workspace) {
            console.log(`Searching in workspace ${options.workspace} for references to doc ${docId}...`);
            
            // Check in folders and lists
            const folderResponse = await clickupApi.get(`/team/${options.workspace}/folder`);
            const folders = folderResponse.data.folders || [];
            
            for (const folder of folders) {
              try {
                const listsResponse = await clickupApi.get(`/folder/${folder.id}/list`);
                const lists = listsResponse.data.lists || [];
                
                for (const list of lists) {
                  try {
                    // Get tasks in the list
                    const tasksResponse = await clickupApi.get(`/list/${list.id}/task`);
                    const tasks = tasksResponse.data.tasks || [];
                    
                    // Check if any task has a description containing a link to the doc
                    for (const task of tasks) {
                      if (task.description && task.description.includes(docId)) {
                        console.log(`\nFound reference to doc in task ${task.id}:`);
                        console.log(`  Task: ${task.name}`);
                        console.log(`  List: ${list.name}`);
                        console.log(`  Folder: ${folder.name}`);
                        
                        console.log('\nTo export this doc, use:');
                        console.log(`npx ts-node src/cli.ts doc export ${docId}`);
                        return;
                      }
                    }
                  } catch (err) {
                    // Skip problematic lists
                    console.log(`Could not search tasks in list ${list.id}`);
                  }
                }
              } catch (err) {
                // Skip problematic folders
                console.log(`Could not search lists in folder ${folder.id}`);
              }
            }
          }
          
          console.log('\nCould not find detailed information about this doc.');
          console.log('However, you can still try to export it directly:');
          console.log(`npx ts-node src/cli.ts doc export ${docId}`);
          
        } catch (error) {
          console.error(`Failed to find doc ${docId}.`);
        }
      } catch (error) {
        console.error('Failed to search for doc.');
      }
    });

  // Command to force-export a doc 
  docCommand
    .command('force-export')
    .description('Export a doc by manually providing necessary information')
    .requiredOption('-t, --title <title>', 'Doc title')
    .requiredOption('-i, --id <doc_id>', 'Doc ID (from URL)')
    .option('-c, --content <content>', 'Doc content (optional)')
    .option('-w, --workspace <workspace_id>', 'Workspace ID')
    .action(async (options) => {
      try {
        console.log(`Force-exporting doc "${options.title}" with ID: ${options.id}...`);
        
        // Create a minimum viable doc object
        const doc = {
          id: options.id,
          title: options.title,
          content: options.content || '',
          team_id: options.workspace || '',
          url: `https://app.clickup.com/d/${options.id}`
        };
        
        // Export it using the existing function
        const filePath = exportDocs([doc])[0];
        
        if (filePath) {
          console.log(`Doc force-exported successfully to: ${filePath}`);
          console.log('You can now edit this file and push changes back using:');
          console.log(`npx ts-node src/cli.ts doc push ${filePath}`);
        } else {
          console.error('Failed to export doc.');
        }
      } catch (error) {
        console.error('Failed to force-export doc.');
      }
    });
} 