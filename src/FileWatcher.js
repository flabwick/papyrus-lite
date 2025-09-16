const chokidar = require('chokidar');
const path = require('path');
const EventEmitter = require('events');

class FileWatcher extends EventEmitter {
  constructor(dataManager, logger) {
    super();
    this.dataManager = dataManager;
    this.logger = logger;
    this.watcher = null;
    this.currentRootPath = null;
  }

  updateRootPath(rootPath) {
    try {
      // Stop existing watcher
      if (this.watcher) {
        this.watcher.close();
        this.logger.debug('Stopped existing file watcher');
      }

      if (!rootPath) {
        this.logger.info('No root path provided, file watching disabled');
        return;
      }

      this.currentRootPath = rootPath;

      // Watch for .md and .txt files
      const watchPattern = path.join(rootPath, '**/*.{md,txt}');
      
      this.watcher = chokidar.watch(watchPattern, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true,
        followSymlinks: false,
        depth: 10 // Reasonable depth limit
      });

      this.watcher
        .on('add', (filePath) => {
          this.logger.debug(`File added: ${filePath}`);
          this.emit('fileChanged', filePath);
        })
        .on('change', (filePath) => {
          this.logger.debug(`File changed: ${filePath}`);
          this.emit('fileChanged', filePath);
        })
        .on('unlink', (filePath) => {
          this.logger.debug(`File removed: ${filePath}`);
          this.emit('fileChanged', filePath);
        })
        .on('error', (error) => {
          this.logger.error('File watcher error:', error);
          this.emit('error', error);
        })
        .on('ready', () => {
          this.logger.info(`File watcher initialized for: ${rootPath}`);
          this.logger.debug(`Watching pattern: ${watchPattern}`);
        });

    } catch (error) {
      this.logger.error('Failed to initialize file watcher:', error);
      throw error;
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.logger.info('File watcher stopped');
    }
  }

  getWatchedFiles() {
    if (!this.watcher) {
      return [];
    }

    return this.watcher.getWatched();
  }

  isWatching() {
    return this.watcher !== null;
  }

  getCurrentRootPath() {
    return this.currentRootPath;
  }
}

module.exports = FileWatcher;
