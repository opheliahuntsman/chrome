import { MESSAGE_TYPES, DEFAULT_SETTINGS, PAGINATION_STATES } from '../../shared/constants.js';
import { FilenameGenerator } from '../../shared/filename-generator.js';
import { ToastNotifier } from '../../shared/toast-notifier.js';

const filenameGenerator = new FilenameGenerator();
const toast = new ToastNotifier();

// Global error handlers to prevent UI freeze
let lastErrorTime = 0;
const ERROR_DEBOUNCE_MS = 1000; // Only re-enable UI once per second

window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  // Ensure UI remains interactive even after errors (debounced)
  const now = Date.now();
  if (now - lastErrorTime > ERROR_DEBOUNCE_MS) {
    lastErrorTime = now;
    try {
      enableUIInteraction();
    } catch (e) {
      console.error('Failed to enable UI interaction:', e);
    }
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

let collectedImages = [];
let isPaginating = false;
let settings = {
  paginationMethod: 'auto',
  filenamePattern: '*num-3*-*name*.*ext*',
  exportFormats: ['csv'],
  exportFields: ['filename', 'fileUrl', 'dimensions', 'sourcePage']
};

let dashboardInitialized = false;
let serviceWorkerAvailable = true;

const MESSAGE_TIMEOUT = 5000;
const TAB_MESSAGE_TIMEOUT = 3000;

function sendMessageWithTimeout(message, timeout = MESSAGE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Message timeout - service worker may be unavailable'));
    }, timeout);

    try {
      chrome.runtime.sendMessage(message, (response) => {
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

function sendTabMessageWithTimeout(tabId, message, timeout = TAB_MESSAGE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Tab message timeout - content script may be unavailable'));
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

async function checkServiceWorkerStatus() {
  try {
    const response = await sendMessageWithTimeout({ type: 'get-status' }, 2000);
    serviceWorkerAvailable = !!(response && response.success);
    return serviceWorkerAvailable;
  } catch (error) {
    console.warn('Service worker check failed:', error.message);
    serviceWorkerAvailable = false;
    return false;
  }
}

async function initializeDashboard() {
  if (dashboardInitialized) {
    return;
  }

  dashboardInitialized = true;

  console.log('Dashboard initializing...');

  // Always enable UI first to prevent freeze
  try {
    enableUIInteraction();
  } catch (error) {
    console.error('Error enabling UI interaction:', error);
  }

  try {
    toast.initialize();
  } catch (error) {
    console.error('Error initializing toast:', error);
  }
  
  try {
    initializeUI();
  } catch (error) {
    console.error('Error initializing UI:', error);
  }
  
  try {
    setupEventListeners();
  } catch (error) {
    console.error('Error setting up event listeners:', error);
  }

  try {
    const isAvailable = await checkServiceWorkerStatus();
    
    if (isAvailable) {
      await Promise.all([
        loadSettings().catch(err => console.warn('Settings load failed:', err.message)),
        loadImages().catch(err => console.warn('Images load failed:', err.message))
      ]);
      
      requestGalleryDetection();
      console.log('Dashboard ready with full functionality');
    } else {
      console.warn('Service worker unavailable - using default settings');
      applySettings();
      showServiceWorkerWarning();
    }
  } catch (error) {
    console.error('Error during async initialization:', error);
    applySettings();
  }
}

function enableUIInteraction() {
  const inputs = document.querySelectorAll('input, select');
  inputs.forEach(input => {
    input.disabled = false;
  });
  
  const alwaysEnabledButtons = ['clearImages', 'exportAllFormats', 'downloadImages', 'helpToggle', 'resetSettings'];
  alwaysEnabledButtons.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = false;
  });
  
  if (!isPaginating) {
    updatePaginationButtons(PAGINATION_STATES.IDLE);
  }
}

function showServiceWorkerWarning() {
  const messageEl = document.getElementById('galleryMessage');
  if (messageEl) {
    messageEl.textContent = 'Extension is reconnecting... Please wait or reload the page.';
    messageEl.style.color = '#ff9800';
  }
  
  setTimeout(async () => {
    const isNowAvailable = await checkServiceWorkerStatus();
    if (isNowAvailable) {
      await loadSettings().catch(() => {});
      await loadImages().catch(() => {});
      requestGalleryDetection();
      toast.success('Extension reconnected');
    }
  }, 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDashboard);
} else {
  initializeDashboard();
}

async function loadSettings() {
  try {
    const response = await sendMessageWithTimeout({ type: MESSAGE_TYPES.SETTINGS_GET });
    if (response && response.success) {
      settings = { ...settings, ...response.settings };
      applySettings();
    }
  } catch (error) {
    console.warn('Error loading settings:', error.message);
    throw error;
  }
}

async function loadImages() {
  try {
    const response = await sendMessageWithTimeout({ type: MESSAGE_TYPES.GET_IMAGES });
    if (response && response.success) {
      collectedImages = response.images || [];
      updateImageDisplay();
    }
  } catch (error) {
    console.warn('Error loading images:', error.message);
    throw error;
  }
}

function applySettings() {
  const paginationMethod = document.getElementById('paginationMethod');
  if (paginationMethod) paginationMethod.value = settings.paginationMethod;
  
  const filenamePattern = document.getElementById('filenamePattern');
  if (filenamePattern) filenamePattern.value = settings.filenamePattern;
  
  if (settings.paginationDelay !== undefined) {
    const paginationDelay = document.getElementById('paginationDelay');
    if (paginationDelay) paginationDelay.value = settings.paginationDelay;
  }
  if (settings.scrollDelay !== undefined) {
    const scrollDelay = document.getElementById('scrollDelay');
    if (scrollDelay) scrollDelay.value = settings.scrollDelay;
  }
  if (settings.concurrentDownloads !== undefined) {
    const concurrentDownloads = document.getElementById('concurrentDownloads');
    const concurrentValue = document.getElementById('concurrentValue');
    if (concurrentDownloads) concurrentDownloads.value = settings.concurrentDownloads;
    if (concurrentValue) concurrentValue.textContent = settings.concurrentDownloads;
  }
  if (settings.downloadDelay !== undefined) {
    const downloadDelay = document.getElementById('downloadDelay');
    if (downloadDelay) downloadDelay.value = settings.downloadDelay;
  }
  if (settings.batchSize !== undefined) {
    const batchSize = document.getElementById('batchSize');
    if (batchSize) batchSize.value = settings.batchSize;
  }
  if (settings.downloadFolder !== undefined) {
    const downloadFolder = document.getElementById('downloadFolder');
    if (downloadFolder) downloadFolder.value = settings.downloadFolder;
  }
  
  updateFilenameExample();
}

function initializeUI() {
  updateImageStats();
  updateFilenameExample();
}

function safeAddEventListener(elementId, event, handler) {
  const element = document.getElementById(elementId);
  if (element) {
    element.addEventListener(event, handler);
  } else {
    console.warn(`Element with id '${elementId}' not found`);
  }
}

function safeAddEventListenerToAll(selector, event, handler, suppressWarning = false) {
  const elements = document.querySelectorAll(selector);
  if (elements.length > 0) {
    elements.forEach(element => {
      element.addEventListener(event, handler);
    });
  } else if (!suppressWarning) {
    console.warn(`No elements found for selector '${selector}'`);
  }
}

function setupEventListeners() {
  safeAddEventListener('startPagination', 'click', startPagination);
  safeAddEventListener('pausePagination', 'click', pausePagination);
  safeAddEventListener('resumePagination', 'click', resumePagination);
  safeAddEventListener('cancelPagination', 'click', cancelPagination);
  safeAddEventListener('stopPagination', 'click', stopPagination);
  safeAddEventListener('clearImages', 'click', clearImages);
  safeAddEventListener('exportAllFormats', 'click', exportAllFormats);
  safeAddEventListener('downloadImages', 'click', downloadAllImages);

  safeAddEventListener('paginationMethod', 'change', (e) => {
    settings.paginationMethod = e.target.value;
    saveSettings();
  });

  safeAddEventListenerToAll('.token-btn', 'click', (event) => {
    const btn = event.currentTarget;
    const input = document.getElementById('filenamePattern');
    if (input) {
      input.value += btn.dataset.token;
      settings.filenamePattern = input.value;
      updateFilenameExample();
      saveSettings();
    }
  });

  safeAddEventListener('paginationDelay', 'input', (e) => {
    settings.paginationDelay = parseFloat(e.target.value) || 0;
    saveSettings();
  });

  safeAddEventListener('scrollDelay', 'input', (e) => {
    settings.scrollDelay = parseInt(e.target.value) || 0;
    saveSettings();
  });

  safeAddEventListener('concurrentDownloads', 'input', (e) => {
    const value = parseInt(e.target.value) || 1;
    settings.concurrentDownloads = Math.max(1, Math.min(10, value));
    const concurrentValue = document.getElementById('concurrentValue');
    if (concurrentValue) concurrentValue.textContent = settings.concurrentDownloads;
    e.target.value = settings.concurrentDownloads;
    saveSettings();
  });

  safeAddEventListener('downloadDelay', 'input', (e) => {
    settings.downloadDelay = parseFloat(e.target.value) || 0;
    saveSettings();
  });

  safeAddEventListener('batchSize', 'input', (e) => {
    settings.batchSize = parseInt(e.target.value) || 0;
    saveSettings();
  });

  safeAddEventListener('downloadFolder', 'input', (e) => {
    const folder = e.target.value.trim();
    settings.downloadFolder = folder;
    validateFolderPath(folder);
    saveSettings();
  });

  const numericInputs = [
    { id: 'paginationDelay', min: 0, max: 30 },
    { id: 'scrollDelay', min: 0, max: 5000 },
    { id: 'downloadDelay', min: 0, max: 60 },
    { id: 'batchSize', min: 0, max: 1000 }
  ];

  numericInputs.forEach(({ id, min, max }) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('blur', (e) => {
        validateNumericInput(e.target, min, max);
      });
      input.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (value < min || value > max) {
          e.target.classList.add('input-invalid');
        } else {
          e.target.classList.remove('input-invalid');
        }
      });
    }
  });

  safeAddEventListener('filenamePattern', 'input', (e) => {
    const pattern = e.target.value;
    settings.filenamePattern = pattern;
    validateFilenamePattern(pattern);
    updateFilenameExample();
    saveSettings();
  });

  safeAddEventListener('helpToggle', 'click', toggleHelpSection);

  safeAddEventListener('resetSettings', 'click', resetToDefaults);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'gallery-status-update') {
      updateGalleryStatus(message.data);
    }
    if (message.type === 'images-update') {
      collectedImages = message.images || [];
      updateImageDisplay();
    }
    if (message.type === 'pagination-status-update') {
      updatePaginationStatus(message.data);
    }
    if (message.type === 'download/progress') {
      updateDownloadProgress(message.data);
    }
    if (message.type === 'download/complete') {
      updateDownloadComplete(message.data);
    }
    if (message.type === 'download/batch-confirm') {
      handleBatchConfirmation(message.data);
    }
    if (message.type === MESSAGE_TYPES.TOAST_SHOW) {
      toast.show(message.message, message.toastType || 'info', message.duration);
    }
    if (message.type === MESSAGE_TYPES.MEMORY_WARNING) {
      handleMemoryWarning(message.data);
    }
    if (message.type === MESSAGE_TYPES.MEMORY_STATS) {
      updateMemoryStats(message.data);
    }
  });
}

