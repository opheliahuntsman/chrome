import { Logger } from '../shared/logger.js';
import { ContentHasher } from '../shared/content-hasher.js';
import { AdaptiveTimer } from '../shared/adaptive-timer.js';
import { MemoryMonitor } from '../shared/memory-monitor.js';
import { CheckpointManager } from '../shared/checkpoint-manager.js';
import { PAGINATION_CONFIG, MESSAGE_TYPES, PAGINATION_STATES } from '../shared/constants.js';

export class PaginationEngine {
  constructor(options = {}) {
    this.logger = new Logger('PaginationEngine');
    this.method = options.method || 'auto';
    this.maxPages = options.maxPages || PAGINATION_CONFIG.MAX_PAGES;
    this.currentPage = 1;
    this.isActive = false;
    this.attempts = 0;
    this.contentHasher = new ContentHasher({ lookbackSize: PAGINATION_CONFIG.DUPLICATE_CHECK_LOOKBACK });
    this.latestPaginationInfo = null;
    this.settings = {
      paginationDelay: 2,
      scrollDelay: 500,
      enableAdaptiveTiming: true,
      enableMemoryMonitoring: true
    };
    
    this.currentState = PAGINATION_STATES.IDLE;
    this.adaptiveTimer = new AdaptiveTimer({
      minDelay: PAGINATION_CONFIG.ADAPTIVE_TIMING_MIN,
      maxDelay: PAGINATION_CONFIG.ADAPTIVE_TIMING_MAX,
      defaultDelay: PAGINATION_CONFIG.ADAPTIVE_TIMING_DEFAULT
    });
    
    this.memoryMonitor = new MemoryMonitor({
      threshold: 0.8,
      onThresholdExceeded: (stats) => this.handleMemoryWarning(stats)
    });
    
    this.checkpointManager = new CheckpointManager();
    this.collectedImages = [];
    this.imageExtractor = null;
  }

  setImageExtractor(extractor) {
    this.imageExtractor = extractor;
  }

  updateSettings(settings) {
    if (settings) {
      this.settings = {
        ...this.settings,
        paginationDelay: settings.paginationDelay ?? this.settings.paginationDelay,
        scrollDelay: settings.scrollDelay ?? this.settings.scrollDelay,
        enableAdaptiveTiming: settings.enableAdaptiveTiming ?? this.settings.enableAdaptiveTiming,
        enableMemoryMonitoring: settings.enableMemoryMonitoring ?? this.settings.enableMemoryMonitoring
      };
    }
  }

  async start(method = 'auto') {
    if (this.isActive) {
      this.logger.warn('Pagination already active');
      this.showToast('Pagination is already running', 'warning');
      return;
    }

    if (!this.imageExtractor) {
      this.logger.error('ImageExtractor not set');
      this.showToast('Image extractor not initialized', 'error');
      return;
    }

    const existingCheckpoint = await this.checkpointManager.loadCheckpoint();
    if (existingCheckpoint) {
      this.logger.log('Found existing checkpoint', existingCheckpoint);
      this.showToast(`Resume from page ${existingCheckpoint.currentPage}?`, 'info');
      
      this.currentPage = existingCheckpoint.currentPage;
      this.collectedImages = existingCheckpoint.collectedImages || [];
      this.method = existingCheckpoint.method || method;
      if (existingCheckpoint.settings) {
        this.updateSettings(existingCheckpoint.settings);
      }
    } else {
      this.method = method;
      this.currentPage = 1;
      this.collectedImages = [];
    }

    this.isActive = true;
    this.currentState = PAGINATION_STATES.RUNNING;
    this.attempts = 0;
    this.contentHasher.clear();
    this.adaptiveTimer.reset();

    if (this.settings.enableMemoryMonitoring) {
      this.memoryMonitor.start();
    }

    this.logger.log(`Starting pagination with method: ${this.method}`);
    this.showToast(`Starting pagination from page ${this.currentPage}`, 'success');

    try {
      await this.paginationLoop();
    } catch (error) {
      this.logger.error('Pagination error:', error);
      this.showToast(`Pagination error: ${error.message}`, 'error');
      this.currentState = PAGINATION_STATES.ERROR;
    } finally {
      this.stop();
    }
  }

