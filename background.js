import { Logger } from './src/shared/logger.js';
import { StateManager } from './src/background/state-manager.js';
import { DownloadManager } from './src/background/download-manager.js';
import { ExportController } from './src/background/export-controller.js';
import { MessageRouter } from './src/background/message-router.js';
import { IconStatusManager } from './src/background/icon-status-manager.js';

const logger = new Logger('Background');

let state = null;
let downloads = null;
let exports = null;
let iconStatus = null;
let router = null;
let isInitialized = false;

function initializeComponents() {
  try {
    if (!state) {
      state = new StateManager();
    }
    if (!downloads) {
      downloads = new DownloadManager(state);
    }
    if (!exports) {
      exports = new ExportController();
    }
    if (!iconStatus) {
      iconStatus = new IconStatusManager();
    }
    if (!router) {
      router = new MessageRouter({ state, downloads, exports, iconStatus });
    }
    return true;
  } catch (error) {
    logger.error('Error initializing components:', error);
    return false;
  }
}

async function initialize() {
  try {
    logger.log('StepGallery service worker initializing');

    if (!initializeComponents()) {
      logger.error('Failed to initialize components');
      return;
    }

    await state.initialize();
    isInitialized = true;

    logger.log('StepGallery service worker ready');
  } catch (error) {
    logger.error('Error during initialization:', error);
  }
}

self.addEventListener('error', (event) => {
  logger.error('Global error caught:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

chrome.runtime.onInstalled.addListener((details) => {
  logger.log('Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    logger.log('First install, setting up defaults');
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    logger.error('Error opening side panel:', error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!initializeComponents()) {
      try {
        sendResponse({ success: false, error: 'Extension not ready - please reload' });
      } catch (e) {}
      return false;
    }

    return router.handle(message, sender, sendResponse);
  } catch (error) {
    logger.error('Error in message listener:', error);
    try {
      sendResponse({ success: false, error: error.message || 'Unknown error' });
    } catch (e) {
      logger.debug('Error sending error response:', e);
    }
    return false;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    if (state && state.getCurrentTab() === tabId) {
      logger.log(`Current tab ${tabId} closed`);
    }
  } catch (error) {
    logger.error('Error handling tab removal:', error);
  }
});

initialize();
