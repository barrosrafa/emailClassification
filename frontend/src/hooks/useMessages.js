'use client';

import { useState, useCallback, useMemo } from 'react';
import * as api from '../services/api';

export function useMessages(predictions = {}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextLink, setNextLink] = useState(null);
  const [folder, setFolder] = useState('inbox');
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const loadMessages = useCallback(async (targetFolder = folder) => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const res = await api.listMessages({ folder: targetFolder, top: 50 });
      const list = Array.isArray(res) ? res : (res.messages || []);
      setMessages(list);
      setNextLink(res.nextLink || null);
      setFolder(targetFolder);
      return list;
    } finally {
      setLoading(false);
    }
  }, [folder]);

  const loadMore = useCallback(async () => {
    if (!nextLink || loading) return [];
    setLoading(true);
    try {
      const res = await api.listMessages({ nextLink });
      const newItems = Array.isArray(res) ? res : (res.messages || []);
      setMessages((prev) => [...prev, ...newItems]);
      setNextLink(res.nextLink || null);
      return newItems;
    } finally {
      setLoading(false);
    }
  }, [nextLink, loading]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((checked, currentItems = []) => {
    if (!checked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentItems.map((m) => m.id)));
    }
  }, []);

  // Contagem por aba
  const counts = useMemo(() => {
    const c = { all: messages.length, principal: 0, promocoes: 0, redes_sociais: 0, unread: 0 };
    for (const m of messages) {
      if (!m.isRead) c.unread++;
      const pred = predictions[m.id];
      const category = pred?.category || 'principal';
      if (c[category] !== undefined) c[category]++;
    }
    return c;
  }, [messages, predictions]);

  // Filtragem e ordenação computada
  const filteredAndSorted = useMemo(() => {
    let result = [...messages];

    // 1. Filtro por aba
    if (activeTab === 'unread') {
      result = result.filter((m) => !m.isRead);
    } else if (activeTab !== 'all') {
      result = result.filter((m) => {
        const cat = predictions[m.id]?.category || 'principal';
        return cat === activeTab;
      });
    }

    // 2. Filtro por busca
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m) => {
        const subj = (m.subject || '').toLowerCase();
        const snd = (m.from?.emailAddress?.name || m.from?.emailAddress?.address || '').toLowerCase();
        const prev = (m.bodyPreview || '').toLowerCase();
        return subj.includes(q) || snd.includes(q) || prev.includes(q);
      });
    }

    // 3. Ordenação
    result.sort((a, b) => {
      if (sortBy === 'date-asc') {
        return new Date(a.receivedDateTime) - new Date(b.receivedDateTime);
      }
      if (sortBy === 'sender-asc') {
        const sA = (a.from?.emailAddress?.name || a.from?.emailAddress?.address || '').toLowerCase();
        const sB = (b.from?.emailAddress?.name || b.from?.emailAddress?.address || '').toLowerCase();
        return sA.localeCompare(sB);
      }
      if (sortBy === 'sender-desc') {
        const sA = (a.from?.emailAddress?.name || a.from?.emailAddress?.address || '').toLowerCase();
        const sB = (b.from?.emailAddress?.name || b.from?.emailAddress?.address || '').toLowerCase();
        return sB.localeCompare(sA);
      }
      // date-desc default
      return new Date(b.receivedDateTime) - new Date(a.receivedDateTime);
    });

    return result;
  }, [messages, activeTab, searchQuery, sortBy, predictions]);

  return {
    messages,
    setMessages,
    loading,
    nextLink,
    folder,
    setFolder,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    selectedIds,
    setSelectedIds,
    loadMessages,
    loadMore,
    toggleSelect,
    selectAll,
    counts,
    filteredMessages: filteredAndSorted
  };
}