async function sendMessageWithFallback(tabId, message) {
  try {
    if (tabId) {
      return await sendTabMessageWithTimeout(tabId, message);
    }
  } catch (error) {
    if (!error.message || (!error.message.includes('Receiving end does not exist') && !error.message.includes('timeout'))) {
      throw error;
    }
  }

  return sendMessageWithTimeout(message);
}

async function handleBatchConfirmation(data) {
  const continueDownload = confirm(
    `Downloaded ${data.downloaded} images so far.\n\n` +
    `Remaining: ${data.remaining}\n\n` +
    `Continue downloading?`
  );

  try {
    await sendMessageWithTimeout({
      type: 'download/batch-response',
      continue: continueDownload
    });
  } catch (error) {
    console.warn('Error sending batch response:', error.message);
  }
}

async function saveSettings() {
  try {
    await sendMessageWithTimeout({
      type: MESSAGE_TYPES.SETTINGS_UPDATE,
      settings: settings
    });
  } catch (error) {
    console.warn('Error saving settings:', error.message);
  }
}

function isContentScriptCompatibleUrl(url) {
  if (!url) return false;
  
  // Content scripts cannot run on these URLs
  const incompatibleProtocols = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'data:', 'file:'];
  const incompatiblePages = ['chrome.google.com/webstore'];
  
  // Check protocol
  if (incompatibleProtocols.some(protocol => url.startsWith(protocol))) {
    return false;
  }
  
  // Check specific pages
  if (incompatiblePages.some(page => url.includes(page))) {
    return false;
  }
  
  return true;
}

