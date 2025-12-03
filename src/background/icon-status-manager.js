import { Logger } from '../shared/logger.js';

export class IconStatusManager {
  constructor() {
    this.logger = new Logger('IconStatus');
    this.currentStatus = 'idle';
    this.animationInterval = null;
    this.animationFrame = 0;
    this.pageNumber = 1;
    this.isDownloading = false;
  }

  setIdle() {
    this.currentStatus = 'idle';
    this.stopAnimation();
    this.clearBadge();
    this.logger.debug('Status: Idle');
  }

  setPaginating(pageNumber) {
    this.currentStatus = 'paginating';
    this.pageNumber = pageNumber;
    this.startPaginationAnimation();
    this.logger.debug(`Status: Paginating page ${pageNumber}`);
  }

  setDownloading(count, total) {
    this.currentStatus = 'downloading';
    this.isDownloading = true;
    this.stopAnimation();
    
    if (total && total > 0) {
      const percentage = Math.round((count / total) * 100);
      this.setBadge(`${percentage}%`, '#4CAF50');
    } else {
      this.setBadge(String(count), '#4CAF50');
    }
    
    this.logger.debug(`Status: Downloading ${count}/${total || '?'}`);
  }

  setWaiting(seconds) {
    this.currentStatus = 'waiting';
    this.stopAnimation();
    
    if (seconds && seconds > 0) {
      this.setBadge(`${seconds}s`, '#FF9800');
    } else {
      this.setBadge('⏳', '#FF9800');
    }
    
    this.logger.debug(`Status: Waiting ${seconds}s`);
  }

  setPaused() {
    this.currentStatus = 'paused';
    this.stopAnimation();
    this.setBadge('⏸', '#FF5722');
    this.logger.debug('Status: Paused');
  }

  setError(message) {
    this.currentStatus = 'error';
    this.stopAnimation();
    this.setBadge('!', '#F44336');
    this.logger.debug(`Status: Error - ${message}`);
  }

  setComplete() {
    this.currentStatus = 'complete';
    this.stopAnimation();
    this.setBadge('✓', '#4CAF50');
    
    setTimeout(() => {
      if (this.currentStatus === 'complete') {
        this.setIdle();
      }
    }, 3000);
    
    this.logger.debug('Status: Complete');
  }

  startPaginationAnimation() {
    this.stopAnimation();
    this.animationFrame = 0;
    
    const animationFrames = [
      { text: '○', color: '#2196F3' },
      { text: '◔', color: '#2196F3' },
      { text: '◑', color: '#2196F3' },
      { text: '◕', color: '#2196F3' },
      { text: '●', color: '#2196F3' },
      { text: '◕', color: '#2196F3' },
      { text: '◑', color: '#2196F3' },
      { text: '◔', color: '#2196F3' }
    ];
    
    this.animationInterval = setInterval(() => {
      const frame = animationFrames[this.animationFrame % animationFrames.length];
      this.setBadge(frame.text, frame.color);
      this.animationFrame++;
    }, 200);
  }

  stopAnimation() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
      this.animationFrame = 0;
    }
  }

  setBadge(text, color) {
    try {
      chrome.action.setBadgeText({ text: String(text) });
      if (color) {
        chrome.action.setBadgeBackgroundColor({ color: color });
      }
    } catch (error) {
      this.logger.debug('Error setting badge:', error);
    }
  }

  clearBadge() {
    try {
      chrome.action.setBadgeText({ text: '' });
    } catch (error) {
      this.logger.debug('Error clearing badge:', error);
    }
  }

  getStatus() {
    return {
      status: this.currentStatus,
      pageNumber: this.pageNumber,
      isDownloading: this.isDownloading
    };
  }
}

export default IconStatusManager;
