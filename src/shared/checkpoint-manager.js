import { Logger } from './logger.js';

export class CheckpointManager {
  constructor() {
    this.logger = new Logger('CheckpointManager');
    this.storageKey = 'pagination_checkpoint';
    this.checkpointInterval = 5;
  }

  async saveCheckpoint(data) {
    try {
      const checkpoint = {
        timestamp: Date.now(),
        version: '1.0',
        data: {
          currentPage: data.currentPage,
          collectedImages: data.collectedImages || [],
          method: data.method,
          settings: data.settings,
          totalPages: data.totalPages,
          state: data.state || 'RUNNING'
        }
      };

      await chrome.storage.local.set({ [this.storageKey]: checkpoint });
      this.logger.log(`Checkpoint saved at page ${data.currentPage}`);
      
      return true;
    } catch (error) {
      this.logger.error('Error saving checkpoint:', error);
      return false;
    }
  }

  async loadCheckpoint() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      
      if (result[this.storageKey]) {
        const checkpoint = result[this.storageKey];
        
        if (checkpoint.version !== '1.0') {
          this.logger.warn('Checkpoint version mismatch, clearing');
          await this.clearCheckpoint();
          return null;
        }

        const age = Date.now() - checkpoint.timestamp;
        if (age > 24 * 60 * 60 * 1000) {
          this.logger.log('Checkpoint expired (>24h), clearing');
          await this.clearCheckpoint();
          return null;
        }

        this.logger.log(`Checkpoint loaded from page ${checkpoint.data.currentPage}`);
        return checkpoint.data;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error loading checkpoint:', error);
      return null;
    }
  }

  async clearCheckpoint() {
    try {
      await chrome.storage.local.remove(this.storageKey);
      this.logger.log('Checkpoint cleared');
      return true;
    } catch (error) {
      this.logger.error('Error clearing checkpoint:', error);
      return false;
    }
  }

  shouldCheckpoint(currentPage) {
    return currentPage % this.checkpointInterval === 0;
  }

  async hasCheckpoint() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      return !!result[this.storageKey];
    } catch (error) {
      return false;
    }
  }
}

export default CheckpointManager;
