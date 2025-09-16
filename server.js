const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const cors = require('cors');
require('dotenv').config();

const DataManager = require('./src/DataManager');
const LinkProcessor = require('./src/LinkProcessor');
const AIService = require('./src/AIService');
const FileWatcher = require('./src/FileWatcher');
const Logger = require('./src/Logger');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 120000,
  pingInterval: 30000,
  upgradeTimeout: 60000,
  allowUpgrades: true,
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e8,
  connectTimeout: 60000
});

const PORT = process.env.PORT || 4201;
const logger = new Logger();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize services
const dataManager = new DataManager(logger);
const linkProcessor = new LinkProcessor(dataManager, logger);
const aiService = new AIService(logger);
const fileWatcher = new FileWatcher(dataManager, logger);

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Initialize client with current data
  socket.emit('init', {
    prompts: dataManager.getPrompts(),
    substitutes: dataManager.getSubstitutes(),
    systemInstructions: dataManager.getSystemInstructions(),
    aiModel: dataManager.getAIModel(),
    rootPath: dataManager.getRootPath(),
    history: dataManager.getHistory()
  });

  // Add connection debugging
  socket.on('disconnect', (reason) => {
    logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('connect_error', (error) => {
    logger.error(`Connection error for ${socket.id}:`, error);
  });

  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error);
  });

  // Command handlers
  socket.on('command', async (data) => {
    try {
      logger.debug(`Received command: ${data.command}`, data);
      const result = await handleCommand(data.command, data.args, socket);
      socket.emit('commandResult', result);
    } catch (error) {
      logger.error('Command error:', error);
      socket.emit('error', { message: error.message, stack: error.stack });
    }
  });

  // Data update handlers
  socket.on('updatePrompts', (prompts) => {
    try {
      dataManager.savePrompts(prompts);
      socket.broadcast.emit('promptsUpdated', prompts);
      logger.info('Prompts updated');
    } catch (error) {
      logger.error('Error updating prompts:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('updateSubstitutes', (substitutes) => {
    try {
      dataManager.saveSubstitutes(substitutes);
      socket.broadcast.emit('substitutesUpdated', substitutes);
      logger.info('Substitutes updated');
    } catch (error) {
      logger.error('Error updating substitutes:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('updateSystemInstructions', (instructions) => {
    try {
      dataManager.saveSystemInstructions(instructions);
      socket.broadcast.emit('systemInstructionsUpdated', instructions);
      logger.info('System instructions updated');
    } catch (error) {
      logger.error('Error updating system instructions:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('updateAIModel', (model) => {
    try {
      dataManager.saveAIModel(model);
      socket.broadcast.emit('aiModelUpdated', model);
      logger.info(`AI model updated to: ${model}`);
    } catch (error) {
      logger.error('Error updating AI model:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('updateRootPath', (rootPath) => {
    try {
      if (!fs.existsSync(rootPath)) {
        throw new Error('Root path does not exist');
      }
      dataManager.saveRootPath(rootPath);
      fileWatcher.updateRootPath(rootPath);
      socket.broadcast.emit('rootPathUpdated', rootPath);
      logger.info(`Root path updated to: ${rootPath}`);
    } catch (error) {
      logger.error('Error updating root path:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // AI chat handlers
  socket.on('sendToAI', async (data) => {
    try {
      const { content, conversationId, systemInstructions } = data;
      const model = dataManager.getAIModel();
      
      logger.info(`Sending to AI (${model}):`, { conversationId, contentLength: content.length });
      
      const response = await aiService.sendMessage(content, model, systemInstructions);
      
      // Save conversation
      dataManager.saveConversation(conversationId, {
        userMessage: content,
        aiResponse: response,
        timestamp: new Date().toISOString(),
        model: model
      });
      
      socket.emit('aiResponse', {
        conversationId,
        response,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('AI service error:', error);
      socket.emit('aiError', { 
        message: error.message,
        conversationId: data.conversationId 
      });
    }
  });

  // File operations
  socket.on('exportContent', async (data) => {
    try {
      const { content, filePath } = data;
      await fs.writeFile(filePath, content, 'utf8');
      logger.info(`Content exported to: ${filePath}`);
      socket.emit('exportSuccess', { filePath });
    } catch (error) {
      logger.error('Export error:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Link processing
  socket.on('processLinks', async (data) => {
    try {
      const { content } = data;
      const processed = await linkProcessor.processLinks(content);
      socket.emit('linksProcessed', { processed });
    } catch (error) {
      logger.error('Link processing error:', error);
      socket.emit('error', { message: error.message });
    }
  });

});

// Command handler function
async function handleCommand(command, args, socket) {
  const history = dataManager.getHistory();
  
  // Add command to history (async to prevent blocking)
  history.push({ command, args, timestamp: new Date().toISOString() });
  setImmediate(() => {
    try {
      dataManager.saveHistory(history);
    } catch (error) {
      logger.error('Failed to save history:', error);
    }
  });

  switch (command) {
    case 'restart':
      dataManager.clearHistory();
      return { type: 'restart', message: 'CLI restarted' };
    
    case 'prompts':
      return { 
        type: 'ui', 
        component: 'prompts', 
        data: dataManager.getPrompts() 
      };
    
    case 'subs':
      return { 
        type: 'ui', 
        component: 'substitutes', 
        data: dataManager.getSubstitutes() 
      };
    
    case 'system':
      return { 
        type: 'ui', 
        component: 'system', 
        data: dataManager.getSystemInstructions() 
      };
    
    case 'ai-model':
      return { 
        type: 'ui', 
        component: 'aiModel', 
        data: {
          current: dataManager.getAIModel(),
          available: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307']
        }
      };
    
    case 'root':
      return { 
        type: 'ui', 
        component: 'root', 
        data: dataManager.getRootPath() 
      };
    
    default:
      // Check if it's a prompt name
      const prompts = dataManager.getPrompts();
      if (prompts[command]) {
        return {
          type: 'ui',
          component: 'promptPreview',
          data: {
            name: command,
            content: prompts[command],
            isPrompt: true
          }
        };
      }
      
      // Treat as raw content with potential links
      return {
        type: 'ui',
        component: 'promptPreview',
        data: {
          name: 'Raw Input',
          content: command + (args ? ' ' + args.join(' ') : ''),
          isPrompt: false
        }
      };
  }
}

// File watcher setup
fileWatcher.on('fileChanged', (filePath) => {
  io.emit('fileChanged', { filePath });
  logger.info(`File changed: ${filePath}`);
});

// Error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
server.listen(PORT, () => {
  logger.info(`Papyrus Lite server running on port ${PORT}`);
  logger.info(`Access at: http://localhost:${PORT}`);
  logger.info(`External access: dev.jimboslice.xyz`);
  
  // Initialize file watcher if root path is set
  const rootPath = dataManager.getRootPath();
  if (rootPath) {
    const resolvedPath = path.isAbsolute(rootPath) ? rootPath : path.join(__dirname, rootPath);
    if (fs.existsSync(resolvedPath)) {
      fileWatcher.updateRootPath(resolvedPath);
      logger.info(`File watcher initialized for: ${rootPath} (resolved: ${resolvedPath})`);
    } else {
      logger.warn(`Root path does not exist: ${rootPath} (resolved: ${resolvedPath})`);
    }
  }
});

module.exports = { app, server, io };