  async paginationLoop() {
    while (this.isActive && 
           this.currentState === PAGINATION_STATES.RUNNING && 
           this.attempts < PAGINATION_CONFIG.MAX_ATTEMPTS && 
           this.currentPage <= this.maxPages) {
      
      if (this.currentState === PAGINATION_STATES.PAUSED) {
        this.logger.log('Pagination paused, waiting...');
        await this.waitForResume();
        continue;
      }

      if (this.currentState === PAGINATION_STATES.CANCELLED) {
        this.logger.log('Pagination cancelled');
        this.showToast('Pagination cancelled', 'info');
        break;
      }

      const pageStartTime = Date.now();
      
      this.logger.log(`Processing page ${this.currentPage}, attempt ${this.attempts + 1}`);

      if (this.settings.enableMemoryMonitoring) {
        const memoryStats = this.memoryMonitor.checkMemory();
        if (memoryStats && memoryStats.usageRatio >= 0.8) {
          this.logger.warn(`Memory usage high: ${memoryStats.usagePercent}%`);
          this.showToast(`Memory usage high (${memoryStats.usagePercent}%), pausing...`, 'warning');
          await this.pause();
          await this.waitForContent(5000);
          continue;
        }
      }

      const beforeHash = await this.contentHasher.hashContent(document.body);
      
      const success = await this.executeMethod();
      
      if (!success) {
        this.logger.log('Pagination method returned false, stopping');
        this.showToast('No more pages to paginate', 'info');
        break;
      }

      this.attempts++;
      
      await this.waitForContent(PAGINATION_CONFIG.WAIT_FOR_CONTENT);
      
      const afterHash = await this.contentHasher.hashContent(document.body);
      
      if (this.contentHasher.isDuplicate(afterHash)) {
        this.logger.log('Duplicate content detected, stopping pagination');
        this.showToast('Duplicate content detected, pagination complete', 'info');
        break;
      }
      
      this.contentHasher.addHash(afterHash);

      const images = await this.extractImagesFromCurrentPage();
      
      if (images.length > 0) {
        this.logger.log(`Found ${images.length} images on page ${this.currentPage}`);
        await this.downloadImagesFromCurrentPage(images);
      } else {
        this.logger.log(`No images found on page ${this.currentPage}`);
      }

      const pageEndTime = Date.now();
      const responseTime = pageEndTime - pageStartTime;
      
      if (this.settings.enableAdaptiveTiming) {
        this.adaptiveTimer.recordResponseTime(responseTime);
      }

      if (this.checkpointManager.shouldCheckpoint(this.currentPage)) {
        await this.saveCheckpoint();
      }

      this.currentPage++;
      this.sendStatus('paginating');
      
      const delay = this.settings.enableAdaptiveTiming 
        ? this.adaptiveTimer.getOptimalDelay()
        : (this.settings.paginationDelay ?? 2) * 1000;
      
      this.logger.log(`Waiting ${delay}ms before next page`);
      await this.waitForContent(delay);
    }

    if (this.attempts >= PAGINATION_CONFIG.MAX_ATTEMPTS) {
      this.showToast('Max attempts reached', 'warning');
    }
  }

  async extractImagesFromCurrentPage() {
    try {
      if (!this.imageExtractor) {
        this.logger.error('ImageExtractor not available');
        return [];
      }

      this.imageExtractor.pageNumber = this.currentPage;
      
      const images = await this.imageExtractor.extractImagesWithLazyLoading({
        scrollDelay: this.settings.scrollDelay || 500
      });

      this.collectedImages.push(...images);
      
      return images;
    } catch (error) {
      this.logger.error('Error extracting images:', error);
      this.showToast(`Error extracting images: ${error.message}`, 'error');
      return [];
    }
  }

  async downloadImagesFromCurrentPage(images) {
    try {
      this.logger.log(`Sending ${images.length} images to download manager (page ${this.currentPage})`);
      
      // Send download request - Chrome handles downloads asynchronously in background
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.DOWNLOAD_START,
        images: images,
        pageNumber: this.currentPage
      }).catch(err => {
        this.logger.error('Error sending download message:', err);
      });

