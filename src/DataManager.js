const fs = require('fs-extra');
const path = require('path');

class DataManager {
  constructor(logger) {
    this.logger = logger;
    this.dataDir = path.join(__dirname, '..', 'data');
    this.ensureDataDirectory();
    this.loadData();
  }

  ensureDataDirectory() {
    try {
      fs.ensureDirSync(this.dataDir);
      this.logger.debug('Data directory ensured:', this.dataDir);
    } catch (error) {
      this.logger.error('Failed to create data directory:', error);
      throw error;
    }
  }

  loadData() {
    try {
      this.prompts = this.loadJSON('prompts.json', {});
      this.substitutes = this.loadJSON('substitutes.json', {});
      this.systemInstructions = this.loadJSON('system.json', 'You are a helpful AI assistant.');
      this.aiModel = this.loadJSON('aiModel.json', 'claude-3-5-sonnet-20241022');
      this.rootPath = this.loadJSON('rootPath.json', '');
      this.history = this.loadJSON('history.json', []);
      this.conversations = this.loadJSON('conversations.json', {});
      
      this.logger.info('Data loaded successfully');
      this.logger.debug('Loaded data:', {
        promptsCount: Object.keys(this.prompts).length,
        substitutesCount: Object.keys(this.substitutes).length,
        historyLength: this.history.length,
        conversationsCount: Object.keys(this.conversations).length
      });
    } catch (error) {
      this.logger.error('Failed to load data:', error);
      throw error;
    }
  }

  loadJSON(filename, defaultValue) {
    const filePath = path.join(this.dataDir, filename);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);
        this.logger.debug(`Loaded ${filename}:`, Object.keys(parsed).length || parsed.length || 'primitive');
        return parsed;
      } else {
        this.logger.debug(`${filename} not found, using default value`);
        return defaultValue;
      }
    } catch (error) {
      this.logger.error(`Error loading ${filename}:`, error);
      return defaultValue;
    }
  }

  saveJSON(filename, data) {
    const filePath = path.join(this.dataDir, filename);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      this.logger.debug(`Saved ${filename}`);
    } catch (error) {
      this.logger.error(`Error saving ${filename}:`, error);
      throw error;
    }
  }

  // Prompts management
  getPrompts() {
    return { ...this.prompts };
  }

  savePrompts(prompts) {
    // Validate prompts don't use reserved command names
    const reservedCommands = ['restart', 'prompts', 'subs', 'system', 'ai-model', 'root'];
    for (const promptName of Object.keys(prompts)) {
      if (reservedCommands.includes(promptName)) {
        throw new Error(`Prompt name "${promptName}" is reserved and cannot be used`);
      }
    }
    
    this.prompts = { ...prompts };
    this.saveJSON('prompts.json', this.prompts);
    this.logger.info(`Saved ${Object.keys(prompts).length} prompts`);
  }

  // Substitutes management
  getSubstitutes() {
    return { ...this.substitutes };
  }

  saveSubstitutes(substitutes) {
    this.substitutes = { ...substitutes };
    this.saveJSON('substitutes.json', this.substitutes);
    this.logger.info(`Saved ${Object.keys(substitutes).length} substitutes`);
  }

  // System instructions
  getSystemInstructions() {
    return this.systemInstructions;
  }

  saveSystemInstructions(instructions) {
    this.systemInstructions = instructions;
    this.saveJSON('system.json', this.systemInstructions);
    this.logger.info('System instructions updated');
  }

  // AI Model
  getAIModel() {
    return this.aiModel;
  }

  saveAIModel(model) {
    const validModels = ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'];
    if (!validModels.includes(model)) {
      throw new Error(`Invalid AI model: ${model}. Valid models: ${validModels.join(', ')}`);
    }
    
    this.aiModel = model;
    this.saveJSON('aiModel.json', this.aiModel);
    this.logger.info(`AI model set to: ${model}`);
  }

  // Root path
  getRootPath() {
    return this.rootPath;
  }

  saveRootPath(rootPath) {
    this.rootPath = rootPath;
    this.saveJSON('rootPath.json', this.rootPath);
    this.logger.info(`Root path set to: ${rootPath}`);
  }

  // History management
  getHistory() {
    return [...this.history];
  }

  saveHistory(history) {
    this.history = [...history];
    this.saveJSON('history.json', this.history);
  }

  clearHistory() {
    this.history = [];
    this.saveJSON('history.json', this.history);
    this.logger.info('History cleared');
  }

  // Conversations management
  getConversations() {
    return { ...this.conversations };
  }

  saveConversation(conversationId, messageData) {
    if (!this.conversations[conversationId]) {
      this.conversations[conversationId] = [];
    }
    
    this.conversations[conversationId].push(messageData);
    this.saveJSON('conversations.json', this.conversations);
    this.logger.debug(`Saved conversation message for: ${conversationId}`);
  }

  getConversation(conversationId) {
    return this.conversations[conversationId] || [];
  }

  deleteConversation(conversationId) {
    delete this.conversations[conversationId];
    this.saveJSON('conversations.json', this.conversations);
    this.logger.info(`Deleted conversation: ${conversationId}`);
  }

  deleteMessagePair(conversationId, messageIndex) {
    if (this.conversations[conversationId] && this.conversations[conversationId][messageIndex]) {
      this.conversations[conversationId].splice(messageIndex, 1);
      this.saveJSON('conversations.json', this.conversations);
      this.logger.info(`Deleted message pair ${messageIndex} from conversation: ${conversationId}`);
    }
  }

  // Backup and restore
  createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(this.dataDir, 'backups', timestamp);
    
    try {
      fs.ensureDirSync(backupDir);
      fs.copySync(this.dataDir, backupDir, {
        filter: (src) => !src.includes('backups')
      });
      this.logger.info(`Backup created: ${backupDir}`);
      return backupDir;
    } catch (error) {
      this.logger.error('Backup failed:', error);
      throw error;
    }
  }

  // Data validation and repair
  validateData() {
    const issues = [];
    
    // Check for circular references in substitutes
    const visited = new Set();
    const recursionStack = new Set();
    
    const checkCircular = (key, path = []) => {
      if (recursionStack.has(key)) {
        issues.push(`Circular reference detected in substitutes: ${path.join(' -> ')} -> ${key}`);
        return;
      }
      
      if (visited.has(key)) return;
      
      visited.add(key);
      recursionStack.add(key);
      
      const content = this.substitutes[key];
      if (content) {
        const links = content.match(/\{\{([^}]+)\}\}/g) || [];
        for (const link of links) {
          const linkKey = link.slice(2, -2);
          if (this.substitutes[linkKey]) {
            checkCircular(linkKey, [...path, key]);
          }
        }
      }
      
      recursionStack.delete(key);
    };
    
    for (const key of Object.keys(this.substitutes)) {
      checkCircular(key);
    }
    
    // Validate file paths in root directory
    if (this.rootPath && !fs.existsSync(this.rootPath)) {
      issues.push(`Root path does not exist: ${this.rootPath}`);
    }
    
    this.logger.info(`Data validation completed. Issues found: ${issues.length}`);
    if (issues.length > 0) {
      this.logger.warn('Validation issues:', issues);
    }
    
    return issues;
  }
}

module.exports = DataManager;
