require('isomorphic-fetch');
const { Client } = require('@microsoft/microsoft-graph-client');
const authService = require('./authService');

async function getGraphClient() {
  const accessToken = await authService.getAccessToken();
  if (!accessToken) throw new Error('Não autenticado');
  return Client.init({ authProvider: (done) => done(null, accessToken) });
}

async function listMessages(top = 50) {
  const client = await getGraphClient();
  const response = await client.api('/me/mailFolders/inbox/messages')
    .select('id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments')
    .top(Math.min(Number(top) || 50, 100))
    .orderby('receivedDateTime desc')
    .get();
  return response.value || [];
}

async function getMessage(messageId) {
  const client = await getGraphClient();
  return client.api(`/me/messages/${encodeURIComponent(messageId)}`)
    .select('id,subject,from,receivedDateTime,body,isRead,toRecipients,ccRecipients,hasAttachments')
    .get();
}

async function deleteMessage(messageId) {
  const client = await getGraphClient();
  await client.api(`/me/messages/${encodeURIComponent(messageId)}`).delete();
}

module.exports = { listMessages, getMessage, deleteMessage };