async function requestGalleryDetection(retryCount = 0) {
  const messageEl = document.getElementById('galleryMessage');
  
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tabs[0]) {
      messageEl.textContent = 'No active tab found';
      return;
    }
    
    if (!isContentScriptCompatibleUrl(tabs[0].url)) {
      messageEl.textContent = 'Gallery detection not available on this page';
      return;
    }
    
    const response = await sendTabMessageWithTimeout(tabs[0].id, { type: 'detect-gallery' });
    
    if (response && response.success && response.detection) {
      updateGalleryStatus(response.detection);
    } else {
      messageEl.textContent = 'No gallery detected';
    }
  } catch (error) {
    if (retryCount === 0 && error.message && (error.message.includes('Receiving end does not exist') || error.message.includes('timeout'))) {
      setTimeout(() => requestGalleryDetection(1), 1000);
      messageEl.textContent = 'Detecting gallery...';
    } else {
      messageEl.textContent = 'Could not detect gallery on this page';
    }
  }
}

async function startPagination() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      toast.error('No active tab found');
      return;
    }
    
    if (!isContentScriptCompatibleUrl(tabs[0].url)) {
      toast.error('Pagination is not available on this page type (browser internal pages, extensions, etc.)');
      return;
    }

    isPaginating = true;

    await sendMessageWithFallback(tabs[0].id, {
      type: MESSAGE_TYPES.CORE_PAGINATION_START,
      method: settings.paginationMethod
    });

    document.getElementById('paginationMessage').textContent = 'Pagination started...';
    document.getElementById('stateValue').textContent = PAGINATION_STATES.RUNNING;
    updatePaginationButtons(PAGINATION_STATES.RUNNING);
    toast.success('Pagination started');

  } catch (error) {
    isPaginating = false;
    if (!error.message || !error.message.includes('Receiving end does not exist')) {
      console.error('Error starting pagination:', error);
      toast.error('Error starting pagination: ' + error.message);
    } else {
      toast.error('Could not connect to page. Please refresh and try again.');
    }
  }
}

