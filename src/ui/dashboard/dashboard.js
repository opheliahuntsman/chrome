import { MESSAGE_TYPES, DEFAULT_SETTINGS, PAGINATION_STATES } from '../../shared/constants.js';
import { FilenameGenerator } from '../../shared/filename-generator.js';
import { ToastNotifier } from '../../shared/toast-notifier.js';

const filenameGenerator = new FilenameGenerator();
const toast = new ToastNotifier();

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
  
  // Always enable UI interaction, even if previous steps failed
  try {
    enableUIInteraction();
    console.log('UI interaction enabled');
  } catch (error) {
    console.error('Error enabling UI interaction:', error);
  }

  // Async initialization - failures here should not block UI
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
  const paginationMethodEl = document.getElementById('paginationMethod');
  if (paginationMethodEl) {
    paginationMethodEl.value = settings.paginationMethod;
  }
  
  const filenamePatternEl = document.getElementById('filenamePattern');
  if (filenamePatternEl) {
    filenamePatternEl.value = settings.filenamePattern;
  }
  
  if (settings.paginationDelay !== undefined) {
    const paginationDelayEl = document.getElementById('paginationDelay');
    if (paginationDelayEl) {
      paginationDelayEl.value = settings.paginationDelay;
    }
  }
  
  if (settings.scrollDelay !== undefined) {
    const scrollDelayEl = document.getElementById('scrollDelay');
    if (scrollDelayEl) {
      scrollDelayEl.value = settings.scrollDelay;
    }
  }
  
  if (settings.concurrentDownloads !== undefined) {
    const concurrentDownloadsEl = document.getElementById('concurrentDownloads');
    if (concurrentDownloadsEl) {
      concurrentDownloadsEl.value = settings.concurrentDownloads;
    }
    const concurrentValueEl = document.getElementById('concurrentValue');
    if (concurrentValueEl) {
      concurrentValueEl.textContent = settings.concurrentDownloads;
    }
  }
  
  if (settings.downloadDelay !== undefined) {
    const downloadDelayEl = document.getElementById('downloadDelay');
    if (downloadDelayEl) {
      downloadDelayEl.value = settings.downloadDelay;
    }
  }
  
  if (settings.batchSize !== undefined) {
    const batchSizeEl = document.getElementById('batchSize');
    if (batchSizeEl) {
      batchSizeEl.value = settings.batchSize;
    }
  }
  
  if (settings.downloadFolder !== undefined) {
    const downloadFolderEl = document.getElementById('downloadFolder');
    if (downloadFolderEl) {
      downloadFolderEl.value = settings.downloadFolder;
    }
  }
  
  updateFilenameExample();
}

function initializeUI() {
  updateImageStats();
  updateFilenameExample();
}

