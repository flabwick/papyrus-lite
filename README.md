# Papyrus Lite - AI Prompt Manager

A powerful web-based CLI application for managing AI prompts with recursive link substitution, file monitoring, and integrated Claude AI chat functionality.

## Features

- **CLI Interface**: Terminal-style command interface with autocomplete and history
- **Prompt Management**: Create, edit, and organize AI prompts with validation
- **Link Substitution**: Recursive `{{}}` link system for dynamic content inclusion
- **File Monitoring**: Automatic detection of changes to `.md` and `.txt` files
- **AI Integration**: Built-in Claude 3.5 Sonnet and Claude 3 Haiku support
- **Chat Interface**: Interactive AI conversations with history and export
- **Data Persistence**: All data saved across sessions
- **Export Functionality**: Save content to markdown files
- **Modern UI**: Dark theme with responsive design

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- Anthropic API key

### Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd /Users/jameschadwick/Desktop/CODING/papyrus-lite
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

5. **Access the application:**
   - Local: http://localhost:4201
   - External: dev.jimboslice.xyz (if configured with nginx)

## Commands Reference

### Core Commands

| Command | Description |
|---------|-------------|
| `/restart` | Restart the CLI and clear history |
| `/prompts` | Open prompt management interface |
| `/subs` | Open substitute management interface |
| `/system` | Edit AI system instructions |
| `/ai-model` | Select AI model (Claude 3.5 Sonnet or Haiku) |
| `/root` | Set root folder path for file links |
| `/help` | Show help information |

### Prompt Usage

- **Execute Prompt**: Type `/[prompt-name]` to open any saved prompt
- **Raw Content**: Type any text (with or without `{{}}` links) to preview and process

## Link System

### Syntax
Use `{{link-name}}` to create dynamic links that substitute content at runtime.

### Link Types

1. **Substitute Links**: Reference other substitutes
   ```
   {{my-substitute}}
   ```

2. **File Links**: Reference files in the root directory
   ```
   {{path/to/file.md}}
   {{document.txt}}
   ```

### Recursive Substitution

Links support recursive substitution. Example:

**Substitutes:**
- `summary-prompt`: "Summarize {{doc1}} and {{doc2}}"
- `doc1`: "{{reports/report1.md}}"
- `doc2`: "{{reports/report2.md}}"

**Result:** When using `{{summary-prompt}}`, it expands to include the full content of both report files.

### Supported File Types
- `.md` (Markdown files)
- `.txt` (Text files)

## Interface Guide

### CLI Interface

- **Command Input**: Type commands or prompts in the input field
- **Autocomplete**: Start typing to see available commands and prompts
- **History**: Use ↑/↓ arrows to navigate command history
- **Keyboard Shortcuts**:
  - `Enter`: Execute command
  - `Tab`: Accept first autocomplete suggestion
  - `Escape`: Close modals or hide autocomplete

### Prompt Management (`/prompts`)

1. **Add New Prompt**: Click "Add New Prompt" button
2. **Edit Prompt**: Click "Edit" next to any existing prompt
3. **Delete Prompt**: Click "Delete" (with confirmation)
4. **Validation**: Prompt names cannot use reserved command names

### Substitute Management (`/subs`)

1. **Add Substitute**: Click "Add New Substitute" button
2. **Edit/Delete**: Use buttons next to each substitute
3. **Recursive References**: Substitutes can reference other substitutes or files
4. **Validation**: System detects and prevents circular references

### Prompt Preview

When you execute a prompt or enter raw content:

1. **Raw View**: Shows original content with `{{}}` links intact
2. **Render Toggle**: Click "Render" to process all links
3. **Actions**:
   - **Copy**: Copy content to clipboard (raw or rendered)
   - **Send to AI**: Open AI chat with the content
   - **Export**: Save to `.md` file

### AI Chat Interface

1. **Initial Message**: Content is automatically sent to AI
2. **Follow-up**: Type additional messages in the input field
3. **Message Actions**: Copy or export individual AI responses
4. **History**: Full conversation context maintained
5. **Models**: Uses selected AI model from `/ai-model` settings

