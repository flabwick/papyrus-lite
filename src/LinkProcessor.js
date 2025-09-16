const fs = require('fs-extra');
const path = require('path');

class LinkProcessor {
  constructor(dataManager, logger) {
    this.dataManager = dataManager;
    this.logger = logger;
    this.maxDepth = 10; // Prevent infinite recursion
  }

  async processLinks(content, depth = 0) {
    if (depth > this.maxDepth) {
      this.logger.warn(`Maximum recursion depth (${this.maxDepth}) reached while processing links`);
      return content;
    }

    const linkPattern = /\{\{([^}]+)\}\}/g;
    let processed = content;
    const matches = [...content.matchAll(linkPattern)];
    
    this.logger.debug(`Processing ${matches.length} links at depth ${depth}`);

    for (const match of matches) {
      const linkContent = match[1].trim();
      const fullMatch = match[0];
      
      try {
        const replacement = await this.resolveLink(linkContent, depth + 1);
        processed = processed.replace(fullMatch, replacement);
        this.logger.debug(`Resolved link: ${linkContent} -> ${replacement.substring(0, 100)}...`);
      } catch (error) {
        this.logger.error(`Failed to resolve link: ${linkContent}`, error);
        // Keep the original link if resolution fails
        const errorReplacement = `{{${linkContent}}} [ERROR: ${error.message}]`;
        processed = processed.replace(fullMatch, errorReplacement);
      }
    }

