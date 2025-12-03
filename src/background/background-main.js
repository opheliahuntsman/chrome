import { Logger } from '../shared/logger.js';
import { stateManager } from './state-manager.js';
import { messageRouter } from './message-router.js';

const logger = new Logger('Background');

let isInitialized = false;

async function initialize() {
  try {
    logger.log('StepGallery service worker initializing');

    await stateManager.initialize();
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
    if (!isInitialized) {
      try {
        sendResponse({ success: false, error: 'Extension not ready - please reload' });
      } catch (e) {}
      return false;
    }

    return messageRouter.handle(message, sender, sendResponse);
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
    if (stateManager.getCurrentTab() === tabId) {
      logger.log(`Current tab ${tabId} closed`);
    }
  } catch (error) {
    logger.error('Error handling tab removal:', error);
  }
});

initialize();