function setupEventListeners() {
  try {
    // Button event listeners
    const startPaginationBtn = document.getElementById('startPagination');
    if (startPaginationBtn) startPaginationBtn.addEventListener('click', startPagination);
    
    const pausePaginationBtn = document.getElementById('pausePagination');
    if (pausePaginationBtn) pausePaginationBtn.addEventListener('click', pausePagination);
    
    const resumePaginationBtn = document.getElementById('resumePagination');
    if (resumePaginationBtn) resumePaginationBtn.addEventListener('click', resumePagination);
    
    const cancelPaginationBtn = document.getElementById('cancelPagination');
    if (cancelPaginationBtn) cancelPaginationBtn.addEventListener('click', cancelPagination);
    
    const stopPaginationBtn = document.getElementById('stopPagination');
    if (stopPaginationBtn) stopPaginationBtn.addEventListener('click', stopPagination);
    
    const clearImagesBtn = document.getElementById('clearImages');
    if (clearImagesBtn) clearImagesBtn.addEventListener('click', clearImages);
    
    const exportAllFormatsBtn = document.getElementById('exportAllFormats');
    if (exportAllFormatsBtn) exportAllFormatsBtn.addEventListener('click', exportAllFormats);
    
    const downloadImagesBtn = document.getElementById('downloadImages');
    if (downloadImagesBtn) downloadImagesBtn.addEventListener('click', downloadAllImages);

    // Dropdown event listeners
    const paginationMethodSelect = document.getElementById('paginationMethod');
    if (paginationMethodSelect) {
      paginationMethodSelect.addEventListener('change', (e) => {
        settings.paginationMethod = e.target.value;
        saveSettings();
      });
    }

    // Token button event listeners
    document.querySelectorAll('.token-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('filenamePattern');
        if (input) {
          input.value += btn.dataset.token;
          settings.filenamePattern = input.value;
          updateFilenameExample();
          saveSettings();
        }
      });
    });

    // Input field event listeners
    const paginationDelayInput = document.getElementById('paginationDelay');
    if (paginationDelayInput) {
      paginationDelayInput.addEventListener('input', (e) => {
        settings.paginationDelay = parseFloat(e.target.value) || 0;
        saveSettings();
      });
    }

    const scrollDelayInput = document.getElementById('scrollDelay');
    if (scrollDelayInput) {
      scrollDelayInput.addEventListener('input', (e) => {
        settings.scrollDelay = parseInt(e.target.value) || 0;
        saveSettings();
      });
    }

    const concurrentDownloadsInput = document.getElementById('concurrentDownloads');
    if (concurrentDownloadsInput) {
      concurrentDownloadsInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value) || 1;
        settings.concurrentDownloads = Math.max(1, Math.min(10, value));
        const concurrentValueSpan = document.getElementById('concurrentValue');
        if (concurrentValueSpan) {
          concurrentValueSpan.textContent = settings.concurrentDownloads;
        }
        e.target.value = settings.concurrentDownloads;
        saveSettings();
      });
    }

    const downloadDelayInput = document.getElementById('downloadDelay');
    if (downloadDelayInput) {
      downloadDelayInput.addEventListener('input', (e) => {
        settings.downloadDelay = parseFloat(e.target.value) || 0;
        saveSettings();
      });
    }

    const batchSizeInput = document.getElementById('batchSize');
    if (batchSizeInput) {
      batchSizeInput.addEventListener('input', (e) => {
        settings.batchSize = parseInt(e.target.value) || 0;
        saveSettings();
      });
    }

    const downloadFolderInput = document.getElementById('downloadFolder');
    if (downloadFolderInput) {
      downloadFolderInput.addEventListener('input', (e) => {
        const folder = e.target.value.trim();
        settings.downloadFolder = folder;
        validateFolderPath(folder);
        saveSettings();
      });
    }

    // Numeric input validation
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

    const filenamePatternInput = document.getElementById('filenamePattern');
    if (filenamePatternInput) {
      filenamePatternInput.addEventListener('input', (e) => {
        const pattern = e.target.value;
        settings.filenamePattern = pattern;
        validateFilenamePattern(pattern);
        updateFilenameExample();
        saveSettings();
      });
    }

    const helpToggleBtn = document.getElementById('helpToggle');
    if (helpToggleBtn) {
      helpToggleBtn.addEventListener('click', toggleHelpSection);
    }

    const resetSettingsBtn = document.getElementById('resetSettings');
    if (resetSettingsBtn) {
      resetSettingsBtn.addEventListener('click', resetToDefaults);
    }

    // Runtime message listener (only if Chrome extension API is available)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
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
    
    console.log('Event listeners initialized successfully');
  } catch (error) {
    console.error('Error setting up event listeners:', error);
    // Don't throw - allow initialization to continue
  }
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

  // Early return if required buttons don't exist
  if (!startBtn || !stopBtn) {
    console.warn('Pagination buttons not found, skipping button update');
    return;
  }

  switch (state) {
    case PAGINATION_STATES.IDLE:
      startBtn.style.display = 'inline-block';
      if (pauseBtn) pauseBtn.style.display = 'none';
      if (resumeBtn) resumeBtn.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      break;

    case PAGINATION_STATES.RUNNING:
      startBtn.style.display = 'none';
      if (pauseBtn) {
        pauseBtn.style.display = 'inline-block';
        pauseBtn.disabled = false;
      }
      if (resumeBtn) resumeBtn.style.display = 'none';
      if (cancelBtn) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.disabled = false;
      }
      stopBtn.style.display = 'inline-block';
      stopBtn.disabled = false;
      break;

    case PAGINATION_STATES.PAUSED:
      startBtn.style.display = 'none';
      if (pauseBtn) pauseBtn.style.display = 'none';
      if (resumeBtn) {
        resumeBtn.style.display = 'inline-block';
        resumeBtn.disabled = false;
      }
      if (cancelBtn) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.disabled = false;
      }
      stopBtn.style.display = 'inline-block';
      stopBtn.disabled = false;
      break;

    case PAGINATION_STATES.CANCELLED:
    case PAGINATION_STATES.COMPLETE:
    case PAGINATION_STATES.ERROR:
      startBtn.style.display = 'inline-block';
      if (pauseBtn) pauseBtn.style.display = 'none';
      if (resumeBtn) resumeBtn.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      break;

    default:
      startBtn.style.display = 'inline-block';
      if (pauseBtn) pauseBtn.style.display = 'none';
      if (resumeBtn) resumeBtn.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
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
  const totalImagesEl = document.getElementById('totalImages');
  if (totalImagesEl) {
    totalImagesEl.textContent = `${collectedImages.length} image${collectedImages.length !== 1 ? 's' : ''}`;
  }
}

function updateFilenameExample() {
  const patternInput = document.getElementById('filenamePattern');
  const exampleEl = document.getElementById('filenameExample');
  if (patternInput && exampleEl) {
    const pattern = patternInput.value;
    const example = generateFilenameExample(pattern);
    exampleEl.textContent = example;
  }
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
