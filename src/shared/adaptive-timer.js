import { Logger } from './logger.js';

export class AdaptiveTimer {
  constructor(options = {}) {
    this.logger = new Logger('AdaptiveTimer');
    this.minDelay = options.minDelay || 1000;
    this.maxDelay = options.maxDelay || 5000;
    this.defaultDelay = options.defaultDelay || 2000;
    this.multiplier = options.multiplier || 1.5;
    this.historySize = options.historySize || 5;
    
    this.responseTimes = [];
  }

  recordResponseTime(duration) {
    if (duration < 0) return;

    this.responseTimes.push(duration);
    
    if (this.responseTimes.length > this.historySize) {
      this.responseTimes.shift();
    }

    this.logger.debug(`Recorded response time: ${duration}ms (avg: ${this.getAverageResponseTime()}ms)`);
  }

  getAverageResponseTime() {
    if (this.responseTimes.length === 0) {
      return null;
    }

    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.responseTimes.length);
  }

  getOptimalDelay() {
    const avgResponseTime = this.getAverageResponseTime();
    
    if (avgResponseTime === null) {
      return this.defaultDelay;
    }

    const calculatedDelay = Math.round(avgResponseTime * this.multiplier);
    
    const optimalDelay = Math.max(
      this.minDelay,
      Math.min(this.maxDelay, calculatedDelay)
    );

    this.logger.debug(`Optimal delay: ${optimalDelay}ms (avg response: ${avgResponseTime}ms)`);
    
    return optimalDelay;
  }

  reset() {
    this.responseTimes = [];
    this.logger.log('Response times reset');
  }

  getStats() {
    return {
      averageResponseTime: this.getAverageResponseTime(),
      optimalDelay: this.getOptimalDelay(),
      sampleCount: this.responseTimes.length,
      responseTimes: [...this.responseTimes]
    };
  }
}

export default AdaptiveTimer;