async function pausePagination() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      toast.error('No active tab found');
      return;
    }
    
    if (!isContentScriptCompatibleUrl(tabs[0].url)) {
      toast.error('Cannot pause pagination on this page type');
      return;
    }

    await sendMessageWithFallback(tabs[0].id, {
      type: MESSAGE_TYPES.CORE_PAGINATION_PAUSE
    });

    toast.info('Pagination paused');

  } catch (error) {
    if (!error.message || !error.message.includes('Receiving end does not exist')) {
      console.error('Error pausing pagination:', error);
      toast.error('Error pausing pagination: ' + error.message);
    }
  }
}

async function resumePagination() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      toast.error('No active tab found');
      return;
    }
    
    if (!isContentScriptCompatibleUrl(tabs[0].url)) {
      toast.error('Cannot resume pagination on this page type');
      return;
    }

    await sendMessageWithFallback(tabs[0].id, {
      type: MESSAGE_TYPES.CORE_PAGINATION_RESUME
    });

    toast.success('Pagination resumed');

  } catch (error) {
    if (!error.message || !error.message.includes('Receiving end does not exist')) {
      console.error('Error resuming pagination:', error);
      toast.error('Error resuming pagination: ' + error.message);
    }
  }
}

async function cancelPagination() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      toast.error('No active tab found');
      return;
    }
    
    if (!isContentScriptCompatibleUrl(tabs[0].url)) {
      toast.error('Cannot cancel pagination on this page type');
      return;
    }

    await sendMessageWithFallback(tabs[0].id, {
      type: MESSAGE_TYPES.CORE_PAGINATION_CANCEL
    });

    toast.warning('Pagination cancelled');
    isPaginating = false;

  } catch (error) {
    isPaginating = false;
    if (!error.message || !error.message.includes('Receiving end does not exist')) {
      console.error('Error cancelling pagination:', error);
      toast.error('Error cancelling pagination: ' + error.message);
    }
  }
}

async function stopPagination() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && isContentScriptCompatibleUrl(tabs[0].url)) {
      await sendMessageWithFallback(tabs[0].id, {
        type: MESSAGE_TYPES.CORE_PAGINATION_STOP
      });
    }

    isPaginating = false;
    document.getElementById('paginationMessage').textContent = 'Pagination stopped';
    updatePaginationButtons(PAGINATION_STATES.IDLE);
    toast.info('Pagination stopped');

  } catch (error) {
    isPaginating = false;
    updatePaginationButtons(PAGINATION_STATES.IDLE);
    if (!error.message || !error.message.includes('Receiving end does not exist')) {
      console.error('Error stopping pagination:', error);
    }
  }
}

