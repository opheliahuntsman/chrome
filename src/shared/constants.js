export const VERSION = '3.1.0';

export const DEV_MODE = (() => {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const url = chrome.runtime.getURL('');
      return url.includes('localhost') || url.includes('dev');
    }
  } catch (e) {}
  return false;
})();

export const FEATURES = {
  DEBUG_PANEL: DEV_MODE,
  VERBOSE_LOGGING: DEV_MODE,
  PERFORMANCE_PROFILING: DEV_MODE
};

export const PAGINATION_CONFIG = {
  MAX_PAGES: 50,
  MAX_ATTEMPTS: 50,
  WAIT_AFTER_CLICK: 2000,
  WAIT_FOR_CONTENT: 1500,
  SCROLL_DELAY: 500,
  DUPLICATE_CHECK_LOOKBACK: 10,
  CHECKPOINT_INTERVAL: 5,
  ENABLE_ADAPTIVE_TIMING: true,
  ADAPTIVE_TIMING_MIN: 1000,
  ADAPTIVE_TIMING_MAX: 5000,
  ADAPTIVE_TIMING_DEFAULT: 2000
};

export const EXPORT_CONFIG = {
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,
  BATCH_SIZE: 100,
  COMPRESSION_LEVEL: 6,
  STREAMING_THRESHOLD: 500,
  LARGE_DATASET_THRESHOLD: 1000
};

export const DOWNLOAD_CONFIG = {
  CONCURRENT_DOWNLOADS: 3,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  SEQUENTIAL_MODE: true
};

export const MEMORY_CONFIG = {
  MONITOR_ENABLED: true,
  THRESHOLD: 0.8,
  CHECK_INTERVAL: 5000,
  WARNING_COOLDOWN: 30000
};

export const STATE_CONFIG = {
  LOCK_TIMEOUT: 5000,
  MESSAGE_ACK_TIMEOUT: 3000
};

export const MESSAGE_TYPES = {
  CORE_INIT: 'core/init',
  CORE_GALLERY_DETECTED: 'core/gallery-detected',
  CORE_IMAGES_FOUND: 'core/images-found',
  CORE_PAGINATION_START: 'core/pagination-start',
  CORE_PAGINATION_STOP: 'core/pagination-stop',
  CORE_PAGINATION_PAUSE: 'core/pagination-pause',
  CORE_PAGINATION_RESUME: 'core/pagination-resume',
  CORE_PAGINATION_CANCEL: 'core/pagination-cancel',
  CORE_PAGINATION_STATUS: 'core/pagination-status',
  
  EXPORT_CSV: 'export/csv',
  EXPORT_XLSX: 'export/xlsx',
  EXPORT_JSON: 'export/json',
  EXPORT_HTML: 'export/html',
  
  DOWNLOAD_START: 'download/start',
  DOWNLOAD_PROGRESS: 'download/progress',
  DOWNLOAD_COMPLETE: 'download/complete',
  DOWNLOAD_BATCH_CONFIRM: 'download/batch-confirm',
  DOWNLOAD_PAGE_COMPLETE: 'download/page-complete',
  
  SETTINGS_UPDATE: 'settings/update',
  SETTINGS_GET: 'settings/get',
  
  GET_IMAGES: 'get/images',
  CLEAR_IMAGES: 'clear/images',
  
  CHECKPOINT_SAVE: 'checkpoint/save',
  CHECKPOINT_LOAD: 'checkpoint/load',
  CHECKPOINT_CLEAR: 'checkpoint/clear',
  CHECKPOINT_EXISTS: 'checkpoint/exists',
  
  MEMORY_WARNING: 'memory/warning',
  MEMORY_STATS: 'memory/stats',
  
  ERROR_REPORT: 'error/report',
  TOAST_SHOW: 'toast/show',
  
  API_ENDPOINT_DETECTED: 'api/endpoint-detected',
  API_RESPONSE_CAPTURED: 'api/response-captured',
  
  ACK: 'ack'
};

export const DEFAULT_SETTINGS = {
  autoDownload: false,
  downloadFolder: '',
  filenamePattern: '*num-3*-*name*.*ext*',
  paginationMethod: 'auto',
  galleryAutoDetect: true,
  maxPages: 50,
  concurrentDownloads: 3,
  paginationDelay: 2,
  scrollDelay: 500,
  batchSize: 0,
  downloadDelay: 0,
  exportFormats: ['csv'],
  exportFields: ['filename', 'fileUrl', 'dimensions', 'sourcePage'],
  enableAdaptiveTiming: true,
  enableMemoryMonitoring: true,
  sequentialDownload: true
};

export const PAGINATION_STATES = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  CANCELLED: 'CANCELLED',
  COMPLETE: 'COMPLETE',
  ERROR: 'ERROR'
};

export const SITE_PATTERNS = {
  stockPhoto: {
    selectors: [
      '.media-item',
      '.mediagroup',
      '[data-medianumber]',
      '.asset-medium',
      '.photo-item',
      '.image-result',
      '.search-result-item',
      '[class*="gallery-item"]',
      '[class*="photo-thumb"]'
    ],
    imagePatterns: [
      /\/thumb\.php\/(\d+)\.(jpg|jpeg|png|gif)/i,
      /\/preview\/(\d+)\./i,
      /\/medium\/(\d+)\./i
    ]
  },
  pagination: {
    nextSelectors: [
      '.paging-page-next a',
      '.paging-page-next',
      'li.paging-page-next a',
      '[class*="page-next"] a',
      '[class*="pagination-next"] a',
      '.mediagroup-paging .paging-page-next a',
      'a.paging-link-next',
      '[data-page="next"]',
      'a[rel="next"]',
      '.next a',
      'a.next'
    ],
    prevSelectors: [
      '.paging-page-prev a',
      '.paging-page-prev',
      '[class*="page-prev"] a',
      '[class*="pagination-prev"] a',
      'a[rel="prev"]',
      '.prev a',
      'a.prev'
    ],
    pageNumberSelectors: [
      '.paging-page a',
      '.pagination a',
      '[class*="page-number"] a',
      '.page-numbers a'
    ]
  },
  smartframe: {
    selectors: [
      'smartframe-embed',
      '[data-customer-id]',
      'script[src*="smartframe.io"]'
    ]
  }
};

export const GALLERY_TYPES = {
  STOCK_PHOTO: 'stock-photo',
  GRID: 'grid',
  MASONRY: 'masonry',
  CAROUSEL: 'carousel',
  TABLE: 'table',
  SEARCH_RESULTS: 'search-results',
  UNKNOWN: 'unknown'
};
