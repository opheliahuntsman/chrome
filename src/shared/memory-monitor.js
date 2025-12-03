import { Logger } from './logger.js';

export class MemoryMonitor {
  constructor(options = {}) {
    this.logger = new Logger('MemoryMonitor');
    this.threshold = options.threshold || 0.8;
    this.checkInterval = options.checkInterval || 5000;
    this.isMonitoring = false;
    this.intervalId = null;
    this.onThresholdExceeded = options.onThresholdExceeded || null;
    this.lastWarning = 0;
    this.warningCooldown = 30000;
  }

  start() {
    if (this.isMonitoring) {
      this.logger.warn('Memory monitor already running');
      return;
    }

    this.isMonitoring = true;
    
    this.intervalId = setInterval(() => {
      this.checkMemory();
    }, this.checkInterval);

    this.logger.log('Memory monitor started');
  }

  stop() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.logger.log('Memory monitor stopped');
  }

  checkMemory() {
    if (typeof performance === 'undefined' || !performance.memory) {
      return null;
    }

    const memory = performance.memory;
    const usedMemory = memory.usedJSHeapSize;
    const totalMemory = memory.jsHeapSizeLimit;
    const usageRatio = usedMemory / totalMemory;

    const stats = {
      used: usedMemory,
      total: totalMemory,
      usagePercent: (usageRatio * 100).toFixed(1),
      usageRatio: usageRatio,
      formatted: {
        used: this.formatBytes(usedMemory),
        total: this.formatBytes(totalMemory)
      }
    };

    if (usageRatio >= this.threshold) {
      const now = Date.now();
      if (now - this.lastWarning > this.warningCooldown) {
        this.logger.warn(`Memory threshold exceeded: ${stats.usagePercent}% (${stats.formatted.used} / ${stats.formatted.total})`);
        this.lastWarning = now;

        if (this.onThresholdExceeded) {
          this.onThresholdExceeded(stats);
        }
      }
    }

    return stats;
  }

  getMemoryStats() {
    return this.checkMemory();
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  async cleanup() {
    this.logger.log('Attempting memory cleanup...');
    
    if (typeof window !== 'undefined' && window.gc) {
      try {
        window.gc();
        this.logger.log('Garbage collection triggered');
      } catch (e) {
        this.logger.debug('Manual GC not available');
      }
    }

    await new Promise(resolve => setTimeout(resolve, 100));
    
    return this.checkMemory();
  }
}

export default MemoryMonitor;
