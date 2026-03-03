# ClickUp Local Updater

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9.5-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)

A command-line interface (CLI) tool to interact with the ClickUp API for updating tasks and documentation locally.

## Features

*   List ClickUp workspaces, spaces, folders, lists, and tasks
*   Fetch individual ClickUp task details
*   Update ClickUp task details (status, assignees, etc.)
*   Export tasks to local Markdown files for offline editing
*   Sync changes from local files back to ClickUp
*   Export ClickUp Docs to local Markdown files for editing
*   Push changes in local Doc files back to ClickUp
*   Create new ClickUp Docs

## Prerequisites

*   [Node.js](https://nodejs.org/) (v14.x or higher recommended)
*   [pnpm](https://pnpm.io/) (installed globally: `npm install -g pnpm`)
*   A ClickUp account
*   A ClickUp API App created in your ClickUp settings ("Integrations" > "ClickUp API" > "+ New App"). This will provide you with a Client ID and Client Secret.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/clickup-local-updater.git
    cd clickup-local-updater
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

## Configuration

1.  Create a `.env` file in the root of the project directory.
2.  Add your ClickUp API App credentials to the `.env` file:

    ```dotenv
    CLICKUP_CLIENT_ID=your_client_id_here
    CLICKUP_CLIENT_SECRET=your_client_secret_here
    ```

    Replace `your_client_id_here` and `your_client_secret_here` with the credentials from the ClickUp App you created.

    *Note: The `.env` file is included in `.gitignore` to prevent accidentally committing your secrets.*

## Quick Start

```bash
# List all workspaces
npx ts-node src/cli.ts list workspaces

# Export a task to edit locally
npx ts-node src/cli.ts sync export-task <task_id>

# Push changes back to ClickUp
npx ts-node src/cli.ts sync push <file_path>
```

See [COMMANDS.md](COMMANDS.md) for a complete list of available commands.

## Usage

Once configured, you can use the CLI to interact with your ClickUp workspaces, tasks, and documents.

### How Local Files Work

The ClickUp API itself works with JSON for data exchange. When this tool:
- **Exports a task/document**: It transforms the JSON response from ClickUp into a Markdown file with YAML frontmatter
- **Imports a task/document**: It parses the Markdown file back into JSON format to send to the ClickUp API

This approach gives you a convenient way to modify content locally with any text editor while maintaining the metadata needed for synchronization.

### Navigating ClickUp Resources

```bash
# List all your workspaces
npx ts-node src/cli.ts list workspaces

# List spaces in a workspace
npx ts-node src/cli.ts list spaces -w <workspace_id>

# List folders in a space
npx ts-node src/cli.ts list folders -s <space_id>

# List lists in a folder
npx ts-node src/cli.ts list lists -f <folder_id>

# List tasks in a list
npx ts-node src/cli.ts list tasks -l <list_id>
```

### Working with Tasks Locally

```bash
# Export a task to a local file (includes attachments + full comment thread)
npx ts-node src/cli.ts sync export-task <task_id>

# Edit the file — update description, status, or add new comments (see below)

# Push changes back to ClickUp (name, description, status, and any new comments)
npx ts-node src/cli.ts sync push <file_path>
```

### Working with ClickUp Docs

```bash
# Force-export a doc to a local file
npx ts-node src/cli.ts doc force-export -t "Document Title" -i <doc_id> -w <workspace_id>

# Edit the file in your favorite editor...

# Push changes back to ClickUp
npx ts-node src/cli.ts doc push <file_path>
```

## ClickUp API Limitations

While the ClickUp API provides good support for working with tasks, it has several limitations when dealing with docs:

1. **Docs API Restrictions**: The ClickUp API has limited support for programmatically creating, updating, and retrieving docs through their API endpoints. Some operations may fail with 404 errors even when the documents exist.

2. **API IDs vs. UI IDs**: The document IDs used in the URL of the ClickUp web interface may not be the same as the IDs needed for API operations.

3. **Workarounds Implemented**:
   - `force-export`: Allows you to create a local copy of a doc by manually providing the title and ID
   - When pushing doc changes fails via API, the tool will attempt to open the ClickUp web interface for manual editing

4. **Best Practices**:
   - For simple editing of documents, the local Markdown file approach works well
   - For more complex document operations, you may need to use the ClickUp web interface directly

These limitations are inherent to the ClickUp platform and not a limitation of this CLI tool. The Tasks API functionality should work reliably for task operations.

### Document Operations
The ClickUp Docs API has limitations that affect certain operations:

## Security Considerations

### Token Storage
- The application stores your ClickUp API access token in a local file (`clickup_token_[user-hash].json`)
- Each user/machine combination generates a unique token file
- Never share your token files with others
- Do not commit token files to version control
- If you believe your token has been compromised, revoke it from your ClickUp account settings

### Environment Variables
- Your `.env` file contains sensitive credentials
- Never share your `.env` file or commit it to version control
- Each user should create their own OAuth application credentials in ClickUp

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [ClickUp API](https://clickup.com/api) for providing the API functionality
- [Commander.js](https://github.com/tj/commander.js/) for the CLI framework
- [Kris](https://araptus.com) - Project creator and maintainer 