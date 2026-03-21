import axios, { AxiosInstance, AxiosError } from 'axios';
import dotenv from 'dotenv';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Load environment variables from .env file
dotenv.config();

/** Workspace (team) ID from `.env` when CLI omits `-w` / `--workspace`. */
export function getDefaultWorkspaceId(): string | undefined {
  const v = process.env.CLICKUP_WORKSPACE_ID?.trim();
  return v || undefined;
}

const CLIENT_ID = process.env.CLICKUP_CLIENT_ID;
const CLIENT_SECRET = process.env.CLICKUP_CLIENT_SECRET;
const API_BASE_URL = 'https://api.clickup.com/api/v2';
const REDIRECT_URI = 'http://localhost:8080/callback';

// Generate a unique hash based on machine/user identifiers
function getUserHash(): string {
  const userInfo = os.userInfo();
  const machineId = `${userInfo.username}-${os.hostname()}`;
  return crypto.createHash('md5').update(machineId).digest('hex').substring(0, 8);
}

const USER_HASH = getUserHash();
const TOKEN_FILE_PATH = path.join(process.cwd(), `.clickup_token_${USER_HASH}.json`);

console.log(`Using token file: ${TOKEN_FILE_PATH}`);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Error: CLICKUP_CLIENT_ID or CLICKUP_CLIENT_SECRET is not defined in your .env file.'
  );
  console.error(
    'Please ensure you have added both your CLIENT_ID and CLIENT_SECRET from ClickUp to your .env file.'
  );
  process.exit(1); // Exit if the credentials are missing
}

// We'll store the access token here once obtained
let accessToken: string | null = null;

/**
 * Load token from file if it exists
 */
function loadTokenFromFile(): string | null {
  try {
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE_PATH, 'utf8'));
      // Check if token is expired (tokens are valid for 60 days with ClickUp)
      const expiryDate = new Date(tokenData.expiry);
      if (expiryDate > new Date()) {
        return tokenData.access_token;
      }
    }
  } catch (error) {
    console.error('Error loading token from file:', error);
  }
  return null;
}

/**
 * Save token to file for reuse
 */
function saveTokenToFile(token: string): void {
  try {
    // Set expiry date to 55 days from now (tokens last 60 days)
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 55);
    
    const tokenData = {
      access_token: token,
      expiry: expiry.toISOString()
    };
    
    fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(tokenData), 'utf8');
  } catch (error) {
    console.error('Error saving token to file:', error);
  }
}

/**
 * Get access token - first check if we have one saved, otherwise start OAuth flow
 */
async function getAccessToken(): Promise<string> {
  // First check if we have a token in memory
  if (accessToken) {
    return accessToken;
  }
  
  // Then check if we have a token saved to file
  const savedToken = loadTokenFromFile();
  if (savedToken) {
    accessToken = savedToken;
    return savedToken;
  }
  
  // If no token is available, start the OAuth flow
  return startOAuthFlow();
}

/**
 * Start the OAuth authorization flow
 */
function startOAuthFlow(): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log('\nInitiating ClickUp OAuth authentication...');
    
    // Create a temporary HTTP server to receive the OAuth callback
    const server = http.createServer(async (req, res) => {
      if (!req.url) {
        return;
      }
      
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const code = urlObj.searchParams.get('code');
      
      // Once we have the code, we can exchange it for an access token
      if (code) {
        // Close the response with a success message
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body>
              <h1>Authentication Successful</h1>
              <p>You have successfully authenticated with ClickUp. You can close this window.</p>
              <script>window.close();</script>
            </body>
          </html>
        `);
        
        // Close the server as we don't need it anymore
        server.close();
        
        try {
          // Exchange code for access token
          const response = await axios.post('https://api.clickup.com/api/v2/oauth/token', {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI
          });
          
          const token = response.data.access_token;
          accessToken = token;
          saveTokenToFile(token);
          resolve(token);
        } catch (error) {
          console.error('Error exchanging code for token:');
          handleApiError(error, 'exchanging code for token');
          reject(new Error('Failed to exchange authorization code for access token.'));
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('Authorization code not received');
        server.close();
        reject(new Error('Authorization code not received'));
      }
    });
    
    // Start the server
    server.listen(8080, () => {
      // Generate the authorization URL
      const authUrl = `https://app.clickup.com/api?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
      
      console.log('\nPlease authorize this application by visiting:');
      console.log(authUrl);
      console.log('\nA browser window should open automatically. If not, please copy and paste the URL.');
      
      // Use dynamic import for open package
      import('open').then(openModule => {
        openModule.default(authUrl).catch(() => {
          console.log('Could not open browser automatically. Please open the URL manually.');
        });
      }).catch(() => {
        console.log('Could not import open module. Please open the URL manually.');
      });
    });
  });
}

