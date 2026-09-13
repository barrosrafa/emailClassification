require('isomorphic-fetch');
const { Client } = require('@microsoft/microsoft-graph-client');
const authService = require('./authService');

async function getGraphClient() {
  const accessToken = await authService.getAccessToken();
  if (!accessToken) throw new Error('Não autenticado');
  return Client.init({ authProvider: (done) => done(null, accessToken) });
}

/**
 * Lista mensagens com suporte a pastas, limite e paginação contínua (@odata.nextLink).
 */
async function listMessages(options = {}) {
  const client = await getGraphClient();

  // Suporte a chamada legada listMessages(top)
  const isLegacy = typeof options === 'number' || (typeof options === 'string' && !options.startsWith('http'));
  const folder = isLegacy ? 'inbox' : (options.folder || 'inbox');
  const top = isLegacy ? Math.min(Number(options) || 50, 100) : Math.min(Number(options.top) || 50, 100);
  const nextLink = isLegacy ? null : options.nextLink;

  let request;
  if (nextLink) {
    request = client.api(nextLink);
  } else {
    request = client.api(`/me/mailFolders/${encodeURIComponent(folder)}/messages`)
      .select('id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments,internetMessageHeaders')
      .top(top)
      .orderby('receivedDateTime desc');
  }

  const response = await request.get();
  const messages = response.value || [];
  const next = response['@odata.nextLink'] || null;

  return {
    messages,
    nextLink: next,
    length: messages.length,
    [Symbol.iterator]() {
      return messages[Symbol.iterator]();
    }
  };
}

async function getMessage(messageId) {
  const client = await getGraphClient();
  return client.api(`/me/messages/${encodeURIComponent(messageId)}`)
    .select('id,subject,from,receivedDateTime,body,bodyPreview,isRead,toRecipients,ccRecipients,hasAttachments,internetMessageHeaders')
    .get();
}

async function deleteMessage(messageId) {
  const client = await getGraphClient();
  await client.api(`/me/messages/${encodeURIComponent(messageId)}`).delete();
  return { success: true, id: messageId };
}

/**
 * Mover mensagem para pasta de destino (ex: 'junkemail', 'archive', ou ID de pasta personalizada).
 */
async function moveMessage(messageId, destinationId = 'archive') {
  const client = await getGraphClient();
  return client.api(`/me/messages/${encodeURIComponent(messageId)}/move`)
    .post({ destinationId });
}

/**
 * Marcar mensagem como lida ou não lida.
 */
async function markAsRead(messageId, isRead = true) {
  const client = await getGraphClient();
  return client.api(`/me/messages/${encodeURIComponent(messageId)}`)
    .patch({ isRead });
}

/**
 * Listar pastas de e-mail do usuário.
 */
async function listFolders() {
  const client = await getGraphClient();
  const response = await client.api('/me/mailFolders')
    .select('id,displayName,parentFolderId,totalItemCount,unreadItemCount')
    .top(50)
    .get();
  return response.value || [];
}

/**
 * Listar metadados dos anexos de uma mensagem.
 */
async function listAttachments(messageId) {
  const client = await getGraphClient();
  const response = await client.api(`/me/messages/${encodeURIComponent(messageId)}/attachments`)
    .select('id,name,contentType,size,isInline')
    .get();
  return response.value || [];
}

/**
 * Obter stream de conteúdo ou dados de um anexo.
 */
async function getAttachment(messageId, attachmentId) {
  const client = await getGraphClient();
  return client.api(`/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`)
    .get();
}

/**
 * Exclusão em lote otimizada usando endpoint $batch do Microsoft Graph (até 20 requisições por lote).
 */
async function batchDeleteMessages(messageIds = []) {
  if (!messageIds.length) return [];
  const client = await getGraphClient();

  const requests = messageIds.map((id, index) => ({
    id: String(index + 1),
    method: 'DELETE',
    url: `/me/messages/${encodeURIComponent(id)}`,
  }));

  const chunks = [];
  for (let i = 0; i < requests.length; i += 20) {
    chunks.push(requests.slice(i, i + 20));
  }

  const results = [];
  for (const chunk of chunks) {
    try {
      const response = await client.api('/$batch').post({ requests: chunk });
      results.push(...(response.responses || []));
    } catch (err) {
      console.error('[Graph $batch delete error]', err.message);
      // Fallback para deleções individuais caso o batch falhe
      for (const req of chunk) {
        const singleId = messageIds[Number(req.id) - 1];
        try {
          await deleteMessage(singleId);
          results.push({ id: req.id, status: 204 });
        } catch (singleErr) {
          results.push({ id: req.id, status: 500, body: { error: singleErr.message } });
        }
      }
    }
  }

  return results;
}

module.exports = {
  listMessages,
  getMessage,
  deleteMessage,
  moveMessage,
  markAsRead,
  listFolders,
  listAttachments,
  getAttachment,
  batchDeleteMessages
};
