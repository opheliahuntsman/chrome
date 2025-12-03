import { Logger } from '../shared/logger.js';
import { MESSAGE_TYPES, PAGINATION_STATES } from '../shared/constants.js';
import { CheckpointManager } from '../shared/checkpoint-manager.js';

const logger = new Logger('MessageRouter');
const TAB_MESSAGE_TIMEOUT = 5000;

export class MessageRouter {
  constructor(dependencies) {
    this.state = dependencies.state;
    this.downloads = dependencies.downloads;
    this.exports = dependencies.exports;
    this.iconStatus = dependencies.iconStatus;
    this.checkpointManager = new CheckpointManager();
    this.memoryMonitor = dependencies.memoryMonitor || null;
  }
  
  handleIconStatusUpdate(message) {
    try {
      if (!this.iconStatus) return;
      
      if (message.type === 'download/progress' && message.data) {
        const { downloaded, total } = message.data;
        this.iconStatus.setDownloading(downloaded, total);
      } else if (message.type === 'download/complete') {
        this.iconStatus.setComplete();
      } else if (message.type === 'download/page-complete') {
        this.iconStatus.setWaiting();
        setTimeout(() => {
          try {
            if (this.iconStatus && this.iconStatus.getStatus().status === 'waiting') {
              this.iconStatus.setIdle();
            }
          } catch (e) {
            logger.debug('Error resetting icon status:', e);
          }
        }, 2000);
      }
    } catch (error) {
      logger.debug('Error in icon status update:', error);
    }
  }