async function clearImages() {
  if (!confirm('Clear all collected images?')) {
    return;
  }

  try {
    await sendMessageWithTimeout({ type: MESSAGE_TYPES.CLEAR_IMAGES });
    collectedImages = [];
    updateImageDisplay();
    toast.success('All images cleared');
  } catch (error) {
    console.warn('Error clearing images:', error.message);
    toast.error('Error clearing images: ' + error.message);
  }
}

async function exportAllFormats() {
  if (collectedImages.length === 0) {
    toast.warning('No images to export');
    return;
  }

  const fields = Array.from(document.querySelectorAll('.export-field:checked'))
    .map(cb => cb.value);

  if (fields.length === 0) {
    toast.warning('Please select at least one field to export');
    return;
  }

  try {
    await sendMessageWithTimeout({
      type: 'export/csv',
      data: {
        images: collectedImages,
        fields: fields,
        filename: `stepgallery-export-${Date.now()}`
      }
    });

    toast.success(`CSV export complete! Exported ${collectedImages.length} image(s).`);
  } catch (error) {
    console.warn('Error exporting:', error.message);
    toast.error('Error exporting: ' + error.message);
  }
}

async function downloadAllImages() {
  if (collectedImages.length === 0) {
    toast.warning('No images to download');
    return;
  }

  try {
    document.getElementById('downloadStatus').style.display = 'block';
    document.getElementById('downloadMessage').textContent = 'Starting download...';

    await sendMessageWithTimeout({
      type: MESSAGE_TYPES.DOWNLOAD_START,
      images: collectedImages,
      options: {
        filenamePattern: settings.filenamePattern
      }
    });

    toast.info('Download started');

  } catch (error) {
    console.warn('Error downloading images:', error.message);
    toast.error('Error downloading images: ' + error.message);
  }
}

function updateGalleryStatus(data) {
  const messageEl = document.getElementById('galleryMessage');
  const typeEl = document.getElementById('galleryType');
  const countEl = document.getElementById('imageCount');
  const confidenceEl = document.getElementById('confidence');

  if (data.isGallery) {
    messageEl.textContent = '✓ Gallery detected!';
    messageEl.style.color = '#4CAF50';
    typeEl.textContent = `Type: ${data.galleryType}`;
    countEl.textContent = `Images: ${data.imageCount}`;
    confidenceEl.textContent = `Confidence: ${(data.confidence * 100).toFixed(0)}%`;
  } else {
    messageEl.textContent = 'No gallery detected';
    messageEl.style.color = '#f44336';
    typeEl.textContent = '';
    countEl.textContent = '';
    confidenceEl.textContent = '';
  }
}

function updatePaginationStatus(data) {
  const messageEl = document.getElementById('paginationMessage');
  const statsEl = document.getElementById('paginationStats');
  const progressEl = document.getElementById('progressFill');
  const stateEl = document.getElementById('stateValue');

  messageEl.textContent = data.message || 'Paginating...';
  statsEl.textContent = `Page: ${data.currentPage || 1} | Method: ${data.method || 'auto'}`;

  if (data.state) {
    stateEl.textContent = data.state;
    updatePaginationButtons(data.state);
  }

  if (data.status === 'complete' || data.state === PAGINATION_STATES.COMPLETE) {
    progressEl.style.width = '100%';
    isPaginating = false;
    updatePaginationButtons(PAGINATION_STATES.COMPLETE);
  } else if (data.status === 'error' || data.state === PAGINATION_STATES.ERROR) {
    isPaginating = false;
    updatePaginationButtons(PAGINATION_STATES.ERROR);
  } else {
    const progress = Math.min((data.currentPage || 1) * 2, 100);
    progressEl.style.width = `${progress}%`;
  }
}