      // No need to wait - downloads happen in background
      // This allows pagination to continue smoothly
      this.logger.log(`Download request sent for page ${this.currentPage} - continuing pagination`);
      
    } catch (error) {
      this.logger.error('Error requesting downloads:', error);
      this.showToast(`Download error: ${error.message}`, 'error');
    }
  }

  async waitForResume() {
    while (this.currentState === PAGINATION_STATES.PAUSED) {
      await this.waitForContent(1000);
    }
  }

  async pause() {
    if (this.currentState !== PAGINATION_STATES.RUNNING) {
      this.logger.warn('Cannot pause: not running');
      return;
    }

    this.currentState = PAGINATION_STATES.PAUSED;
    this.logger.log('Pagination paused');
    this.showToast('Pagination paused', 'info');
    
    await this.saveCheckpoint();
    
    this.sendStatus('paused');
  }

  async resume() {
    if (this.currentState !== PAGINATION_STATES.PAUSED) {
      this.logger.warn('Cannot resume: not paused');
      return;
    }

    this.currentState = PAGINATION_STATES.RUNNING;
    this.logger.log('Pagination resumed');
    this.showToast('Pagination resumed', 'success');
    
    this.sendStatus('resumed');
  }

  async cancel() {
    this.currentState = PAGINATION_STATES.CANCELLED;
    this.isActive = false;
    this.logger.log('Pagination cancelled');
    this.showToast('Pagination cancelled', 'info');
    
    await this.checkpointManager.clearCheckpoint();
    
    this.sendStatus('cancelled');
  }

  async saveCheckpoint() {
    try {
      const success = await this.checkpointManager.saveCheckpoint({
        currentPage: this.currentPage,
        collectedImages: this.collectedImages,
        method: this.method,
        settings: this.settings,
        totalPages: this.maxPages,
        state: this.currentState
      });

      if (success) {
        this.logger.log(`Checkpoint saved at page ${this.currentPage}`);
      }
    } catch (error) {
      this.logger.error('Error saving checkpoint:', error);
      this.showToast('Failed to save checkpoint', 'error');
    }
  }

  handleMemoryWarning(stats) {
    this.logger.warn('Memory threshold exceeded', stats);
    this.showToast(
      `High memory usage: ${stats.usagePercent}% (${stats.formatted.used}/${stats.formatted.total})`,
      'warning'
    );
    
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.MEMORY_WARNING,
      data: stats
    }).catch(err => this.logger.debug('Error sending memory warning:', err));
  }

  showToast(message, type = 'info') {
    try {
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.TOAST_SHOW,
        data: {
          message: message,
          type: type,
          duration: type === 'error' ? 5000 : 3000
        }
      }).catch(err => this.logger.debug('Error sending toast:', err));
    } catch (error) {
      this.logger.debug('Error showing toast:', error);
    }
  }

  async executeMethod() {
    if (this.method === 'auto') {
      return await this.autoDetectAndExecute();
    }

    const methods = {
      'nextButton': () => this.paginateNextButton(),
      'loadMore': () => this.paginateLoadMore(),
      'infiniteScroll': () => this.paginateInfiniteScroll(),
      'arrow': () => this.paginateArrow(),
      'urlPattern': () => this.paginateUrlPattern(),
      'api': () => this.paginateAPI()
    };

    const methodFunc = methods[this.method];
    if (methodFunc) {
      return await methodFunc.call(this);
    }

    this.logger.warn(`Unknown pagination method: ${this.method}`);
    this.showToast(`Unknown pagination method: ${this.method}`, 'error');
    return false;
  }

  async autoDetectAndExecute() {
    const methods = await this.detectPaginationMethods();

    if (methods.nextButton.available) {
      this.logger.log('Using Next Button method');
      return await this.paginateNextButton(methods.nextButton);
    } else if (methods.loadMore.available) {
      this.logger.log('Using Load More method');
      return await this.paginateLoadMore(methods.loadMore);
    } else if (methods.arrow.available) {
      this.logger.log('Using Arrow method');
      return await this.paginateArrow(methods.arrow);
    } else if (methods.urlPattern.available) {
      this.logger.log('Using URL Pattern method');
      return await this.paginateUrlPattern(methods.urlPattern);
    } else if (methods.api.available) {
      this.logger.log('Using API method');
      return await this.paginateAPI(methods.api);
    } else if (methods.infiniteScroll.available) {
      this.logger.log('Using Infinite Scroll method');
      return await this.paginateInfiniteScroll();
    }

    this.logger.warn('No pagination method detected');
    this.showToast('No pagination method detected', 'warning');
    return false;
  }

  async detectPaginationMethods() {
    const methods = {
      nextButton: await this.detectNextButton(),
      loadMore: await this.detectLoadMore(),
      infiniteScroll: this.detectInfiniteScroll(),
      arrow: await this.detectArrow(),
      urlPattern: this.detectUrlPattern(),
      api: { available: false }
    };

    return methods;
  }

  async detectNextButton() {
    const nextSelectors = [
      'a[rel="next"]',
      'link[rel="next"]',
      'a.next',
      'a.pagination-next',
      'a.page-next',
      'button.next',
      'a[aria-label*="next" i]',
      'a[title*="next" i]',
      '.pagination .next a',
      '.pager .next',
      'nav a[rel="next"]',
      '.paging-page-next a',
      '.paging-page-next',
      'li.paging-page-next a',
      '[class*="page-next"] a',
      '[class*="pagination-next"] a',
      '.mediagroup-paging .paging-page-next a',
      'a.paging-link-next',
      '[data-page="next"]'
    ];

    for (const selector of nextSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element) && !element.disabled && !element.classList.contains('disabled')) {
          return {
            available: true,
            selector: selector,
            element: element
          };
        }
      } catch (e) {
        this.logger.debug(`Error checking selector ${selector}:`, e);
      }
    }

    const allLinks = document.querySelectorAll('a, button');
    const nextPatterns = [
      /^next$/i,
      /^next\s+page$/i,
      /^→$/,
      /^›$/,
      /^»$/,
      /^continue$/i,
      /^siguiente$/i,
      /^suivant$/i,
      /^weiter$/i,
      /^nächste$/i,
      /^weitere$/i,
      /^more$/i,
      /^vorwärts$/i
    ];

    for (const link of allLinks) {
      const text = link.textContent.trim();
      const title = link.title || link.getAttribute('aria-label') || '';
      
      if ((nextPatterns.some(pattern => pattern.test(text)) || 
           nextPatterns.some(pattern => pattern.test(title))) && 
          this.isElementVisible(link)) {
        return {
          available: true,
          selector: null,
          element: link
        };
      }
    }

    const pagingLinks = document.querySelectorAll('.paging-page a, .pagination a');
    let currentPageFound = false;
    for (const link of pagingLinks) {
      const parentLi = link.closest('li');
      if (parentLi && (parentLi.classList.contains('active') || parentLi.classList.contains('current'))) {
        currentPageFound = true;
        continue;
      }
      if (currentPageFound && this.isElementVisible(link)) {
        return {
          available: true,
          selector: null,
          element: link,
          type: 'sequential'
        };
      }
    }

    return { available: false };
  }

  async detectLoadMore() {
    const loadMoreSelectors = [
      'button[class*="load-more" i]',
      'a[class*="load-more" i]',
      'button[data-action="load-more"]',
      '[class*="show-more" i]',
      '[class*="view-more" i]',
      'button[aria-label*="load more" i]',
      '.infinite-scroll-button',
      '.load-more-btn'
    ];

    for (const selector of loadMoreSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          return {
            available: true,
            selector: selector,
            element: element
          };
        }
      } catch (e) {
        this.logger.debug(`Error checking selector ${selector}:`, e);
      }
    }

    const allButtons = document.querySelectorAll('button, a');
    const loadMorePatterns = [
      /load\s+more/i,
      /show\s+more/i,
      /view\s+more/i,
      /see\s+more/i,
      /mehr\s+laden/i,
      /voir\s+plus/i
    ];

    for (const button of allButtons) {
      const text = button.textContent.trim();
      if (loadMorePatterns.some(pattern => pattern.test(text)) && this.isElementVisible(button)) {
        return {
          available: true,
          selector: null,
          element: button
        };
      }
    }

    return { available: false };
  }

  async detectArrow() {
    const arrowSelectors = [
      'a[aria-label*="next" i]',
      'button[aria-label*="next" i]',
      '[class*="arrow-right"]',
      '[class*="chevron-right"]',
      '.icon-next',
      '.fa-arrow-right',
      '.fa-chevron-right'
    ];

    for (const selector of arrowSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          return {
            available: true,
            selector: selector,
            element: element
          };
        }
      } catch (e) {
        this.logger.debug(`Error checking selector ${selector}:`, e);
      }
    }

    return { available: false };
  }

  detectUrlPattern() {
    const queryPatterns = ['page', 'p', 'pg', 'pagenum', 'offset', 'start', 'PAGE', 'OFFSET', 'from', 'skip'];
    const pathPatterns = [
      /\/page\/(\d+)/,
      /\/p\/(\d+)/,
      /-page-(\d+)/,
      /-p(\d+)\./,
      /\/(\d+)$/
    ];

    try {
      const url = new URL(window.location.href);

      for (const param of queryPatterns) {
        if (url.searchParams.has(param)) {
          const currentPage = parseInt(url.searchParams.get(param)) || 1;
          return {
            available: true,
            type: 'query',
            param: param,
            currentPage: currentPage,
            nextPage: currentPage + 1
          };
        }
      }

      for (const pattern of pathPatterns) {
        const match = url.pathname.match(pattern);
        if (match) {
          const currentPage = parseInt(match[1]) || 1;
          return {
            available: true,
            type: 'path',
            pattern: pattern,
            currentPage: currentPage,
            nextPage: currentPage + 1
          };
        }
      }

      const eventParam = url.searchParams.get('EVENT');
      if (eventParam === 'WEBSHOP_SEARCH') {
        return {
          available: true,
          type: 'webshop',
          param: 'PAGE',
          currentPage: parseInt(url.searchParams.get('PAGE')) || 1,
          nextPage: (parseInt(url.searchParams.get('PAGE')) || 1) + 1
        };
      }
    } catch (error) {
      this.logger.error('Error detecting URL pattern:', error);
    }

    return { available: false };
  }

  detectInfiniteScroll() {
    const scrollableContainers = document.querySelectorAll('[style*="overflow"]');
    
    for (const container of scrollableContainers) {
      const style = window.getComputedStyle(container);
      const overflowY = style.overflowY;
      
      if ((overflowY === 'scroll' || overflowY === 'auto') && 
          container.scrollHeight > container.clientHeight) {
        return {
          available: true,
          container: container
        };
      }
    }

    if (document.body.scrollHeight > window.innerHeight + 100) {
      return {
        available: true,
        container: document.body
      };
    }

    return { available: false };
  }

  async paginateNextButton(method = null) {
    const detectedMethod = method || await this.detectNextButton();
    
    if (!detectedMethod.available) {
      return false;
    }

    const element = detectedMethod.element || document.querySelector(detectedMethod.selector);
    
    if (!element || !this.isElementVisible(element)) {
      return false;
    }

    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.waitForContent(500);
      
      element.click();
      this.logger.log('Clicked next button');
      return true;
    } catch (error) {
      this.logger.error('Error clicking next button:', error);
      this.showToast('Error clicking next button', 'error');
      return false;
    }
  }

  async paginateLoadMore(method = null) {
    const detectedMethod = method || await this.detectLoadMore();
    
    if (!detectedMethod.available) {
      return false;
    }

    const element = detectedMethod.element || document.querySelector(detectedMethod.selector);
    
    if (!element || !this.isElementVisible(element)) {
      return false;
    }

    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.waitForContent(500);
      
      element.click();
      this.logger.log('Clicked load more button');
      return true;
    } catch (error) {
      this.logger.error('Error clicking load more button:', error);
      this.showToast('Error clicking load more button', 'error');
      return false;
    }
  }

  async paginateInfiniteScroll() {
    try {
      const scrollTarget = document.documentElement || document.body;
      const currentScroll = window.scrollY;
      const targetScroll = scrollTarget.scrollHeight - window.innerHeight;

      if (currentScroll >= targetScroll - 100) {
        this.logger.log('Already at bottom of page');
        return false;
      }

      window.scrollTo({
        top: targetScroll,
        behavior: 'auto'
      });

      this.logger.log('Scrolled to bottom for infinite scroll');
      await this.waitForContent(1000);
      return true;
    } catch (error) {
      this.logger.error('Error performing infinite scroll:', error);
      this.showToast('Error performing infinite scroll', 'error');
      return false;
    }
  }

  async paginateArrow(method = null) {
    const detectedMethod = method || await this.detectArrow();
    
    if (!detectedMethod.available) {
      return false;
    }

    const element = detectedMethod.element || document.querySelector(detectedMethod.selector);
    
    if (!element || !this.isElementVisible(element)) {
      return false;
    }

    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.waitForContent(500);
      
      element.click();
      this.logger.log('Clicked arrow navigation');
      return true;
    } catch (error) {
      this.logger.error('Error clicking arrow:', error);
      this.showToast('Error clicking arrow', 'error');
      return false;
    }
  }

  async paginateUrlPattern(method = null) {
    const detectedMethod = method || this.detectUrlPattern();
    
    if (!detectedMethod.available) {
      return false;
    }

    try {
      const currentUrl = new URL(window.location.href);
      let nextUrl;

      if (detectedMethod.type === 'query') {
        nextUrl = new URL(currentUrl);
        nextUrl.searchParams.set(detectedMethod.param, detectedMethod.nextPage.toString());
      } else if (detectedMethod.type === 'path') {
        nextUrl = new URL(currentUrl);
        nextUrl.pathname = currentUrl.pathname.replace(
          detectedMethod.pattern,
          (match, pageNum) => match.replace(pageNum, detectedMethod.nextPage.toString())
        );
      }

      if (nextUrl && nextUrl.href !== currentUrl.href) {
        this.logger.log(`Navigating to: ${nextUrl.href}`);
        window.location.href = nextUrl.href;
        return true;
      }
    } catch (error) {
      this.logger.error('Error navigating to next page via URL pattern:', error);
      this.showToast('Error navigating to next page', 'error');
    }

    return false;
  }

  async paginateAPI(method = null) {
    this.logger.log('API pagination requires network monitoring integration');
    this.showToast('API pagination not yet implemented', 'warning');
    return false;
  }

  isElementVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  waitForContent(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.isActive = false;
    this.currentState = PAGINATION_STATES.COMPLETE;
    
    if (this.settings.enableMemoryMonitoring) {
      this.memoryMonitor.stop();
    }
    
    this.checkpointManager.clearCheckpoint();
    
    this.sendStatus('complete');
    this.logger.log(`Pagination complete. Pages processed: ${this.currentPage}, Attempts: ${this.attempts}`);
    this.showToast(`Pagination complete. Processed ${this.currentPage} pages`, 'success');
  }

  sendStatus(status) {
    try {
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.CORE_PAGINATION_STATUS,
        data: {
          status: status,
          currentPage: this.currentPage,
          attempts: this.attempts,
          method: this.method,
          state: this.currentState,
          totalImages: this.collectedImages.length,
          message: this.getStatusMessage(status)
        }
      }).catch(err => this.logger.debug('Error sending status:', err));
    } catch (error) {
      this.logger.debug('Error sending pagination status:', error);
    }
  }

  getStatusMessage(status) {
    switch (status) {
      case 'paginating':
        return `Processing page ${this.currentPage}...`;
      case 'paused':
        return `Paused at page ${this.currentPage}`;
      case 'resumed':
        return `Resumed from page ${this.currentPage}`;
      case 'cancelled':
        return 'Pagination cancelled';
      case 'complete':
        return this.attempts >= PAGINATION_CONFIG.MAX_ATTEMPTS 
          ? 'Max attempts reached' 
          : `Pagination complete - ${this.currentPage} pages processed`;
      default:
        return 'Paginating...';
    }
  }
}

export default PaginationEngine;
