# SSD — Software Design Document

## Sistema de Classificação Inteligente de E-mails

**Repositório base:** [barrosrafa/emailClassification](https://github.com/barrosrafa/emailClassification)
**Versão do documento:** 1.0
**Data:** 13 de setembro de 2026
**Autor:** Engenharia de Machine Learning

---

## 1. Contexto e Objetivo

O projeto atual é um MVP funcional que integra Microsoft Graph, autenticação via Device Code Flow (MSAL Node) e classificação de e-mails com TensorFlow.js. O sistema classifica mensagens em quatro categorias (`principal`, `spam`, `promocoes`, `redes_sociais`) e permite que o usuário confirme rótulos para retreinamento incremental.

Este SSD descreve a evolução do sistema para um produto robusto, multi-usuário e pronto para produção, endereçando as limitações identificadas no arquivo `melhorias.txt`. O escopo abrange melhorias em inteligência/classificação, gestão de e-mails, frontend/UX, arquitetura/segurança, e qualidade/testes.

---

## 2. Arquitetura Atual (As-Is)

### 2.1 Componentes Principais

| Componente | Tecnologia | Responsabilidade |
|---|---|---|
| Frontend | Next.js 15, React 19 | Interface, estado da tela, chamadas HTTP |
| Backend | Node.js, Express 4 | API REST, autenticação, integração Graph, orquestração ML |
| Autenticação | `@azure/msal-node` | Device Code Flow, renovação silenciosa |
| E-mail | Microsoft Graph SDK | Listagem, leitura, exclusão de mensagens |
| ML | `@tensorflow/tfjs-node` | Treinamento, inferência |
| Persistência | JSON + filesystem | `feedback.json`, `modelo-email/` |

### 2.2 Fluxo Principal

1. Usuário conecta conta Microsoft via Device Code Flow.
2. Backend obtém mensagens da Inbox via Microsoft Graph.
3. Frontend solicita classificação para cada mensagem.
4. Backend normaliza texto, tokeniza e executa inferência.
5. Mensagens classificadas como `spam` ou `promocoes` recebem destaque vermelho.
6. Usuário pode confirmar rótulo, excluir mensagem ou excluir em massa.
7. Feedback confirmado é salvo e o modelo é retreinado.

### 2.3 Limitações Identificadas

- **Vocabulário estático** de ~87 palavras; palavras fora dele viram `<UNKNOWN>`.
- **Modelo analisa apenas texto** (assunto + corpo), ignorando metadados ricos (remetente, headers, links).
- **Sessão em memória** — reiniciar o backend exige nova autenticação.
- **Dados globais** — `feedback.json` e tokens são únicos e compartilhados entre usuários.
- **Retreinamento síncrono** no mesmo processo da API HTTP.
- **Frontend monolítico** — `page.jsx` concentra toda a interface.
- **Exclusão permanente** sem opções de mover para pastas ou desfazer.
- **Sem paginação** — apenas as 100 primeiras mensagens da Inbox.
- **Sem testes automatizados** nem containerização.

---

## 3. Melhorias Propostas (To-Be)

### 3.1 Inteligência & Classificação

#### 3.1.1 Classificador Híbrido (Metadados + NLP)

**Problema:** O modelo atual analisa apenas o texto simples (assunto + corpo). Na prática, 80% do sinal de spam/promoção está nos metadados.

**Solução:** Implementar um pipeline de classificação em duas camadas:

1. **Camada de regras heurísticas** (executada antes do modelo NLP):
   - **Remetente/Domínio:** E-mails de `@*.mailchimp.com`, `@news.*`, `no-reply@` são quase sempre newsletters/promoções.
   - **Header `List-Unsubscribe`:** Presença deste header indica marketing/newsletter.
   - **Proporção de links e imagens externas:** E-mails promocionais tipicamente contêm múltiplos links e imagens externas.
   - **Headers `X-Mailer`, `Precedence`:** Valores como `bulk`, `list` indicam envio em massa.

2. **Camada NLP** (modelo TensorFlow.js existente) para classificar o conteúdo textual.

3. **Fusão de resultados:** Combinar scores das duas camadas com pesos configuráveis (ex: 70% NLP, 30% heurística).

**Impacto técnico:**
- Novo módulo `backend/services/metadataAnalyzer.js` que extrai features do objeto de mensagem do Graph (incluindo headers estendidos).
- Modificar `graphService.listMessages` para incluir `internetMessageHeaders` na seleção.
- O endpoint `/api/classify` passa a aceitar o objeto completo da mensagem (não apenas texto).

**Especificação de implementação:**

```javascript
// metadataAnalyzer.js
const RULES = {
  senderPatterns: [
    { pattern: /@.*mailchimp\.com$/i, category: 'promocoes', weight: 0.9 },
    { pattern: /@news\./i, category: 'promocoes', weight: 0.85 },
    { pattern: /no-?reply@/i, category: 'promocoes', weight: 0.6 },
  ],
  headers: [
    { name: 'list-unsubscribe', category: 'promocoes', weight: 0.8 },
    { name: 'precedence', value: /bulk|list/i, category: 'promocoes', weight: 0.7 },
  ],
};

function analyzeMetadata(message) {
  const signals = [];
  // Avalia remetente
  const sender = message.from?.emailAddress?.address || '';
  for (const rule of RULES.senderPatterns) {
    if (rule.pattern.test(sender)) {
      signals.push({ category: rule.category, weight: rule.weight, source: 'sender' });
    }
  }
  // Avalia headers
  const headers = message.internetMessageHeaders || [];
  for (const rule of RULES.headers) {
    const header = headers.find(h => h.name.toLowerCase() === rule.name);
    if (header && (!rule.value || rule.value.test(header.value))) {
      signals.push({ category: rule.category, weight: rule.weight, source: 'header' });
    }
  }
  // Contagem de links
  const linkCount = (message.body?.content || '').match(/<a\s/gi)?.length || 0;
  if (linkCount > 10) {
    signals.push({ category: 'promocoes', weight: 0.5, source: 'link-count' });
  }
  return signals;
}
```

#### 3.1.2 Vocabulário Dinâmico e Abordagem NLP Alternativa

**Problema:** O vocabulário atual possui apenas ~87 palavras estáticas. Qualquer palavra fora dele vira `<UNKNOWN>`, causando perda massiva de contexto.

**Solução:** Oferecer duas abordagens configuráveis:

**Opção A (Leve/Local) — TF-IDF + N-grams:**

Substituir o vocabulário fixo por uma abordagem que aprende dinamicamente a partir dos dados:

- **TF-IDF:** Calcular a importância de cada palavra com base na frequência no documento e no corpus. Implementação via biblioteca `natural` (Node.js) ou microserviço Python com `scikit-learn`.
- **N-grams (1-3):** Capturar sequências de palavras como "não perca", "clique aqui", "atualize seus dados".
- **Modelo:** Regressão Logística ou Naive Bayes (leve, rápido, interpretável).

**Opção B (Moderna com LLM) — Inferência via LLM:**

Oferecer opção de usar uma LLM leve para classificação de alta acurácia:

- **Local:** Modelos via Ollama (phi-3, llama3) — sem enviar dados para terceiros.
- **API:** Google Gemini, OpenAI — para máxima acurácia.
- **Vantagens:** Classificação com 99% de acurácia, geração de resumo de 1 linha, sugestão de resposta rápida.
- **Desvantagens:** Custo por requisição, latência maior, dependência de conectividade.

**Especificação de implementação:**

```javascript
// classifierStrategy.js — Pattern Strategy
class ClassifierStrategy {
  async classify(message) { throw new Error('Not implemented'); }
}

class TfIdfStrategy extends ClassifierStrategy {
  async classify(message) { /* TF-IDF + Logistic Regression */ }
}

class LlmStrategy extends ClassifierStrategy {
  async classify(message) { /* Ollama ou API externa */ }
}

class HybridStrategy extends ClassifierStrategy {
  constructor() {
    this.metadataAnalyzer = new MetadataAnalyzer();
    this.nlpClassifier = new TensorFlowClassifier();
  }
  async classify(message) {
    const metadataSignals = this.metadataAnalyzer.analyze(message);
    const nlpResult = await this.nlpClassifier.classify(message.text);
    return this.fuseResults(metadataSignals, nlpResult);
  }
}
```

#### 3.1.3 Feedback Bidirecional (Correção de Falsos Positivos)

**Problema:** O usuário só pode marcar "É propaganda". Se um e-mail importante for classificado erroneamente como spam/promoção, não há botão para "Não é spam / Mover para Principal".

**Solução:** Permitir reclassificação para qualquer uma das quatro categorias.

**Especificação de implementação:**

- **Frontend:** Substituir o botão único "É propaganda" por um seletor de categoria (dropdown ou conjunto de botões).
- **Backend:** O endpoint `/api/learn` já aceita `label` genérico. A validação deve garantir que `label` seja uma das categorias válidas.
- **UI:** Exibir as quatro opções com ícones distintos:
  - 🏠 Principal
  - ⚠️ Spam
  - 🏷️ Promoções
  - 📱 Redes Sociais

```jsx
// FeedbackSelector.jsx
function FeedbackSelector({ currentLabel, onSelect }) {
  const options = [
    { value: 'principal', label: 'Principal', icon: '🏠' },
    { value: 'spam', label: 'Spam', icon: '⚠️' },
    { value: 'promocoes', label: 'Promoções', icon: '🏷️' },
    { value: 'redes_sociais', label: 'Redes Sociais', icon: '📱' },
  ];
  return (
    <div className="feedback-selector">
      {options.map(opt => (
        <button
          key={opt.value}
          className={currentLabel === opt.value ? 'active' : ''}
          onClick={() => onSelect(opt.value)}
        >
          {opt.icon} {opt.label}
        </button>
      ))}
    </div>
  );
}
```

---

### 3.2 Gestão de E-mails & Microsoft Graph

#### 3.2.1 Mover para Pastas em vez de Excluir Permanentemente

**Problema:** A exclusão direta permanente pode assustar o usuário e não oferece reversibilidade.

**Solução:** Adicionar ações de movimentação:

- **Mover para "Lixo Eletrônico":** Usar `POST /me/messages/{id}/move` com `destinationId: 'junkemail'`.
- **Mover para "Arquivo":** `destinationId: 'archive'`.
- **Mover para pasta personalizada:** Permitir que o usuário crie/use pastas.
- **Marcar como lido/não lido:** `PATCH /me/messages/{id}` com `{ isRead: true/false }`.
- **Desfazer (Undo):** Após uma ação, exibir um toast com botão "Desfazer" por 10 segundos. Implementar armazenando a ação e revertendo via API.

**Especificação de implementação:**

```javascript
// graphService.js — novas funções
async function moveMessage(messageId, destinationId) {
  const client = await getGraphClient();
  return client.api(`/me/messages/${encodeURIComponent(messageId)}/move`)
    .post({ destinationId });
}

async function markAsRead(messageId, isRead) {
  const client = await getGraphClient();
  return client.api(`/me/messages/${encodeURIComponent(messageId)}`)
    .patch({ isRead });
}

async function listFolders() {
  const client = await getGraphClient();
  const response = await client.api('/me/mailFolders')
    .select('id,displayName,parentFolderId')
    .get();
  return response.value || [];
}
```

#### 3.2.2 Paginação e Acesso a Pastas

**Problema:** A API busca apenas os últimos 50-100 e-mails da Inbox.

**Solução:**

- **Paginação contínua:** Usar `@odata.nextLink` do Graph para carregar mais mensagens sob demanda (scroll infinito ou botão "Carregar mais").
- **Navegação entre pastas:** Permitir alternar entre `Inbox`, `JunkEmail`, `Archive`, `SentItems`, `DeletedItems`.
- **Cache de paginação:** Armazenar o `nextLink` no frontend para requisições subsequentes.

**Especificação de implementação:**

```javascript
// graphService.js
async function listMessages({ folder = 'inbox', top = 50, nextLink = null } = {}) {
  const client = await getGraphClient();
  let request;
  if (nextLink) {
    request = client.api(nextLink);
  } else {
    request = client.api(`/me/mailFolders/${folder}/messages`)
      .select('id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments,internetMessageHeaders')
      .top(Math.min(Number(top) || 50, 100))
      .orderby('receivedDateTime desc');
  }
  const response = await request.get();
  return {
    messages: response.value || [],
    nextLink: response['@odata.nextLink'] || null,
  };
}
```

#### 3.2.3 Regras Automáticas e Agendamentos (Auto-Clean)

**Problema:** Não há automação para arquivar/excluir e-mails de remetentes já confirmados como promoções.

**Solução:** Implementar um job em segundo plano que:

1. Roda a cada 6 ou 12 horas (configurável via `AUTO_CLEAN_INTERVAL_MS`).
2. Identifica e-mails de remetentes já confirmados como `promocoes` no feedback.
3. Aplica a ação configurada: **mover para pasta "Promoções"**, **arquivar** ou **excluir**.
4. Respeita um período de carência (ex: 7 dias após recebimento).

**Especificação de implementação:**

```javascript
// autoCleanService.js
const CONFIRMED_PROMOTIONAL_SENDERS = new Set(); // Carregado do feedback

async function runAutoClean() {
  const confirmedSenders = await loadConfirmedPromotionalSenders();
  const messages = await graph.listMessages({ folder: 'inbox', top: 100 });

  const candidates = messages.messages.filter(msg => {
    const sender = msg.from?.emailAddress?.address || '';
    const receivedAt = new Date(msg.receivedDateTime);
    const daysOld = (Date.now() - receivedAt.getTime()) / (1000 * 60 * 60 * 24);
    return confirmedSenders.has(sender) && daysOld >= 7;
  });

  if (process.env.AUTO_CLEAN_DRY_RUN === 'true') {
    return { candidates: candidates.length, action: 'dry-run' };
  }

  const action = process.env.AUTO_CLEAN_ACTION || 'move';
  for (const msg of candidates) {
    if (action === 'move') {
      await graph.moveMessage(msg.id, 'archive');
    } else if (action === 'delete') {
      await graph.deleteMessage(msg.id);
    }
  }
  return { processed: candidates.length, action };
}

// Agendamento
const interval = Number(process.env.AUTO_CLEAN_INTERVAL_MS || 6 * 60 * 60 * 1000);
setInterval(() => runAutoClean().catch(console.error), interval).unref();
```

#### 3.2.4 Filtro em Lote com Batch Request do Graph

**Problema:** O endpoint `delete-promotional` dispara múltiplas chamadas DELETE individuais, aumentando latência e risco de rate limiting (HTTP 429).

**Solução:** Usar o endpoint `$batch` do Microsoft Graph para agrupar até 20 requisições em uma única chamada HTTP.

**Especificação de implementação:**

```javascript
// graphService.js
async function batchDeleteMessages(messageIds) {
  const client = await getGraphClient();
  const requests = messageIds.map((id, index) => ({
    id: String(index + 1),
    method: 'DELETE',
    url: `/me/messages/${encodeURIComponent(id)}`,
  }));

  // Graph aceita até 20 requisições por batch
  const batches = [];
  for (let i = 0; i < requests.length; i += 20) {
    batches.push(requests.slice(i, i + 20));
  }

  const results = [];
  for (const batch of batches) {
    const response = await client.api('/$batch').post({ requests: batch });
    results.push(...response.responses);
  }
  return results;
}
```

---

### 3.3 Frontend & Experiência do Usuário

#### 3.3.1 Filtros Rápidos e Abas de Categorias

**Solução:** Abas no topo estilo Gmail/Outlook:

- **Todas**
- **Principais** (categoria `principal`)
- **Promoções** (categoria `promocoes`)
- **Redes Sociais** (categoria `redes_sociais`)
- **Não Lidos**

Cada aba filtra a lista de mensagens com base na classificação do modelo ou no estado `isRead`.

**Especificação de implementação:**

```jsx
// FilterBar.jsx
function FilterBar({ activeTab, onTabChange, counts }) {
  const tabs = [
    { id: 'all', label: 'Todas', count: counts.all },
    { id: 'principal', label: 'Principais', count: counts.principal },
    { id: 'promocoes', label: 'Promoções', count: counts.promocoes },
    { id: 'redes_sociais', label: 'Redes Sociais', count: counts.redes_sociais },
    { id: 'unread', label: 'Não Lidos', count: counts.unread },
  ];
  return (
    <nav className="filter-bar">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={activeTab === tab.id ? 'active' : ''}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
          {tab.count > 0 && <span className="badge">{tab.count}</span>}
        </button>
      ))}
    </nav>
  );
}
```

#### 3.3.2 Barra de Pesquisa e Ordenação

**Solução:**

- **Pesquisa instantânea:** Filtrar a lista por texto, remetente ou intervalo de datas.
- **Ordenação:** Por data (mais recente/mais antigo), por remetente (A-Z), por relevância.

**Especificação de implementação:**

```jsx
// SearchBar.jsx
function SearchBar({ onSearch, onSort }) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');

  const debouncedSearch = useMemo(
    () => debounce((q) => onSearch(q), 300),
    [onSearch]
  );

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Pesquisar por assunto, remetente ou texto..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); debouncedSearch(e.target.value); }}
      />
      <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); onSort(e.target.value); }}>
        <option value="date-desc">Mais recentes</option>
        <option value="date-asc">Mais antigos</option>
        <option value="sender-asc">Remetente (A-Z)</option>
        <option value="sender-desc">Remetente (Z-A)</option>
      </select>
    </div>
  );
}
```

#### 3.3.3 Visualização e Ações em Lote (Checkboxes)

**Solução:**

- **Checkbox por mensagem:** Permite selecionar múltiplos e-mails.
- **Checkbox "Selecionar todos":** No cabeçalho da lista.
- **Toolbar de ações em lote:** Excluir selecionados, marcar como lido, treinar selecionados, mover para pasta.

**Especificação de implementação:**

```jsx
// MailItem.jsx
function MailItem({ message, prediction, selected, onToggleSelect, onOpen }) {
  return (
    <div className={`mail-item ${selected ? 'selected' : ''}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(message.id)}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="mail-content" onClick={() => onOpen(message.id)}>
        <span className="sender">{sender(message)}</span>
        <span className="date">{formatDate(message.receivedDateTime)}</span>
        <h3>{message.subject || '(sem assunto)'}</h3>
        <p>{message.bodyPreview || 'Sem prévia disponível'}</p>
        {prediction && (
          <span className={`badge ${isRedCategory(prediction.category) ? 'red' : ''}`}>
            {prediction.category}
          </span>
        )}
      </div>
    </div>
  );
}
```

#### 3.3.4 Componentização e Organização do Código

**Problema:** `page.jsx` concentra toda a interface (Auth, Lista, Detalhes, Toolbar) em um único arquivo com linhas longas.

**Solução:** Modularizar em componentes limpos:

| Componente | Responsabilidade |
|---|---|
| `AuthPanel.jsx` | Painel de login e Device Code Flow |
| `FilterBar.jsx` | Abas de categorias e pesquisa |
| `MailList.jsx` | Lista de mensagens com paginação |
| `MailItem.jsx` | Item individual da lista |
| `MailViewer.jsx` | Visualização da mensagem com sanitização |
| `FeedbackSelector.jsx` | Seletor de categoria para feedback |
| `Toolbar.jsx` | Ações em lote e globais |
| `Toast.jsx` | Notificações e ações de desfazer |

**Especificação de implementação:**

```
frontend/
├── app/
│   ├── layout.jsx
│   └── page.jsx          # Apenas orquestração de estado e rotas
├── components/
│   ├── AuthPanel.jsx
│   ├── FilterBar.jsx
│   ├── MailList.jsx
│   ├── MailItem.jsx
│   ├── MailViewer.jsx
│   ├── FeedbackSelector.jsx
│   ├── Toolbar.jsx
│   └── Toast.jsx
├── hooks/
│   ├── useAuth.js
│   ├── useMessages.js
│   └── useClassification.js
└── services/
    └── api.js