    return processed;
  }

  async resolveLink(linkContent, depth) {
    // First check if it's a substitute
    const substitutes = this.dataManager.getSubstitutes();
    if (substitutes[linkContent]) {
      this.logger.debug(`Found substitute: ${linkContent}`);
      return await this.processLinks(substitutes[linkContent], depth);
    }

    // Check if it's a folder wildcard pattern (folder/*)
    if (linkContent.endsWith('/*')) {
      return await this.resolveFolderWildcard(linkContent, depth);
    }

    // Then check if it's a file path
    const rootPath = this.dataManager.getRootPath();
    if (!rootPath) {
      throw new Error('Root path not set. Use /root command to set the root directory.');
    }

    let filePath;
    if (path.isAbsolute(linkContent)) {
      filePath = linkContent;
    } else {
      filePath = path.resolve(rootPath, linkContent);
    }

    // Validate file path is within root directory (security check)
    const normalizedRoot = path.resolve(rootPath);
    const normalizedFile = path.resolve(filePath);
    if (!normalizedFile.startsWith(normalizedRoot)) {
      throw new Error(`File path outside root directory: ${linkContent}`);
    }

    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      throw new Error(`File not found: ${linkContent}`);
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.md', '.txt'].includes(ext)) {
      throw new Error(`Unsupported file type: ${ext}. Only .md and .txt files are supported.`);
    }

    // Read and process file content
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      this.logger.debug(`Read file: ${filePath} (${fileContent.length} characters)`);
      
      // Recursively process any links in the file content
      return await this.processLinks(fileContent, depth);
    } catch (error) {
      throw new Error(`Failed to read file: ${linkContent} - ${error.message}`);
    }
  }

  async resolveFolderWildcard(linkContent, depth) {
    const folderPath = linkContent.slice(0, -2); // Remove the /*
    const rootPath = this.dataManager.getRootPath();
    
    if (!rootPath) {
      throw new Error('Root path not set. Use /root command to set the root directory.');
    }

    let fullFolderPath;
    if (path.isAbsolute(folderPath)) {
      fullFolderPath = folderPath;
    } else {
      fullFolderPath = path.resolve(rootPath, folderPath);
    }

    // Validate folder path is within root directory (security check)
    const normalizedRoot = path.resolve(rootPath);
    const normalizedFolder = path.resolve(fullFolderPath);
    if (!normalizedFolder.startsWith(normalizedRoot)) {
      throw new Error(`Folder path outside root directory: ${folderPath}`);
    }

    // Check if folder exists
    if (!await fs.pathExists(fullFolderPath)) {
      throw new Error(`Folder not found: ${folderPath}`);
    }

    const stat = await fs.stat(fullFolderPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${folderPath}`);
    }

    // Read all files in the folder
    try {
      const files = await fs.readdir(fullFolderPath);
      const supportedFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.md', '.txt'].includes(ext);
      }).sort(); // Sort for consistent ordering

      if (supportedFiles.length === 0) {
        this.logger.warn(`No supported files (.md, .txt) found in folder: ${folderPath}`);
        return `[No supported files found in ${folderPath}]`;
      }

      this.logger.debug(`Found ${supportedFiles.length} files in folder: ${folderPath}`);

      // Read and combine all file contents
      const combinedContent = [];
      for (const file of supportedFiles) {
        const filePath = path.join(fullFolderPath, file);
        try {
          const fileContent = await fs.readFile(filePath, 'utf8');
          
          // Add a header for each file
          combinedContent.push(`\n--- ${file} ---\n`);
          combinedContent.push(fileContent);
          
          this.logger.debug(`Read file from folder: ${file} (${fileContent.length} characters)`);
        } catch (error) {
          this.logger.error(`Failed to read file ${file} from folder ${folderPath}:`, error);
          combinedContent.push(`\n--- ${file} ---\n[ERROR: Failed to read file - ${error.message}]\n`);
        }
      }

      const result = combinedContent.join('');
      
      // Recursively process any links in the combined content
      return await this.processLinks(result, depth);
    } catch (error) {
      throw new Error(`Failed to read folder: ${folderPath} - ${error.message}`);
    }
  }

  // Extract all links from content for validation/preview
  extractLinks(content) {
    const linkPattern = /\{\{([^}]+)\}\}/g;
    const links = [];
    let match;

    while ((match = linkPattern.exec(content)) !== null) {
      links.push({
        full: match[0],
        content: match[1].trim(),
        index: match.index
      });
    }

    return links;
  }

  // Validate all links in content
  async validateLinks(content) {
    const links = this.extractLinks(content);
    const results = [];

    for (const link of links) {
      try {
        await this.resolveLink(link.content, 0);
        results.push({
          link: link.content,
          valid: true,
          error: null
        });
      } catch (error) {
        results.push({
          link: link.content,
          valid: false,
          error: error.message
        });
      }
    }

    return results;
  }

  // Get dependency tree for a piece of content
  async getDependencyTree(content, visited = new Set()) {
    const links = this.extractLinks(content);
    const tree = {
      content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
      links: []
    };

    for (const link of links) {
      if (visited.has(link.content)) {
        tree.links.push({
          name: link.content,
          type: 'circular',
          children: null
        });
        continue;
      }

      visited.add(link.content);

      try {
        const substitutes = this.dataManager.getSubstitutes();
        if (substitutes[link.content]) {
          const subtree = await this.getDependencyTree(substitutes[link.content], new Set(visited));
          tree.links.push({
            name: link.content,
            type: 'substitute',
            children: subtree
          });
        } else {
          // It's a file path
          const rootPath = this.dataManager.getRootPath();
          let filePath;
          if (path.isAbsolute(link.content)) {
            filePath = link.content;
          } else {
            filePath = path.resolve(rootPath, link.content);
          }

          if (await fs.pathExists(filePath)) {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const subtree = await this.getDependencyTree(fileContent, new Set(visited));
            tree.links.push({
              name: link.content,
              type: 'file',
              path: filePath,
              children: subtree
            });
          } else {
            tree.links.push({
              name: link.content,
              type: 'missing',
              children: null
            });
          }
        }
      } catch (error) {
        tree.links.push({
          name: link.content,
          type: 'error',
          error: error.message,
          children: null
        });
      }

      visited.delete(link.content);
    }

    return tree;
  }

  // Check for circular dependencies in substitutes
  checkCircularDependencies() {
    const substitutes = this.dataManager.getSubstitutes();
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];

    const dfs = (key, path = []) => {
      if (recursionStack.has(key)) {
        const cycleStart = path.indexOf(key);
        cycles.push([...path.slice(cycleStart), key]);
        return;
      }

      if (visited.has(key)) return;

      visited.add(key);
      recursionStack.add(key);

      const content = substitutes[key];
      if (content) {
        const links = this.extractLinks(content);
        for (const link of links) {
          if (substitutes[link.content]) {
            dfs(link.content, [...path, key]);
          }
        }
      }

      recursionStack.delete(key);
    };

    for (const key of Object.keys(substitutes)) {
      if (!visited.has(key)) {
        dfs(key);
      }
    }

    return cycles;
  }
}

module.exports = LinkProcessor;
