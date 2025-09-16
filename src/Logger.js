const fs = require('fs-extra');
const path = require('path');

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.debugMode = process.env.DEBUG_MODE === 'true';
    this.logDir = path.join(__dirname, '..', 'logs');
    this.logFile = path.join(this.logDir, `papyrus-lite-${new Date().toISOString().split('T')[0]}.log`);
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    try {
      fs.ensureDirSync(this.logDir);
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    let formattedMessage = `${prefix} ${message}`;
    
    if (data) {
      if (typeof data === 'object') {
        formattedMessage += ` ${JSON.stringify(data, null, 2)}`;
      } else {
        formattedMessage += ` ${data}`;
      }
    }
    
    return formattedMessage;
  }

  writeToFile(message) {
    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  log(level, message, data = null) {
    if (!this.shouldLog(level)) return;
    
    const formattedMessage = this.formatMessage(level, message, data);
    
    // Console output with colors
    const colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      debug: '\x1b[90m'  // Gray
    };
    
    const reset = '\x1b[0m';
    console.log(`${colors[level] || ''}${formattedMessage}${reset}`);
    
    // File output (without colors)
    this.writeToFile(formattedMessage);
  }

  error(message, data = null) {
    this.log('error', message, data);
  }

  warn(message, data = null) {
    this.log('warn', message, data);
  }

  info(message, data = null) {
    this.log('info', message, data);
  }

  debug(message, data = null) {
    if (this.debugMode) {
      this.log('debug', message, data);
    }
  }

  // Performance timing
  time(label) {
    if (this.debugMode) {
      console.time(label);
    }
  }

  timeEnd(label) {
    if (this.debugMode) {
      console.timeEnd(label);
    }
  }

  // Request logging
  logRequest(req, res, next) {
    const start = Date.now();
    const { method, url, ip } = req;
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;
      
      this.info(`${method} ${url}`, {
        ip,
        statusCode,
        duration: `${duration}ms`
      });
    });
    
    if (next) next();
  }

  // Error stack trace formatting
  logError(error, context = {}) {
    this.error('Error occurred:', {
      message: error.message,
      stack: error.stack,
      context
    });
  }

  // Clean old log files (keep last 7 days)
  cleanOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir);
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
      
      for (const file of files) {
        if (file.startsWith('papyrus-lite-') && file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime < sevenDaysAgo) {
            fs.unlinkSync(filePath);
            this.info(`Cleaned old log file: ${file}`);
          }
        }
      }
    } catch (error) {
      this.error('Failed to clean old logs:', error);
    }
  }
}

module.exports = Logger;