```

#### 3.3.5 Suporte a Anexos

**Solução:**

- **Indicador de anexo:** Ícone de clipe de papel na lista de mensagens (já disponível via `hasAttachments`).
- **Lista de anexos:** No `MailViewer`, exibir nome, tipo e tamanho dos anexos.
- **Download:** Usar `GET /me/messages/{id}/attachments/{attachmentId}/$value` para baixar o arquivo.

**Especificação de implementação:**

```javascript
// graphService.js
async function listAttachments(messageId) {
  const client = await getGraphClient();
  const response = await client.api(`/me/messages/${encodeURIComponent(messageId)}/attachments`)
    .select('id,name,contentType,size')
    .get();
  return response.value || [];
}

async function downloadAttachment(messageId, attachmentId) {
  const client = await getGraphClient();
  return client.api(`/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`)
    .getStream();
}
```

```jsx
// AttachmentList.jsx
function AttachmentList({ messageId }) {
  const [attachments, setAttachments] = useState([]);
  useEffect(() => {
    api.listAttachments(messageId).then(setAttachments);
  }, [messageId]);

  if (!attachments.length) return null;

  return (
    <div className="attachments">
      <h4>Anexos ({attachments.length})</h4>
      <ul>
        {attachments.map(att => (
          <li key={att.id}>
            <a href={api.downloadAttachmentUrl(messageId, att.id)} download={att.name}>
              📎 {att.name} ({(att.size / 1024).toFixed(1)} KB)
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

### 3.4 Arquitetura, Backend & Segurança

#### 3.4.1 Persistência da Sessão MSAL (Token Cache)

**Problema:** Token e conta ficam apenas em variáveis de memória. Reiniciar o servidor exige nova autenticação via Device Code.

**Solução:** Implementar cache de token persistente usando:

- **Opção A:** `@azure/msal-node` com cache em arquivo JSON (`backend/data/msal-cache.json`).
- **Opção B:** SQLite via `better-sqlite3` ou `keyv` com adaptador SQLite.
- **Opção C:** Redis para ambientes distribuídos.

**Especificação de implementação:**

```javascript
// authService.js — com cache persistente
const { PublicClientApplication, LogLevel } = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.resolve(__dirname, '../data/msal-cache.json');

const cachePlugin = {
  beforeCacheAccess: async (cacheContext) => {
    if (fs.existsSync(CACHE_PATH)) {
      cacheContext.tokenCache.deserialize(fs.readFileSync(CACHE_PATH, 'utf8'));
    }
  },
  afterCacheAccess: async (cacheContext) => {
    if (cacheContext.cacheHasChanged) {
      fs.writeFileSync(CACHE_PATH, cacheContext.tokenCache.serialize());
    }
  },
};

const pca = new PublicClientApplication({
  auth: {
    clientId: process.env.CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.TENANT_ID || 'consumers'}`,
  },
  cache: { cachePlugin },
  system: { loggerOptions: { loggerCallback: () => {}, piiLoggingEnabled: false } },
});
```

#### 3.4.2 Suporte Multi-usuário

**Problema:** Variáveis de autenticação e `feedback.json` são únicos e globais. Se duas pessoas acessarem o app, as sessões e feedbacks se misturam.

**Solução:** Isolar dados e tokens por identificador de usuário/sessão.

**Especificação de implementação:**

1. **Sessão HTTP:** Usar `express-session` com store em SQLite/Redis. Cookie assinado com `httpOnly: true`, `secure: true` (em produção), `sameSite: 'lax'`.
2. **Identificador de usuário:** Extrair `account.homeAccountId` do MSAL após autenticação.
3. **Estrutura de dados por usuário:**

```
backend/data/
├── users/
│   ├── {homeAccountId}/
│   │   ├── feedback.json
│   │   ├── modelo-email/
│   │   └── msal-cache.json
```

4. **Middleware de autenticação:** Todas as rotas `/api/*` (exceto `/api/auth/*` e `/api/health`) exigem sessão válida.

```javascript
// server.js — middleware
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/health') return next();
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  req.userId = req.session.userId;
  next();
});
```

#### 3.4.3 Fila de Treinamento Assíncrona

**Problema:** O servidor inicia o retreinamento do TensorFlow.js no mesmo processo que atende a API HTTP. Múltiplos cliques rápidos levam a 100% de CPU.

**Solução:** Enfileirar feedbacks e realizar retreinamento com debounce ou em worker thread.

**Especificação de implementação:**

```javascript
// trainingQueue.js
const { Worker } = require('worker_threads');
const EventEmitter = require('events');

class TrainingQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.processing = false;
    this.debounceTimer = null;
    this.DEBOUNCE_MS = 30000; // 30 segundos
  }

  enqueue(feedback) {
    this.queue.push(feedback);
    this.scheduleTraining();
  }

  scheduleTraining() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.processQueue(), this.DEBOUNCE_MS);
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const batch = this.queue.splice(0, this.queue.length);
    try {
      const worker = new Worker('./workers/trainWorker.js', {
        workerData: { feedback: batch },
      });

      worker.on('message', (result) => {
        this.emit('trained', result);
        this.processing = false;
        if (this.queue.length > 0) this.scheduleTraining();
      });

      worker.on('error', (err) => {
        this.emit('error', err);
        this.processing = false;
      });
    } catch (err) {
      this.processing = false;
      this.emit('error', err);
    }
  }
}

module.exports = new TrainingQueue();
```

#### 3.4.4 Migração para TypeScript

**Problema:** Contratos de mensagens do Microsoft Graph e tipos de classificação seriam mais seguros com TypeScript.

**Solução:** Migrar frontend e backend para TypeScript.

**Especificação de implementação:**

- **Backend:** `tsconfig.json` com `strict: true`, `esModuleInterop: true`, `outDir: 'dist'`. Tipos para `Message`, `ClassificationResult`, `Feedback`, `AuthSession`.
- **Frontend:** Next.js já suporta TypeScript nativamente. Tipos compartilhados via pacote `@email-classifier/types`.

```typescript
// types.ts
export type Category = 'principal' | 'spam' | 'promocoes' | 'redes_sociais';

export interface ClassificationResult {
  category: Category;
  confidence: number;
  details: Array<{ category: Category; probability: number }>;
}

export interface MailMessage {
  id: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } };
  receivedDateTime: string;
  bodyPreview: string;
  body?: { content: string; contentType: 'html' | 'text' };
  isRead: boolean;
  hasAttachments: boolean;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
}

export interface Feedback {
  messageId: string;
  text: string;
  label: Category;
  updatedAt: string;
}
```

---

### 3.5 Qualidade de Código, Testes & DevOps

#### 3.5.1 Testes Automatizados

**Solução:**

- **Testes unitários (Vitest/Jest):** Pipeline de normalização/tokenização do `classifierService`.
- **Testes de integração:** Simular rotas da API com mocks do Microsoft Graph.
- **Testes de componente:** React Testing Library para componentes do frontend.

**Especificação de implementação:**

```javascript
// __tests__/classifier.test.js
import { describe, it, expect } from 'vitest';
const { normalize, tokenize } = require('../services/classifierService');

describe('normalize', () => {
  it('converte para minúsculas e remove acentos', () => {
    expect(normalize('Promoção EXCLUSIVA')).toBe('promocao exclusiva');
  });
  it('remove caracteres especiais', () => {
    expect(normalize('Clique aqui! <a href="#">link</a>')).toBe('clique aqui a href link a');
  });
});

describe('tokenize', () => {
  it('retorna sequência de exatamente MAX_SEQUENCE_LENGTH', () => {
    const tokens = tokenize('reuniao de equipe');
    expect(tokens.length).toBe(30);
  });
  it('adiciona token <START> no início', () => {
    const tokens = tokenize('reuniao');
    expect(tokens[0]).toBe(1); // <START>
  });
  it('usa <UNKNOWN> para palavras fora do vocabulário', () => {
    const tokens = tokenize('palavraquenaoexiste');
    expect(tokens).toContain(2); // <UNKNOWN>
  });
});
```

#### 3.5.2 Docker & Docker Compose

**Solução:** Criar `Dockerfile` e `docker-compose.yml` para rodar backend e frontend com um único comando.

**Especificação de implementação:**

```dockerfile
# backend/Dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
version: '3.9'
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    env_file:
      - .env
    volumes:
      - ./backend/data:/app/data
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:3001/api
    depends_on:
      - backend
    restart: unless-stopped
```

```bash
# Uso
docker compose up --build
```

---

## 4. Roadmap de Implementação

| Fase | Prioridade | Melhorias | Estimativa |
|---|---|---|---|
| **Fase 1 — Fundação** | Alta | Componentização do frontend, TypeScript, testes unitários, Docker | 2-3 semanas |
| **Fase 2 — Inteligência** | Alta | Classificador híbrido (metadados), feedback bidirecional, vocabulário dinâmico (TF-IDF) | 3-4 semanas |
| **Fase 3 — UX** | Média | Abas de categorias, pesquisa, ações em lote, anexos, paginação | 2-3 semanas |
| **Fase 4 — Escala** | Média | Multi-usuário, sessão persistente, fila de treinamento, batch Graph | 3-4 semanas |
| **Fase 5 — Automação** | Baixa | Auto-clean, agendamentos, LLM opcional | 2-3 semanas |

---

## 5. Métricas de Sucesso

| Métrica | Baseline (MVP) | Meta (Pós-melhorias) |
|---|---|---|
| Acurácia do classificador | ~70% (vocabulário limitado) | ≥90% (híbrido + vocabulário dinâmico) |
| Falsos positivos (principal → spam/promoção) | Alto | <5% |
| Tempo de resposta da API (classificação) | ~200ms | <100ms (cache + lote) |
| Usuários simultâneos suportados | 1 | ≥10 (sessão isolada) |
| Cobertura de testes | 0% | ≥80% |
| Tempo de onboarding (nova funcionalidade) | Dias | Horas (TypeScript + testes) |

---

## 6. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Rate limiting do Microsoft Graph (429) | Média | Alto | Batch requests, backoff exponencial, cache de respostas |
| Custo de LLM em produção | Média | Médio | Oferecer opção local (Ollama) como padrão; limite de requisições por usuário |
| Overfitting com feedback limitado | Média | Médio | Validação cruzada, conjunto de validação separado, early stopping |
| Complexidade da migração para TypeScript | Baixa | Médio | Migração incremental, `allowJs: true` durante transição |
| Vazamento de tokens no cache | Baixa | Alto | Criptografar cache com chave derivada de variável de ambiente |

---

## 7. Conclusão

Este SSD fornece um plano completo para evoluir o MVP de classificação de e-mails para um produto robusto, multi-usuário e pronto para produção. As melhorias estão organizadas em cinco fases, priorizando fundação técnica (TypeScript, testes, Docker), inteligência (classificador híbrido, feedback bidirecional) e experiência do usuário (abas, ações em lote, anexos). A implementação segue princípios de design modular, segurança por padrão e observabilidade, garantindo que o sistema possa escalar sem comprometer a qualidade ou a experiência do usuário.
