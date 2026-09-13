'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../src/hooks/useAuth';
import { useClassification } from '../src/hooks/useClassification';
import { useMessages } from '../src/hooks/useMessages';
import * as api from '../src/services/api';

import AuthPanel from '../src/components/AuthPanel';
import Toolbar from '../src/components/Toolbar';
import FilterBar from '../src/components/FilterBar';
import SearchBar from '../src/components/SearchBar';
import MailList from '../src/components/MailList';
import MailViewer from '../src/components/MailViewer';
import Toast from '../src/components/Toast';

export default function Page() {
  const { auth, loading: authLoading, checkAuth, logout } = useAuth();
  const {
    predictions,
    learningStatus,
    classifying,
    classifyBatch,
    learn,
    trainNow,
    fetchStatus
  } = useClassification();

  const {
    messages,
    setMessages,
    loading: messagesLoading,
    nextLink,
    folder,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    selectedIds,
    loadMessages,
    loadMore,
    toggleSelect,
    selectAll,
    counts,
    filteredMessages
  } = useMessages(predictions);

  const [selectedMessage, setSelectedMessage] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState(null);

  // Carrega e classifica mensagens ao autenticar
  const loadData = useCallback(async () => {
    try {
      const items = await loadMessages('inbox');
      await classifyBatch(items);
      await fetchStatus();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }, [loadMessages, classifyBatch, fetchStatus]);

  useEffect(() => {
    if (auth?.authenticated) {
      loadData();
    }
  }, [auth?.authenticated, loadData]);

  // Carregar mais mensagens da paginação
  const handleLoadMore = async () => {
    try {
      const newItems = await loadMore();
      if (newItems.length) {
        await classifyBatch(newItems);
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  };

  // Abrir e-mail no detalhe
  const handleOpenMessage = async (id) => {
    setDetailLoading(true);
    try {
      const full = await api.getMessage(id);
      setSelectedMessage({
        ...full,
        classification: predictions[id] || null
      });
      // Marca como lido automaticamente se estiver não lido
      if (!full.isRead) {
        await api.markAsRead(id, true);
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, isRead: true } : m))
        );
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setDetailLoading(false);
    }
  };

  // Ensinar nova categoria (Feedback Bidirecional)
  const handleTeach = async (message, label) => {
    try {
      const result = await learn({ message, label });
      if (selectedMessage?.id === message.id) {
        setSelectedMessage((prev) =>
          prev ? { ...prev, classification: { category: label, confidence: 1.0, details: [] } } : null
        );
      }
      setToast({
        type: 'notice',
        message: `Aprendido: marcado como "${label}". ${result.samples} exemplos no modelo.`
      });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  };

  // Exclusão permanente individual
  const handleRemove = async (id) => {
    if (!window.confirm('Excluir este e-mail permanentemente?')) return;
    try {
      await api.deleteMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (selectedMessage?.id === id) setSelectedMessage(null);
      setToast({ type: 'notice', message: 'E-mail excluído com sucesso.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  };

  // Mover para pasta (com suporte a Desfazer)
  const handleMove = async (id, destinationId) => {
    try {
      await api.moveMessage(id, destinationId);
      const movedItem = messages.find((m) => m.id === id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (selectedMessage?.id === id) setSelectedMessage(null);

      const folderName = destinationId === 'junkemail' ? 'Lixo' : 'Arquivo';
      setToast({
        type: 'notice',
        message: `E-mail movido para ${folderName}.`,
        duration: 10000,
        undoAction: async () => {
          // Desfazer: mover de volta para a Inbox
          await api.moveMessage(id, 'inbox');
          if (movedItem) setMessages((prev) => [movedItem, ...prev]);
          setToast({ type: 'notice', message: 'Ação desfeita: e-mail retornado para a Caixa de Entrada.' });
        }
      });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  };

  // Alternar lido/não lido
  const handleToggleRead = async (id, isRead) => {
    try {
      await api.markAsRead(id, isRead);
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isRead } : m))
      );
      if (selectedMessage?.id === id) {
        setSelectedMessage((prev) => (prev ? { ...prev, isRead } : null));
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  };

  // Ações em Lote: Excluir Selecionados
  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(`Excluir permanentemente ${ids.length} mensagem(ns) selecionada(s)?`)) return;

    setActionBusy(true);
    try {
      await api.batchDeleteMessages(ids);
      const idSet = new Set(ids);
      setMessages((prev) => prev.filter((m) => !idSet.has(m.id)));
      if (selectedMessage && idSet.has(selectedMessage.id)) setSelectedMessage(null);
      selectAll(false);
      setToast({ type: 'notice', message: `${ids.length} mensagem(ns) excluída(s) em lote.` });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  // Ações em Lote: Marcar como lidos
  const handleBatchMarkAsRead = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setActionBusy(true);
    try {
      await Promise.all(ids.map((id) => api.markAsRead(id, true)));
      const idSet = new Set(ids);
      setMessages((prev) =>
        prev.map((m) => (idSet.has(m.id) ? { ...m, isRead: true } : m))
      );
      selectAll(false);
      setToast({ type: 'notice', message: `${ids.length} mensagem(ns) marcada(s) como lidas.` });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  // Ações em Lote: Mover para Arquivo
  const handleBatchMoveToArchive = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setActionBusy(true);
    try {
      await Promise.all(ids.map((id) => api.moveMessage(id, 'archive')));
      const idSet = new Set(ids);
      setMessages((prev) => prev.filter((m) => !idSet.has(m.id)));
      if (selectedMessage && idSet.has(selectedMessage.id)) setSelectedMessage(null);
      selectAll(false);
      setToast({ type: 'notice', message: `${ids.length} mensagem(ns) arquivada(s).` });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  // Excluir todas as mensagens vermelhas (spam / promocoes)
  const handleDeletePromotional = async () => {
    const redMessages = messages.filter((m) => {
      const cat = predictions[m.id]?.category;
      return cat === 'spam' || cat === 'promocoes';
    });

    if (!redMessages.length) {
      setToast({ type: 'notice', message: 'Nenhuma mensagem vermelha encontrada.' });
      return;
    }

    if (!window.confirm(`Excluir permanentemente ${redMessages.length} mensagem(ns) classificadas como propaganda ou spam?`)) return;

    setActionBusy(true);
    try {
      const res = await api.deletePromotionalMessages();
      const deletedIds = new Set(res.ids || redMessages.map((m) => m.id));
      setMessages((prev) => prev.filter((m) => !deletedIds.has(m.id)));
      if (selectedMessage && deletedIds.has(selectedMessage.id)) setSelectedMessage(null);
      setToast({ type: 'notice', message: `${res.deleted} mensagem(ns) vermelha(s) excluída(s).` });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  // Executar treino manual imediato
  const handleTrainNow = async () => {
    setActionBusy(true);
    try {
      setToast({ type: 'notice', message: 'Treinando com feedbacks confirmados…' });
      const res = await trainNow();
      setToast({ type: 'notice', message: `Treinamento concluído: ${res.samples || 0} exemplos usados.` });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  // Executar limpeza automática (Auto-clean)
  const handleRunAutoClean = async () => {
    setActionBusy(true);
    try {
      const res = await api.runAutoClean({ dryRun: false, action: 'move', minDaysOld: 7 });
      if (res.processed > 0) {
        setToast({ type: 'notice', message: `Auto-clean: ${res.processed} mensagem(ns) antiga(s) arquivada(s).` });
        loadData();
      } else {
        setToast({ type: 'notice', message: 'Auto-clean: Nenhuma mensagem promocional com mais de 7 dias encontrada.' });
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  if (authLoading) return <div className="center">Carregando…</div>;

  if (!auth?.authenticated) {
    return (
      <main className="landing">
        <div className="brand">
          mail<span>desk</span>
        </div>
        <AuthPanel onAuthenticated={checkAuth} />
      </main>
    );
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          mail<span>desk</span>
        </div>
        <div className="account">
          <span>{auth.account}</span>
          <button type="button" onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      {/* Barra de Ações Principais */}
      <Toolbar
        totalCount={messages.length}
        selectedCount={selectedIds.size}
        loading={messagesLoading || classifying}
        bulkBusy={actionBusy}
        onRefresh={loadData}
        onDeleteSelected={handleBatchDelete}
        onMarkSelectedAsRead={handleBatchMarkAsRead}
        onMoveSelectedToArchive={handleBatchMoveToArchive}
        onDeletePromotional={handleDeletePromotional}
        onTrainNow={handleTrainNow}
        onRunAutoClean={handleRunAutoClean}
      />

      {/* Controles: Abas de Categoria e Pesquisa/Ordenação */}
      <div className="controls-bar">
        <FilterBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          counts={counts}
        />
        <SearchBar
          onSearch={setSearchQuery}
          onSort={setSortBy}
          currentSort={sortBy}
        />
      </div>

      {/* Notificação Toast */}
      {toast && (
        <Toast
          toast={toast}
          onDismiss={() => setToast(null)}
          onUndo={(t) => {
            if (t.undoAction) t.undoAction();
            setToast(null);
          }}
        />
      )}

      {/* Conteúdo: Lista à esquerda, Leitor à direita */}
      <div className="content">
        <aside>
          <MailList
            messages={filteredMessages}
            predictions={predictions}
            selectedIds={selectedIds}
            detailSelectedId={selectedMessage?.id}
            onToggleSelect={toggleSelect}
            onSelectAll={(checked) => selectAll(checked, filteredMessages)}
            onOpen={handleOpenMessage}
            onQuickTeach={(msg, label) => handleTeach(msg, label)}
            onRemove={handleRemove}
            loading={messagesLoading || classifying}
            nextLink={nextLink}
            onLoadMore={handleLoadMore}
          />
        </aside>

        <MailViewer
          message={selectedMessage}
          prediction={selectedMessage ? predictions[selectedMessage.id] : null}
          onTeach={handleTeach}
          onRemove={handleRemove}
          onMove={handleMove}
          onToggleRead={handleToggleRead}
          loadingAction={actionBusy || detailLoading}
        />
      </div>

      <footer>
        <div>
          {learningStatus?.feedback || 0} feedbacks confirmados · aprendizado diário ativo
        </div>
        <div>
          {classifying ? '⚡ Classificação híbrida em execução…' : 'Classificador pronto'}
        </div>
      </footer>
    </div>
  );
}
