export class ToastNotifier {
  constructor() {
    this.container = null;
    this.toasts = [];
    this.maxToasts = 5;
    this.styleInjected = false;
  }

  injectStyles() {
    if (this.styleInjected) return;
    
    try {
      const existingStyle = document.getElementById('stepgallery-toast-styles');
      if (existingStyle) {
        this.styleInjected = true;
        return;
      }
      
      const style = document.createElement('style');
      style.id = 'stepgallery-toast-styles';
      style.textContent = `
        @keyframes stepgallerySlideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      
      if (document.head) {
        document.head.appendChild(style);
      } else if (document.documentElement) {
        document.documentElement.appendChild(style);
      }
      
      this.styleInjected = true;
    } catch (error) {
      this.styleInjected = true;
    }
  }

  initialize() {
    if (this.container) return;

    // Ensure document.body exists
    if (!document.body) {
      console.warn('ToastNotifier: document.body not available');
      return;
    }

    this.injectStyles();

    const existingContainer = document.getElementById('toast-container');
    if (existingContainer) {
      this.container = existingContainer;
      this.container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 400px;
      `;
    } else {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 400px;
      `;
      document.body.appendChild(this.container);
    }
  }

  show(message, type = 'info', duration = 5000) {
    if (!this.container) {
      this.initialize();
    }

    while (this.toasts.length >= this.maxToasts) {
      const oldest = this.toasts.shift();
      oldest.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const colors = {
      success: '#4CAF50',
      error: '#f44336',
      warning: '#ff9800',
      info: '#2196F3'
    };

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ⓘ'
    };

    toast.style.cssText = `
      background: white;
      border-left: 4px solid ${colors[type]};
      padding: 16px;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: flex-start;
      gap: 12px;
      animation: stepgallerySlideIn 0.3s ease-out;
      cursor: pointer;
      transition: opacity 0.3s ease;
    `;

    const icon = document.createElement('span');
    icon.style.cssText = `
      font-size: 20px;
      color: ${colors[type]};
      font-weight: bold;
      flex-shrink: 0;
    `;
    icon.textContent = icons[type];

    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      font-size: 14px;
      line-height: 1.4;
      color: #333;
    `;
    content.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
      padding: 0;
      font-size: 18px;
      line-height: 1;
      flex-shrink: 0;
    `;
    closeBtn.textContent = '×';
    closeBtn.onclick = () => this.dismiss(toast);

    toast.appendChild(icon);
    toast.appendChild(content);
    toast.appendChild(closeBtn);
    
    toast.onclick = () => this.dismiss(toast);

    this.container.appendChild(toast);
    this.toasts.push(toast);

    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }

    return toast;
  }

  dismiss(toast) {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
      const index = this.toasts.indexOf(toast);
      if (index > -1) {
        this.toasts.splice(index, 1);
      }
    }, 300);
  }

  success(message, duration = 5000) {
    return this.show(message, 'success', duration);
  }

  error(message, duration = 7000) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration = 6000) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration = 5000) {
    return this.show(message, 'info', duration);
  }

  clear() {
    this.toasts.forEach(toast => toast.remove());
    this.toasts = [];
  }
}

export default ToastNotifier;
