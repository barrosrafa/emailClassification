'use client';

export default function Toolbar({
  totalCount = 0,
  selectedCount = 0,
  loading = false,
  bulkBusy = false,
  onRefresh,
  onDeleteSelected,
  onMarkSelectedAsRead,
  onMoveSelectedToArchive,
  onDeletePromotional,
  onTrainNow,
  onRunAutoClean
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-info">
        <div className="eyebrow">CAIXA DE ENTRADA INTELIGENTE</div>
        <h2>{totalCount} mensagens</h2>
        <p className="subline">
          Classificação híbrida (NLP + Metadados) · Destaque vermelho em propagandas e spam
        </p>
      </div>

      <div className="toolbar-actions">
        {selectedCount > 0 ? (
          <div className="batch-actions-group">
            <span className="batch-badge">{selectedCount} selecionado(s)</span>
            <button
              type="button"
              className="batch-btn"
              onClick={onMarkSelectedAsRead}
              disabled={bulkBusy}
            >
              Marcar como lidos
            </button>
            <button
              type="button"
              className="batch-btn"
              onClick={onMoveSelectedToArchive}
              disabled={bulkBusy}
            >
              Arquivar
            </button>
            <button
              type="button"
              className="batch-btn danger"
              onClick={onDeleteSelected}
              disabled={bulkBusy}
            >
              Excluir selecionados
            </button>
          </div>
        ) : (
          <div className="standard-actions-group">
            <button
              type="button"
              className="refresh"
              onClick={onRefresh}
              disabled={loading || bulkBusy}
            >
              {loading ? 'Atualizando…' : 'Atualizar'}
            </button>
            <button
              type="button"
              className="bulk-delete"
              onClick={onDeletePromotional}
              disabled={loading || bulkBusy}
            >
              {bulkBusy ? 'Processando…' : 'Excluir vermelhos'}
            </button>
            <button
              type="button"
              className="train"
              onClick={onTrainNow}
              disabled={bulkBusy}
            >
              Treinar agora
            </button>
            <button
              type="button"
              className="auto-clean-btn"
              onClick={onRunAutoClean}
              disabled={bulkBusy}
              title="Executar limpeza automática de remetentes frequentes de spam/promoção"
            >
              Auto-clean
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