function updatePaginationButtons(state) {
  const startBtn = document.getElementById('startPagination');
  const pauseBtn = document.getElementById('pausePagination');
  const resumeBtn = document.getElementById('resumePagination');
  const cancelBtn = document.getElementById('cancelPagination');
  const stopBtn = document.getElementById('stopPagination');

  switch (state) {
    case PAGINATION_STATES.IDLE:
      startBtn.style.display = 'inline-block';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      break;

    case PAGINATION_STATES.RUNNING:
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
      cancelBtn.style.display = 'inline-block';
      stopBtn.style.display = 'inline-block';
      pauseBtn.disabled = false;
      cancelBtn.disabled = false;
      stopBtn.disabled = false;
      break;

    case PAGINATION_STATES.PAUSED:
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-block';
      cancelBtn.style.display = 'inline-block';
      stopBtn.style.display = 'inline-block';
      resumeBtn.disabled = false;
      cancelBtn.disabled = false;
      stopBtn.disabled = false;
      break;

    case PAGINATION_STATES.CANCELLED:
    case PAGINATION_STATES.COMPLETE:
    case PAGINATION_STATES.ERROR:
      startBtn.style.display = 'inline-block';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      break;

    default:
      startBtn.style.display = 'inline-block';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
      startBtn.disabled = false;
      stopBtn.disabled = true;
  }
}

function updateImageDisplay() {
  updateImageStats();

  const grid = document.getElementById('imageGrid');
  grid.innerHTML = '';

  collectedImages.slice(0, 50).forEach((image, index) => {
    const item = document.createElement('div');
    item.className = 'image-item';
    
    const img = document.createElement('img');
    img.src = image.thumbnailUrl || image.fileUrl;
    img.alt = image.caption || `Image ${index + 1}`;
    img.loading = 'lazy';
    img.onerror = () => {
      img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3E?%3C/text%3E%3C/svg%3E';
    };

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.textContent = image.filename || 'image.jpg';

    item.appendChild(img);
    item.appendChild(overlay);
    grid.appendChild(item);
  });

  if (collectedImages.length > 50) {
    const more = document.createElement('div');
    more.className = 'image-item';
    more.style.background = '#2196F3';
    more.style.color = 'white';
    more.style.display = 'flex';
    more.style.alignItems = 'center';
    more.style.justifyContent = 'center';
    more.style.fontSize = '14px';
    more.style.fontWeight = 'bold';
    more.textContent = `+${collectedImages.length - 50}`;
    grid.appendChild(more);
  }
}

function updateImageStats() {
  document.getElementById('totalImages').textContent = `${collectedImages.length} image${collectedImages.length !== 1 ? 's' : ''}`;
}

function updateFilenameExample() {
  const pattern = document.getElementById('filenamePattern').value;
  const example = generateFilenameExample(pattern);
  document.getElementById('filenameExample').textContent = example;
}

function generateFilenameExample(pattern) {
  const sampleImage = {
    filename: 'sunset.jpg',
    fileUrl: 'https://www.imago-images.com/bild/st/0492917022/sunset.jpg',
    sourcePage: 'https://example.com/gallery',
    pageNumber: 1,
    caption: 'Beautiful Sunset'
  };

  return filenameGenerator.generate(sampleImage, pattern, 0);
}

function updateDownloadProgress(data) {
  const statusEl = document.getElementById('downloadStatus');
  const messageEl = document.getElementById('downloadMessage');
  const progressEl = document.getElementById('downloadProgress');
  const statsEl = document.getElementById('downloadStats');

  statusEl.style.display = 'block';
  messageEl.textContent = 'Downloading images...';
  progressEl.style.width = `${data.progress}%`;
  statsEl.textContent = `Downloaded: ${data.downloaded} | Failed: ${data.failed} | Remaining: ${data.remaining}`;
}

function updateDownloadComplete(data) {
  const messageEl = document.getElementById('downloadMessage');
  const statsEl = document.getElementById('downloadStats');

  messageEl.textContent = 'Download complete!';
  messageEl.style.color = '#4CAF50';
  statsEl.textContent = `Total: ${data.total} | Downloaded: ${data.downloaded} | Failed: ${data.failed}`;

  setTimeout(() => {
    document.getElementById('downloadStatus').style.display = 'none';
  }, 5000);
}

function validateNumericInput(input, min, max) {
  let value = parseFloat(input.value);
  
  if (isNaN(value) || value === '') {
    value = min;
  }
  
  if (value < min) {
    value = min;
  } else if (value > max) {
    value = max;
  }
  
  input.value = value;
  input.classList.remove('input-invalid');
  
  const inputId = input.id;
  if (inputId === 'paginationDelay') {
    settings.paginationDelay = value;
  } else if (inputId === 'scrollDelay') {
    settings.scrollDelay = value;
  } else if (inputId === 'downloadDelay') {
    settings.downloadDelay = value;
  } else if (inputId === 'batchSize') {
    settings.batchSize = value;
  }
  
  saveSettings();
}