  sendTabMessageWithTimeout(tabId, message, timeout = TAB_MESSAGE_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Tab message timeout'));
      }, timeout);

      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  async forwardToActiveTab(message, sendResponse) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = activeTab?.id || this.state.getCurrentTab();

      if (!tabId) {
        sendResponse({ success: false, error: 'No active tab available for pagination command' });
        return false;
      }

      await this.sendTabMessageWithTimeout(tabId, message);
      sendResponse({ success: true });
    } catch (error) {
      logger.error('Error forwarding pagination command:', error);
      sendResponse({ success: false, error: error.message });
    }

    return true;
  }

  handle(message, sender, sendResponse) {
    if (!message || !message.type) {
      logger.debug('Received invalid message without type');
      try {
        sendResponse({ success: false, error: 'Invalid message format' });
      } catch (e) {}
      return false;
    }

    logger.debug(`Handling message: ${message.type}`);

    this.handleIconStatusUpdate(message);

    try {
      if (message.type === MESSAGE_TYPES.CORE_INIT) {
        return this.handleInit(message, sender, sendResponse);
      }

      if (message.type === MESSAGE_TYPES.CORE_GALLERY_DETECTED) {
        return this.handleGalleryDetected(message, sender, sendResponse);
      }

      if (message.type === MESSAGE_TYPES.CORE_IMAGES_FOUND) {
        return this.safeAsyncHandler(() => this.handleImagesFound(message, sender, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.CORE_PAGINATION_STATUS) {
        return this.handlePaginationStatus(message, sender, sendResponse);
      }

      if (!sender.tab && message.type === MESSAGE_TYPES.CORE_PAGINATION_START) {
        return this.safeAsyncHandler(() => this.forwardToActiveTab(message, sendResponse), sendResponse);
      }

      if (!sender.tab && message.type === MESSAGE_TYPES.CORE_PAGINATION_STOP) {
        return this.safeAsyncHandler(() => this.forwardToActiveTab(message, sendResponse), sendResponse);
      }

      if (!sender.tab && message.type === MESSAGE_TYPES.CORE_PAGINATION_PAUSE) {
        return this.safeAsyncHandler(() => this.forwardToActiveTab(message, sendResponse), sendResponse);
      }

      if (!sender.tab && message.type === MESSAGE_TYPES.CORE_PAGINATION_RESUME) {
        return this.safeAsyncHandler(() => this.forwardToActiveTab(message, sendResponse), sendResponse);
      }

      if (!sender.tab && message.type === MESSAGE_TYPES.CORE_PAGINATION_CANCEL) {
        return this.safeAsyncHandler(() => this.forwardToActiveTab(message, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.CORE_PAGINATION_PAUSE) {
        return this.safeAsyncHandler(() => this.handlePaginationPause(message, sender, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.CORE_PAGINATION_RESUME) {
        return this.safeAsyncHandler(() => this.handlePaginationResume(message, sender, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.CORE_PAGINATION_CANCEL) {
        return this.safeAsyncHandler(() => this.handlePaginationCancel(message, sender, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.CHECKPOINT_SAVE) {
        return this.safeAsyncHandler(() => this.handleCheckpointSave(message, sender, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.CHECKPOINT_LOAD) {
        return this.safeAsyncHandler(() => this.handleCheckpointLoad(message, sender, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.CHECKPOINT_CLEAR) {
        return this.safeAsyncHandler(() => this.handleCheckpointClear(message, sender, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.CHECKPOINT_EXISTS) {
        return this.safeAsyncHandler(() => this.handleCheckpointExists(message, sender, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.MEMORY_WARNING) {
        return this.handleMemoryWarning(message, sender, sendResponse);
      }

      if (message.type === MESSAGE_TYPES.MEMORY_STATS) {
        return this.handleMemoryStats(message, sender, sendResponse);
      }

      if (message.type === MESSAGE_TYPES.TOAST_SHOW) {
        return this.handleToastShow(message, sender, sendResponse);
      }

      if (message.type === MESSAGE_TYPES.DOWNLOAD_PAGE_COMPLETE) {
        return this.safeAsyncHandler(() => this.handleDownloadPageComplete(message, sender, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.ERROR_REPORT) {
        return this.handleErrorReport(message, sender, sendResponse);
      }

      if (message.type === MESSAGE_TYPES.GET_IMAGES) {
        return this.handleGetImages(message, sender, sendResponse);
      }

      if (message.type === MESSAGE_TYPES.CLEAR_IMAGES) {
        return this.handleClearImages(message, sender, sendResponse);
      }

      if (message.type === MESSAGE_TYPES.SETTINGS_UPDATE) {
        return this.safeAsyncHandler(() => this.handleSettingsUpdate(message, sender, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.SETTINGS_GET) {
        return this.handleSettingsGet(message, sender, sendResponse);
      }

      if (message.type === MESSAGE_TYPES.DOWNLOAD_START) {
        return this.safeAsyncHandler(() => this.handleDownloadStart(message, sender, sendResponse), sendResponse);
      }

      if (message.type === 'download/batch-response') {
        return this.handleBatchResponse(message, sender, sendResponse);
      }

      if (message.type === 'download/file') {
        return this.safeAsyncHandler(() => this.handleFileDownload(message, sender, sendResponse), sendResponse);
      }

      if (message.type.startsWith('export/')) {
        return this.safeAsyncHandler(() => this.handleExport(message, sender, sendResponse), sendResponse);
      }

      if (message.type === MESSAGE_TYPES.API_ENDPOINT_DETECTED) {
        return this.handleApiEndpointDetected(message, sender, sendResponse);
      }

      if (message.type === 'get-status') {
        return this.handleGetStatus(message, sender, sendResponse);
      }

      logger.debug(`Unhandled message type: ${message.type}`);
      return false;

    } catch (error) {
      logger.error('Error in message router:', error);
      try {
        sendResponse({ success: false, error: error.message || 'Unknown error' });
      } catch (e) {
        logger.debug('Error sending error response:', e);
      }
      return false;
    }
  }

  safeAsyncHandler(asyncFn, sendResponse, keepChannelOpen = true) {
    (async () => {
      try {
        await asyncFn();
      } catch (error) {
        logger.error('Error in async handler:', error);
        try {
          sendResponse({ success: false, error: error.message || 'Async operation failed' });
        } catch (e) {
          logger.debug('Error sending async error response:', e);
        }
      }
    })();
    return keepChannelOpen;
  }

  handleInit(message, sender, sendResponse) {
    if (sender.tab) {
      this.state.setCurrentTab(sender.tab.id);
      
      chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
    }
    
    sendResponse({ success: true });
    return false;
  }

  handleGalleryDetected(message, sender, sendResponse) {
    const { isGallery, imageCount } = message.data;
    
    this.state.updateGalleryStatus(message.data);

    if (isGallery && sender.tab) {
      chrome.action.setBadgeText({ 
        text: String(imageCount), 
        tabId: sender.tab.id 
      });
      chrome.action.setBadgeBackgroundColor({ 
        color: '#4CAF50', 
        tabId: sender.tab.id 
      });
    }

    this.broadcastToUI({
      type: 'gallery-status-update',
      data: message.data
    });

    sendResponse({ success: true });
    return false;
  }

  async handleImagesFound(message, sender, sendResponse) {
    try {
      const result = await this.state.withLock('images', async () => {
        return this.state.addImages(message.images);
      });

      this.broadcastToUI({
        type: 'images-update',
        images: this.state.getImages()
      });

      sendResponse({ success: true, total: result.total, added: result.added });
    } catch (error) {
      logger.error('Error handling images found:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  handlePaginationStatus(message, sender, sendResponse) {
    this.state.updatePaginationStatus(message.data);

    this.broadcastToUI({
      type: 'pagination-status-update',
      data: message.data
    });

    if (this.iconStatus) {
      const status = message.data.status || message.data;
      
      if (status === 'paginating' || status === PAGINATION_STATES.RUNNING) {
        const pageNumber = message.data.pageNumber || message.data.currentPage || 1;
        this.iconStatus.setPaginating(pageNumber);
      } else if (status === 'paused' || status === PAGINATION_STATES.PAUSED) {
        this.iconStatus.setPaused();
      } else if (status === 'complete' || status === 'stopped') {
        this.iconStatus.setComplete();
      } else if (status === 'error') {
        this.iconStatus.setError(message.data.error || 'Error');
      }
    }

    sendResponse({ success: true });
    return false;
  }

  handleGetImages(message, sender, sendResponse) {
    const images = this.state.getImages();
    sendResponse({ success: true, images: images });
    return false;
  }

  handleClearImages(message, sender, sendResponse) {
    this.state.clearImages();

    this.broadcastToUI({
      type: 'images-update',
      images: []
    });

    sendResponse({ success: true });
    return false;
  }

  handleSettingsUpdate(message, sender, sendResponse) {
    this.state.updateSettings(message.settings).then(() => {
      sendResponse({ success: true, settings: this.state.getSettings() });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  handleSettingsGet(message, sender, sendResponse) {
    const settings = this.state.getSettings();
    sendResponse({ success: true, settings: settings });
    return false;
  }

  async handleDownloadStart(message, sender, sendResponse) {
    try {
      const images = message.images || this.state.getImages();
      const options = message.options || {};

      // Store the tab ID for sending completion message back
      if (sender.tab && sender.tab.id) {
        this.state.setCurrentTab(sender.tab.id);
        logger.debug(`Download started from tab: ${sender.tab.id}`);
      }

      if (this.iconStatus) {
        this.iconStatus.setDownloading(0, images.length);
      }

      await this.downloads.downloadImages(images, options);

      sendResponse({ success: true });
    } catch (error) {
      logger.error('Error starting download:', error);
      if (this.iconStatus) {
        this.iconStatus.setError('Download failed');
      }
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  handleBatchResponse(message, sender, sendResponse) {
    try {
      this.downloads.resumeDownloads(message.continue);
      sendResponse({ success: true });
    } catch (error) {
      logger.error('Error handling batch response:', error);
      sendResponse({ success: false, error: error.message });
    }
    return false;
  }

  async handleFileDownload(message, sender, sendResponse) {
    try {
      const { url, filename, saveAs } = message.data;
      
      const downloadId = await chrome.downloads.download({
        url,
        filename,
        saveAs: saveAs !== undefined ? saveAs : true
      });

      logger.log(`File download started: ${filename} (ID: ${downloadId})`);
      sendResponse({ success: true, downloadId: downloadId });
    } catch (error) {
      logger.error('Error starting file download:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  async handleExport(message, sender, sendResponse) {
    try {
      const format = message.type.split('/')[1];
      const images = message.data?.images || this.state.getImages();
      const options = message.data || {};

      const result = await this.exports.exportData(format, images, options);

      sendResponse({ success: true, result: result });
    } catch (error) {
      logger.error('Error exporting:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  handleApiEndpointDetected(message, sender, sendResponse) {
    logger.log('API endpoint detected:', message.endpoint);
    sendResponse({ success: true });
    return false;
  }

  handleGetStatus(message, sender, sendResponse) {
    const stats = this.state.getStats();
    const downloadStatus = this.downloads.getStatus();

    sendResponse({ 
      success: true, 
      stats: stats,
      downloads: downloadStatus
    });
    return false;
  }

  broadcastToUI(message) {
    try {
      chrome.runtime.sendMessage(message).catch(err => {
        logger.debug('Error broadcasting to UI:', err);
      });
    } catch (error) {
      logger.debug('Error broadcasting:', error);
    }
  }

  async broadcastToTabs(message, tabId = null) {
    try {
      const targetTabId = tabId || this.state.getCurrentTab();
      if (targetTabId) {
        await this.sendTabMessageWithTimeout(targetTabId, message);
      }
    } catch (error) {
      logger.debug('Error broadcasting to tabs:', error);
    }
  }

  async handlePaginationPause(message, sender, sendResponse) {
    try {
      this.state.setPaginationState(PAGINATION_STATES.PAUSED);

      await this.broadcastToTabs({
        type: MESSAGE_TYPES.CORE_PAGINATION_PAUSE
      });

      this.broadcastToUI({
        type: 'pagination-status-update',
        data: { state: PAGINATION_STATES.PAUSED }
      });

      sendResponse({ success: true });
    } catch (error) {
      logger.error('Error handling pagination pause:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  async handlePaginationResume(message, sender, sendResponse) {
    try {
      this.state.setPaginationState(PAGINATION_STATES.RUNNING);

      await this.broadcastToTabs({
        type: MESSAGE_TYPES.CORE_PAGINATION_RESUME
      });

      this.broadcastToUI({
        type: 'pagination-status-update',
        data: { state: PAGINATION_STATES.RUNNING }
      });

      sendResponse({ success: true });
    } catch (error) {
      logger.error('Error handling pagination resume:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  async handlePaginationCancel(message, sender, sendResponse) {
    try {
      this.state.setPaginationState(PAGINATION_STATES.CANCELLED);

      await this.checkpointManager.clearCheckpoint();

      await this.broadcastToTabs({
        type: MESSAGE_TYPES.CORE_PAGINATION_CANCEL
      });

      this.broadcastToUI({
        type: 'pagination-status-update',
        data: { state: PAGINATION_STATES.CANCELLED }
      });

      sendResponse({ success: true });
    } catch (error) {
      logger.error('Error handling pagination cancel:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  async handleCheckpointSave(message, sender, sendResponse) {
    try {
      const success = await this.checkpointManager.saveCheckpoint(message.data);
      sendResponse({ success: success });
    } catch (error) {
      logger.error('Error saving checkpoint:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  async handleCheckpointLoad(message, sender, sendResponse) {
    try {
      const checkpoint = await this.checkpointManager.loadCheckpoint();
      sendResponse({ success: true, checkpoint: checkpoint });
    } catch (error) {
      logger.error('Error loading checkpoint:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  async handleCheckpointClear(message, sender, sendResponse) {
    try {
      const success = await this.checkpointManager.clearCheckpoint();
      sendResponse({ success: success });
    } catch (error) {
      logger.error('Error clearing checkpoint:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  async handleCheckpointExists(message, sender, sendResponse) {
    try {
      const exists = await this.checkpointManager.hasCheckpoint();
      sendResponse({ success: true, exists: exists });
    } catch (error) {
      logger.error('Error checking checkpoint:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  handleMemoryWarning(message, sender, sendResponse) {
    try {
      logger.warn('Memory warning received:', message.data);

      this.broadcastToUI({
        type: MESSAGE_TYPES.TOAST_SHOW,
        data: {
          message: `Memory usage high: ${message.data?.usagePercent || 'unknown'}%`,
          type: 'warning',
          duration: 5000
        }
      });

      sendResponse({ success: true });
    } catch (error) {
      logger.error('Error handling memory warning:', error);
      sendResponse({ success: false, error: error.message });
    }
    return false;
  }

  handleMemoryStats(message, sender, sendResponse) {
    try {
      let stats = null;

      if (this.memoryMonitor) {
        stats = this.memoryMonitor.getMemoryStats();
      } else if (typeof performance !== 'undefined' && performance.memory) {
        const memory = performance.memory;
        stats = {
          used: memory.usedJSHeapSize,
          total: memory.jsHeapSizeLimit,
          usagePercent: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(1)
        };
      }

      sendResponse({ success: true, stats: stats });
    } catch (error) {
      logger.error('Error getting memory stats:', error);
      sendResponse({ success: false, error: error.message });
    }
    return false;
  }

  handleToastShow(message, sender, sendResponse) {
    try {
      this.broadcastToUI({
        type: MESSAGE_TYPES.TOAST_SHOW,
        data: message.data
      });

      sendResponse({ success: true });
    } catch (error) {
      logger.error('Error showing toast:', error);
      sendResponse({ success: false, error: error.message });
    }
    return false;
  }

  async handleDownloadPageComplete(message, sender, sendResponse) {
    try {
      logger.log('Page download complete:', message.data);

      if (sender.tab) {
        await this.broadcastToTabs({
          type: MESSAGE_TYPES.ACK,
          ackFor: MESSAGE_TYPES.DOWNLOAD_PAGE_COMPLETE,
          data: message.data
        }, sender.tab.id);
      }

      this.broadcastToUI({
        type: 'download-progress-update',
        data: message.data
      });

      sendResponse({ success: true });
    } catch (error) {
      logger.error('Error handling download page complete:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  handleErrorReport(message, sender, sendResponse) {
    try {
      const { error, context, userFriendly } = message.data || {};

      logger.error(`Error reported from ${context}:`, error);

      this.broadcastToUI({
        type: MESSAGE_TYPES.TOAST_SHOW,
        data: {
          message: userFriendly || error || 'An error occurred',
          type: 'error',
          duration: 5000
        }
      });

      sendResponse({ success: true });
    } catch (error) {
      logger.error('Error handling error report:', error);
      sendResponse({ success: false, error: error.message });
    }
    return false;
  }
}

export default MessageRouter;