## Configuration

### System Instructions (`/system`)
Set custom system instructions that will be sent with every AI request.

### AI Model Selection (`/ai-model`)
Choose between:
- **Claude 3.5 Sonnet**: Most capable, best for complex tasks
- **Claude 3 Haiku**: Fast and efficient, good for simple tasks

### Root Path (`/root`)
Set the base directory for file link resolution. All `{{file.md}}` links will be resolved relative to this path.

## File Monitoring

The system automatically monitors the root directory for changes to `.md` and `.txt` files. When files are modified:
- Changes are detected in real-time
- No need to restart the application
- Links are resolved with updated content

## Data Persistence

All data is automatically saved to the `data/` directory:
- `prompts.json`: Saved prompts
- `substitutes.json`: Substitute definitions
- `system.json`: System instructions
- `aiModel.json`: Selected AI model
- `rootPath.json`: Root directory path
- `history.json`: Command history
- `conversations.json`: AI chat conversations

## Development

### Project Structure
```
papyrus-lite/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables
├── src/                   # Backend services
│   ├── DataManager.js     # Data persistence
│   ├── LinkProcessor.js   # Link substitution engine
│   ├── AIService.js       # Anthropic API integration
│   ├── FileWatcher.js     # File system monitoring
│   └── Logger.js          # Logging system
├── public/                # Frontend files
│   ├── index.html         # Main HTML
│   ├── app.js             # Frontend JavaScript
│   └── styles.css         # CSS styling
├── data/                  # Persistent data (auto-created)
└── logs/                  # Application logs (auto-created)
```

### Scripts
- `npm start`: Start production server
- `npm run dev`: Start with nodemon for development
- `npm run debug`: Start with Node.js inspector

### Debugging

The application includes comprehensive logging:
- **Console Output**: Colored logs with timestamps
- **File Logging**: Daily log files in `logs/` directory
- **Debug Mode**: Set `DEBUG_MODE=true` in `.env`
- **Log Levels**: error, warn, info, debug

### Error Handling

- **Client-side**: Toast notifications for errors and success messages
- **Server-side**: Comprehensive error logging and graceful degradation
- **AI Service**: Proper handling of rate limits, authentication, and service errors
- **File System**: Validation of paths and permissions

## Security Considerations

- **API Keys**: Never commit `.env` files to version control
- **File Access**: Path validation prevents directory traversal attacks
- **Input Validation**: All user inputs are sanitized and validated
- **CORS**: Configured for secure cross-origin requests

## Troubleshooting

### Common Issues

1. **"ANTHROPIC_API_KEY is required"**
   - Ensure `.env` file exists with valid API key
   - Restart server after adding API key

2. **"Root path does not exist"**
   - Verify the path in `/root` command exists
   - Use absolute paths for reliability

3. **File links not resolving**
   - Check that files exist in the root directory
   - Verify file extensions are `.md` or `.txt`
   - Ensure proper file permissions

4. **Port 4201 already in use**
   - Change `PORT` in `.env` file
   - Or stop other processes using the port

### Performance Tips

- Keep file sizes reasonable (< 1MB per file)
- Avoid deeply nested recursive substitutions (max depth: 10)
- Use specific file paths rather than wildcards
- Monitor log files for performance warnings

## API Integration

The application uses the Anthropic Claude API:
- **Authentication**: API key via environment variable
- **Models**: Claude 3.5 Sonnet and Claude 3 Haiku
- **Rate Limiting**: Automatic handling with error messages
- **Streaming**: Real-time response streaming (future enhancement)

## License

MIT License - Feel free to modify and distribute.

## Support

For issues or questions:
1. Check the logs in `logs/` directory
2. Enable debug mode for detailed logging
3. Verify all configuration settings
4. Ensure API key is valid and has sufficient credits

---

**Built for efficient AI prompt management and seamless content integration.**