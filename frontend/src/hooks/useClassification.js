'use client';

import { useState, useCallback } from 'react';
import * as api from '../services/api';

export function useClassification() {
  const [predictions, setPredictions] = useState({});
  const [learningStatus, setLearningStatus] = useState(null);
  const [classifying, setClassifying] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const st = await api.learningStatus();
      setLearningStatus(st);
    } catch (err) {
      console.warn('Falha ao buscar status de aprendizado:', err);
    }
  }, []);

  const classifyBatch = useCallback(async (messages = []) => {
    if (!messages.length) return;
    setClassifying(true);
    try {
      const payload = messages.map((m) => ({
        id: m.id,
        text: `${m.subject || ''}\n${m.bodyPreview || ''}`,
        subject: m.subject,
        bodyPreview: m.bodyPreview,
        from: m.from,
        internetMessageHeaders: m.internetMessageHeaders
      }));

      const results = await api.classifyBatch(payload);
      setPredictions((prev) => ({ ...prev, ...results }));
    } catch (err) {
      console.warn('Batch classification falhou, tentando fallback individual:', err.message);
      const entries = await Promise.all(
        messages.map(async (m) => {
          try {
            const res = await api.classify({
              text: `${m.subject || ''}\n${m.bodyPreview || ''}`,
              from: m.from,
              internetMessageHeaders: m.internetMessageHeaders
            });
            return [m.id, res];
          } catch {
            return [m.id, { category: 'principal', confidence: 0.5, details: [] }];
          }
        })
      );
      setPredictions((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    } finally {
      setClassifying(false);
    }
  }, []);

  const learn = useCallback(async ({ message, label }) => {
    const text = `${message.subject || ''}\n${message.bodyPreview || ''}\n${message.body?.content || ''}`;
    const sender = message.from?.emailAddress?.address || '';
    const res = await api.learn({
      messageId: message.id,
      text,
      label,
      sender
    });

    setPredictions((prev) => ({
      ...prev,
      [message.id]: { category: label, confidence: 1.0, details: [] }
    }));
    await fetchStatus();
    return res;
  }, [fetchStatus]);

  const trainNow = useCallback(async () => {
    const res = await api.runLearning();
    await fetchStatus();
    return res;
  }, [fetchStatus]);

  return {
    predictions,
    setPredictions,
    learningStatus,
    classifying,
    classifyBatch,
    learn,
    trainNow,
    fetchStatus
  };
}