function validateFilenamePattern(pattern) {
  const patternWarning = document.getElementById('patternWarning');
  const input = document.getElementById('filenamePattern');
  
  const hasRequiredToken = pattern.includes('*name*') || 
                           pattern.includes('*num*') || 
                           pattern.includes('*num-3*') || 
                           pattern.includes('*num-5*');
  
  if (!hasRequiredToken) {
    patternWarning.textContent = 'Pattern must include at least one of: *name*, *num*, *num-3*, or *num-5*';
    patternWarning.style.display = 'flex';
    input.classList.add('input-invalid');
  } else {
    patternWarning.style.display = 'none';
    input.classList.remove('input-invalid');
  }
}

function validateFolderPath(path) {
  const folderWarning = document.getElementById('folderWarning');
  const input = document.getElementById('downloadFolder');
  
  if (!path) {
    folderWarning.style.display = 'none';
    input.classList.remove('input-invalid');
    return;
  }
  
  const invalidChars = /[<>:"|?*\\/]/;
  
  if (invalidChars.test(path)) {
    folderWarning.textContent = 'Folder name contains invalid characters: < > : " | ? * \\ /';
    folderWarning.style.display = 'flex';
    input.classList.add('input-invalid');
  } else {
    folderWarning.style.display = 'none';
    input.classList.remove('input-invalid');
  }
}

function toggleHelpSection() {
  const helpSection = document.getElementById('helpSection');
  const helpToggle = document.getElementById('helpToggle');
  
  if (helpSection.style.display === 'none' || !helpSection.classList.contains('open')) {
    helpSection.style.display = 'block';
    setTimeout(() => {
      helpSection.classList.add('open');
    }, 10);
    helpToggle.textContent = '📖 Hide Help & Token Reference';
  } else {
    helpSection.classList.remove('open');
    setTimeout(() => {
      helpSection.style.display = 'none';
    }, 400);
    helpToggle.textContent = '📖 Show Help & Token Reference';
  }
}

async function resetToDefaults() {
  const confirmed = confirm(
    '⚠️ Reset all settings to defaults?\n\n' +
    'This will restore all pagination, download, and export settings to their default values.\n\n' +
    'This action cannot be undone.'
  );
  
  if (!confirmed) {
    return;
  }
  
  settings = { ...DEFAULT_SETTINGS };
  
  applySettings();
  
  await saveSettings();
  
  validateFilenamePattern(settings.filenamePattern);
  validateFolderPath(settings.downloadFolder || '');
  
  toast.success('All settings have been reset to defaults!');
}

function handleMemoryWarning(data) {
  const memoryEl = document.getElementById('memoryStatus');
  
  memoryEl.style.display = 'block';
  
  if (data.usage && data.usage > 0.9) {
    toast.error(`Memory usage critical: ${(data.usage * 100).toFixed(0)}%`);
  } else if (data.usage && data.usage > 0.8) {
    toast.warning(`Memory usage high: ${(data.usage * 100).toFixed(0)}%`);
  }
  
  if (data.message) {
    toast.warning(data.message);
  }
  
  updateMemoryStats(data);
}

function updateMemoryStats(data) {
  const memoryEl = document.getElementById('memoryStatus');
  const usedEl = document.getElementById('memoryUsed');
  const limitEl = document.getElementById('memoryLimit');
  const percentEl = document.getElementById('memoryPercent');
  
  if (!data) return;
  
  memoryEl.style.display = 'block';
  
  if (data.used !== undefined) {
    usedEl.textContent = `Used: ${formatBytes(data.used)}`;
  }
  
  if (data.limit !== undefined) {
    limitEl.textContent = `Limit: ${formatBytes(data.limit)}`;
  }
  
  if (data.usage !== undefined) {
    const percent = (data.usage * 100).toFixed(1);
    percentEl.textContent = `${percent}%`;
    
    if (data.usage > 0.9) {
      percentEl.style.color = '#f44336';
    } else if (data.usage > 0.8) {
      percentEl.style.color = '#ff9800';
    } else {
      percentEl.style.color = '#4CAF50';
    }
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
