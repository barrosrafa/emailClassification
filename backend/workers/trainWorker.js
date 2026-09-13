const { parentPort, workerData } = require('worker_threads');
const service = require('../services/classifierService');

(async () => {
  try {
    const result = await service.retrain(workerData?.epochs || 10, workerData?.extra || []);
    parentPort?.postMessage({ success: true, ...result, trainedAt: new Date().toISOString() });
  } catch (error) {
    parentPort?.postMessage({ error: error.message });
  }
})();
