const { Worker } = require('worker_threads');
const EventEmitter = require('events');
const path = require('path');

class TrainingQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.processing = false;
    this.debounceTimer = null;
    this.DEBOUNCE_MS = Number(process.env.TRAINING_DEBOUNCE_MS || 15000); // 15 segundos
    this.workerPath = path.resolve(__dirname, '../workers/trainWorker.js');
  }

  enqueue(feedbackItem) {
    this.queue.push(feedbackItem);
    this.scheduleTraining();
    return { queued: true, position: this.queue.length };
  }

  scheduleTraining(delay = this.DEBOUNCE_MS) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.processQueue().catch((err) => this.emit('error', err));
    }, delay);
  }

  async processQueue(epochs = 10) {
    if (this.processing) {
      this.scheduleTraining(5000);
      return { status: 'waiting_current_job' };
    }

    this.processing = true;
    const batch = this.queue.splice(0, this.queue.length);

    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(this.workerPath, {
          workerData: { extra: batch, epochs }
        });

        worker.on('message', (result) => {
          this.processing = false;
          if (result.error) {
            this.emit('error', new Error(result.error));
            reject(new Error(result.error));
          } else {
            this.emit('trained', result);
            resolve(result);
          }
          if (this.queue.length > 0) this.scheduleTraining();
        });

        worker.on('error', (err) => {
          this.processing = false;
          this.emit('error', err);
          reject(err);
          if (this.queue.length > 0) this.scheduleTraining();
        });

        worker.on('exit', (code) => {
          this.processing = false;
          if (code !== 0) {
            const err = new Error(`Worker encerrou com código de saída ${code}`);
            this.emit('error', err);
            reject(err);
          }
        });
      } catch (err) {
        this.processing = false;
        this.emit('error', err);
        reject(err);
      }
    });
  }

  status() {
    return {
      processing: this.processing,
      pendingQueue: this.queue.length,
      debounceMs: this.DEBOUNCE_MS
    };
  }
}

module.exports = new TrainingQueue();