/**
 * Creates an Axios instance with the latest access token
 */
export async function getApiClient(): Promise<AxiosInstance> {
  const token = await getAccessToken();
  
  return axios.create({
  baseURL: API_BASE_URL,
  headers: {
      Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});
}

// --- Task Functions ---

/**
 * Fetches details for a specific task.
 * @param taskId - The ID of the task to fetch.
 * @returns Promise resolving with task data.
 */
export async function getTask(taskId: string): Promise<any> {
  try {
    // Note: ClickUp task IDs might include custom prefixes, ensure the full ID is passed.
    // Remove potential leading '#' if present, although ClickUp API usually handles it.
    const cleanTaskId = taskId.startsWith('#') ? taskId.substring(1) : taskId;

    console.log(`Fetching task details for ID: ${cleanTaskId}...`);
    const clickupApi = await getApiClient();
    const response = await clickupApi.get(`/task/${cleanTaskId}`, {
      params: { include_attachments: true },
    });
    return response.data;
  } catch (error) {
    handleApiError(error, `fetching task ${taskId}`);
    throw error; // Re-throw after logging
  }
}

/**
 * Updates a specific task
 * @param taskId - The ID of the task to update
 * @param updateData - Object containing the fields to update
 * @returns Promise resolving with updated task data
 */
export async function updateTask(taskId: string, updateData: any): Promise<any> {
  try {
    console.log(`Updating task with ID: ${taskId}...`);
    const clickupApi = await getApiClient();
    const response = await clickupApi.put(`/task/${taskId}`, updateData);
    return response.data;
  } catch (error) {
    handleApiError(error, `updating task ${taskId}`);
    throw error;
  }
}

// --- Workspace Functions ---

/**
 * Fetches all workspaces accessible with current credentials.
 * @returns Promise resolving with workspaces data.
 */
export async function getWorkspaces(): Promise<any> {
  try {
    console.log('Fetching workspaces...');
    const clickupApi = await getApiClient();
    const response = await clickupApi.get('/team');
    return response.data.teams;
  } catch (error) {
    handleApiError(error, 'fetching workspaces');
    throw error;
  }
}

// --- Space Functions ---

/**
 * Fetches all spaces in a workspace.
 * @param workspaceId - The ID of the workspace.
 * @returns Promise resolving with spaces data.
 */
export async function getSpaces(workspaceId: string): Promise<any> {
  try {
    console.log(`Fetching spaces for workspace ID: ${workspaceId}...`);
    const clickupApi = await getApiClient();
    const response = await clickupApi.get(`/team/${workspaceId}/space`);
    return response.data.spaces;
  } catch (error) {
    handleApiError(error, `fetching spaces for workspace ${workspaceId}`);
    throw error;
  }
}

// --- List Functions ---

/**
 * Fetches all lists in a space.
 * @param spaceId - The ID of the space.
 * @returns Promise resolving with lists data.
 */
export async function getLists(spaceId: string): Promise<any> {
  try {
    console.log(`Fetching lists for space ID: ${spaceId}...`);
    const clickupApi = await getApiClient();
    const response = await clickupApi.get(`/space/${spaceId}/list`);
    return response.data.lists;
  } catch (error) {
    handleApiError(error, `fetching lists for space ${spaceId}`);
    throw error;
  }
}

// --- Folder Functions ---

/**
 * Fetches all folders in a space.
 * @param spaceId - The ID of the space.
 * @returns Promise resolving with folders data.
 */
export async function getFolders(spaceId: string): Promise<any> {
  try {
    console.log(`Fetching folders for space ID: ${spaceId}...`);
    const clickupApi = await getApiClient();
    const response = await clickupApi.get(`/space/${spaceId}/folder`);
    return response.data.folders;
  } catch (error) {
    handleApiError(error, `fetching folders for space ${spaceId}`);
    throw error;
  }
}

/**
 * Fetches all lists in a folder.
 * @param folderId - The ID of the folder.
 * @returns Promise resolving with lists data.
 */
export async function getListsInFolder(folderId: string): Promise<any> {
  try {
    console.log(`Fetching lists for folder ID: ${folderId}...`);
    const clickupApi = await getApiClient();
    const response = await clickupApi.get(`/folder/${folderId}/list`);
    return response.data.lists;
  } catch (error) {
    handleApiError(error, `fetching lists for folder ${folderId}`);
    throw error;
  }
}

// --- Tasks Functions ---

/**
 * Fetches tasks from a list.
 * @param listId - The ID of the list.
 * @param options - Optional query parameters (archived, page, order_by, etc.)
 * @returns Promise resolving with tasks data.
 */
export async function getTasks(listId: string, options: any = {}): Promise<any> {
  try {
    console.log(`Fetching tasks for list ID: ${listId}...`);
    const clickupApi = await getApiClient();
    const params = { include_attachments: true, ...options };
    const response = await clickupApi.get(`/list/${listId}/task`, { params });
    return response.data.tasks;
  } catch (error) {
    handleApiError(error, `fetching tasks for list ${listId}`);
    throw error;
  }
}

// --- Docs Functions ---

/**
 * Fetches a specific doc
 * @param docId - The ID of the doc to fetch
 * @returns Promise resolving with doc data
 */
export async function getDoc(docId: string): Promise<any> {
  try {
    console.log(`Fetching doc with ID: ${docId}...`);
    const clickupApi = await getApiClient();
    
    try {
      // First try the direct doc endpoint
      const response = await clickupApi.get(`/doc/${docId}`);
      return response.data;
    } catch (directError) {
      console.log('Could not fetch doc directly. Trying alternative methods...');
      
      // If direct approach fails, try to get the view
      const viewResponse = await clickupApi.get(`/view/${docId}`);
      
      if (viewResponse.data && viewResponse.data.type === 'doc') {
        // We found the doc as a view
        return {
          id: viewResponse.data.id,
          title: viewResponse.data.name,
          content: viewResponse.data.content || '',
          url: viewResponse.data.url,
          team_id: viewResponse.data.team_id
        };
      }
      
      throw new Error('Could not fetch doc content with any available method');
    }
  } catch (error) {
    handleApiError(error, `fetching doc ${docId}`);
    throw error;
  }
}

/**
 * List all docs in a workspace
 * @param workspaceId - The workspace ID
 * @returns Promise resolving with docs data
 */
export async function getDocs(workspaceId: string): Promise<any> {
  try {
    console.log(`Fetching docs for workspace ID: ${workspaceId}...`);
    const clickupApi = await getApiClient();
    
    // First try to get views which might include docs
    const response = await clickupApi.get(`/team/${workspaceId}/view`);
    
    // Filter views to find doc views
    const views = response.data.views || [];
    console.log(`Found ${views.length} views. Searching for docs...`);
    
    // Extract doc information from views
    const docs = views
      .filter((view: any) => view.type === 'doc' || view.type === 'document')
      .map((view: any) => ({
        id: view.id,
        title: view.name,
        url: view.url,
        date_created: view.date_created
      }));
    
    console.log(`Found ${docs.length} docs.`);
    return docs;
  } catch (error) {
    handleApiError(error, `fetching docs for workspace ${workspaceId}`);
    throw error;
  }
}

/**
 * Create a new doc
 * @param listId - The list ID to associate with the doc
 * @param data - Doc data (title, content, etc)
 * @returns Promise resolving with created doc data
 */
export async function createDoc(listId: string, data: any): Promise<any> {
  try {
    console.log(`Creating new doc in list ID: ${listId}...`);
    console.log('Note: ClickUp API has limited support for programmatic doc creation.');
    console.log('This may redirect you to ClickUp to create the doc manually.');
    
    const clickupApi = await getApiClient();
    
    try {
      // Try to create via the list endpoint
      const response = await clickupApi.post(`/list/${listId}/doc`, data);
      return response.data;
    } catch (directError) {
      // Handle case where API doesn't support direct doc creation
      console.log('Direct doc creation failed. Opening ClickUp web interface...');
      
      // Generate a URL to the ClickUp web interface for manual doc creation
      const token = await getAccessToken();
      const clickupWebUrl = `https://app.clickup.com/t/${listId}/docs?token=${token}`;
      
      console.log(`Please create your doc "${data.title}" manually at this URL:`);
      console.log(clickupWebUrl);
      
      // Try to open the URL in a browser
      import('open').then(openModule => {
        openModule.default(clickupWebUrl).catch(() => {
          console.log('Could not open browser automatically. Please open the URL manually.');
        });
      }).catch(() => {
        console.log('Could not import open module. Please open the URL manually.');
      });
      
      return {
        message: 'Manual doc creation required',
        title: data.title,
        url: clickupWebUrl
      };
    }
  } catch (error) {
    handleApiError(error, `creating doc in list ${listId}`);
    throw error;
  }
}

/**
 * Update an existing doc
 * @param docId - The ID of the doc to update
 * @param data - Updated doc data
 * @returns Promise resolving with updated doc data
 */
export async function updateDoc(docId: string, data: any): Promise<any> {
  try {
    console.log(`Updating doc with ID: ${docId}...`);
    const clickupApi = await getApiClient();
    
    try {
      // First try the direct doc endpoint
      const response = await clickupApi.put(`/doc/${docId}`, data);
      return response.data;
    } catch (directError) {
      console.log('Direct doc update failed. Trying alternative methods...');
      
      // Try to update via the view endpoint
      try {
        // First check if this is a view
        const viewResponse = await clickupApi.get(`/view/${docId}`);
        
        if (viewResponse.data && viewResponse.data.type === 'doc') {
          // If this is a doc view, we might not be able to update it via API
          console.log('This appears to be a doc view. Opening ClickUp web interface for manual update...');
          
          // Generate a URL to the ClickUp web interface
          const token = await getAccessToken();
          const clickupWebUrl = viewResponse.data.url || `https://app.clickup.com/d/${docId}?token=${token}`;
          
          console.log(`Please update your doc "${data.title}" manually at this URL:`);
          console.log(clickupWebUrl);
          
          // Try to open the URL in a browser
          import('open').then(openModule => {
            openModule.default(clickupWebUrl).catch(() => {
              console.log('Could not open browser automatically. Please open the URL manually.');
            });
          }).catch(() => {
            console.log('Could not import open module. Please open the URL manually.');
          });
          
          return {
            message: 'Manual doc update required',
            id: docId,
            title: data.title,
            url: clickupWebUrl
          };
        }
      } catch (viewError) {
        // Both direct and view methods failed
        console.error('Could not update doc with any available method');
        throw viewError;
      }
    }
  } catch (error) {
    handleApiError(error, `updating doc ${docId}`);
    throw error;
  }
}

// --- Utility Functions ---

/**
 * Handles and logs errors from Axios requests.
 * @param error - The error object (expected to be AxiosError).
 * @param context - Description of the action being performed (e.g., "fetching task X").
 */
function handleApiError(error: any, context: string): void {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    console.error(`Error ${context}:`);
    if (axiosError.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`  Status: ${axiosError.response.status}`);
      console.error(
        `  Data: ${JSON.stringify(axiosError.response.data, null, 2)}`
      );
      console.error(`  Headers: ${JSON.stringify(axiosError.response.headers)}`);
      if (axiosError.response.status === 401) {
        console.error(
          '\n  Received a 401 Unauthorized error. Please check your CLICKUP_CLIENT_ID and CLICKUP_CLIENT_SECRET in the .env file.'
        );
        // Reset token to force re-auth on next attempt
        accessToken = null;
      }
    } else if (axiosError.request) {
      // The request was made but no response was received
      console.error('  No response received:', axiosError.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('  Error setting up request:', axiosError.message);
    }
  } else {
    // Non-Axios error
    console.error(`An unexpected error occurred ${context}:`, error);
  }
}

// --- Comment Functions ---

/**
 * Fetch all comments for a task.
 * @param taskId - The ID of the task.
 * @returns Promise resolving with an array of comment objects.
 */
export async function getTaskComments(taskId: string): Promise<any[]> {
  try {
    console.log(`Fetching comments for task ID: ${taskId}...`);
    const clickupApi = await getApiClient();
    const response = await clickupApi.get(`/task/${taskId}/comment`);
    return response.data.comments || [];
  } catch (error) {
    // Don't throw — missing comments should never break an export
    handleApiError(error, `fetching comments for task ${taskId}`);
    return [];
  }
}

/**
 * Post a new comment to a task.
 * @param taskId      - The ID of the task.
 * @param commentText - Plain text content of the comment.
 * @returns Promise resolving with the created comment data.
 */
export async function postComment(taskId: string, commentText: string): Promise<any> {
  try {
    console.log(`Posting comment to task ID: ${taskId}...`);
    const clickupApi = await getApiClient();
    const response = await clickupApi.post(`/task/${taskId}/comment`, {
      comment_text: commentText,
      notify_all: false,
    });
    return response.data;
  } catch (error) {
    handleApiError(error, `posting comment to task ${taskId}`);
    throw error;
  }
} 