/**
 * Structured Logger for ToolFlow
 * Provides standardized log levels, formatted metadata, and multi-destination dispatching.
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  constructor(options = {}) {
    this.name = options.name || 'ToolFlow';
    this.runId = options.runId || null;
    const envLevel = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
    this.level = LOG_LEVELS[envLevel] !== undefined ? LOG_LEVELS[envLevel] : LOG_LEVELS.INFO;
    this.listeners = [];
  }

  setLevel(levelName) {
    const upper = String(levelName).toUpperCase();
    if (LOG_LEVELS[upper] !== undefined) {
      this.level = LOG_LEVELS[upper];
    }
  }

  addListener(fn) {
    if (typeof fn === 'function') {
      this.listeners.push(fn);
    }
  }

  format(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const prefix = this.runId ? `[Run ${this.runId.substring(0, 8)}]` : `[${this.name}]`;
    const formatted = `[${timestamp}] [${level}] ${prefix} ${message}`;
    return {
      timestamp,
      level,
      runId: this.runId,
      message,
      metadata,
      formatted
    };
  }

  _log(levelName, message, metadata) {
    if (LOG_LEVELS[levelName] < this.level) return;

    const logEntry = this.format(levelName, message, metadata);

    // Console output
    if (levelName === 'ERROR') {
      console.error(logEntry.formatted);
    } else if (levelName === 'WARN') {
      console.warn(logEntry.formatted);
    } else {
      console.log(logEntry.formatted);
    }

    // Dispatch to listeners (e.g. run file writer, event emitters)
    for (const listener of this.listeners) {
      try {
        listener(logEntry);
      } catch (e) {
        // Suppress listener errors to prevent logger disruption
      }
    }

    return logEntry;
  }

  debug(message, metadata) {
    return this._log('DEBUG', message, metadata);
  }

  info(message, metadata) {
    return this._log('INFO', message, metadata);
  }

  warn(message, metadata) {
    return this._log('WARN', message, metadata);
  }

  error(message, metadata) {
    return this._log('ERROR', message, metadata);
  }
}

module.exports = {
  Logger,
  LOG_LEVELS
};
