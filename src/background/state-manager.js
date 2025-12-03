import { Logger } from '../shared/logger.js';
import { DEFAULT_SETTINGS, STATE_CONFIG, PAGINATION_STATES } from '../shared/constants.js';

const logger = new Logger('StateManager');

export class StateManager {
  constructor() {
    this.currentTabId = null;
    this.collectedImages = [];
    this.settings = { ...DEFAULT_SETTINGS };
    this.galleryStatus = null;
    this.paginationStatus = null;
    this.paginationState = PAGINATION_STATES.IDLE;
    this.locks = new Map();
    this.stateVersion = 0;
  }

  async initialize() {
    try {
      const stored = await chrome.storage.local.get(['settings', 'collectedImages']);
      
      if (stored.settings) {
        this.settings = { ...DEFAULT_SETTINGS, ...stored.settings };
      }

      if (stored.collectedImages) {
        this.collectedImages = stored.collectedImages;
      }

      logger.log('State manager initialized');
    } catch (error) {
      logger.error('Error initializing state manager:', error);
    }
  }

  setCurrentTab(tabId) {
    this.currentTabId = tabId;
    logger.log(`Current tab set to: ${tabId}`);
  }

  getCurrentTab() {
    return this.currentTabId;
  }

  addImages(images) {
    const uniqueImages = images.filter(img => 
      !this.collectedImages.some(existing => existing.fileUrl === img.fileUrl)
    );

    this.collectedImages.push(...uniqueImages);
    
    this.persistImages();
    
    logger.log(`Added ${uniqueImages.length} new images (total: ${this.collectedImages.length})`);
    
    return {
      added: uniqueImages.length,
      total: this.collectedImages.length
    };
  }

  getImages() {
    return [...this.collectedImages];
  }

  clearImages() {
    this.collectedImages = [];
    this.persistImages();
    logger.log('Cleared all images');
  }

  async persistImages() {
    try {
      await chrome.storage.local.set({ collectedImages: this.collectedImages });
    } catch (error) {
      logger.error('Error persisting images:', error);
    }
  }

  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    try {
      await chrome.storage.local.set({ settings: this.settings });
      logger.log('Settings updated:', this.settings);
    } catch (error) {
      logger.error('Error updating settings:', error);
    }
  }

  getSettings() {
    return { ...this.settings };
  }

  updateGalleryStatus(status) {
    this.galleryStatus = status;
    logger.log('Gallery status updated:', status);
  }

  getGalleryStatus() {
    return this.galleryStatus;
  }

  updatePaginationStatus(status) {
    this.paginationStatus = status;
    logger.log('Pagination status updated:', status);
  }

  getPaginationStatus() {
    return this.paginationStatus;
  }

  getStats() {
    return {
      imageCount: this.collectedImages.length,
      currentTab: this.currentTabId,
      galleryDetected: this.galleryStatus?.isGallery || false,
      paginationActive: this.paginationStatus?.status === 'paginating',
      paginationState: this.paginationState,
      settings: this.settings,
      version: this.stateVersion
    };
  }

  async acquireLock(lockName, timeout = STATE_CONFIG.LOCK_TIMEOUT) {
    const startTime = Date.now();
    
    while (this.locks.has(lockName)) {
      if (Date.now() - startTime > timeout) {
        logger.error(`Lock timeout for: ${lockName}`);
        throw new Error(`Failed to acquire lock: ${lockName}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.locks.set(lockName, Date.now());
    logger.debug(`Lock acquired: ${lockName}`);
  }

  releaseLock(lockName) {
    this.locks.delete(lockName);
    logger.debug(`Lock released: ${lockName}`);
  }

  async withLock(lockName, operation) {
    try {
      await this.acquireLock(lockName);
      const result = await operation();
      return result;
    } finally {
      this.releaseLock(lockName);
    }
  }

  async updateImagesWithLock(images) {
    return await this.withLock('images', async () => {
      this.stateVersion++;
      return this.addImages(images);
    });
  }

  async clearImagesWithLock() {
    return await this.withLock('images', async () => {
      this.stateVersion++;
      this.clearImages();
    });
  }

  setPaginationState(state) {
    this.paginationState = state;
    this.stateVersion++;
    logger.log(`Pagination state: ${state}`);
  }

  getPaginationState() {
    return this.paginationState;
  }
}

export default StateManager;
