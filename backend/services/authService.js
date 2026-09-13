const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const msal = require('@azure/msal-node');

const clientId = process.env.CLIENT_ID;
if (!clientId) throw new Error('CLIENT_ID não configurado. Copie .env.example para .env.');

const pca = new msal.PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${process.env.TENANT_ID || 'consumers'}`
  }
});

let account = null;
let tokenResponse = null;
let activeFlow = null;

function isAuthenticated() {
  return Boolean(account && tokenResponse?.accessToken);
}

function getAccount() { return account; }

async function startDeviceCodeFlow() {
  if (activeFlow?.codeInfo) {
    return activeFlow.codeInfo;
  }
  if (activeFlow?.codePromise) {
    return activeFlow.codePromise;
  }

  let resolveCode, rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const tokenPromise = pca.acquireTokenByDeviceCode({
    scopes: ['User.Read', 'Mail.ReadWrite', 'offline_access'],
    deviceCodeCallback: (response) => {
      if (!response || !response.userCode) {
        rejectCode(new Error('A Microsoft rejeitou a solicitação (AADSTS70002). Ative "Allow public client flows" nas configurações de Autenticação do aplicativo no portal do Azure/Entra.'));
        return;
      }
      const codeInfo = {
        userCode: response.userCode,
        verificationUri: response.verificationUri,
        expiresIn: response.expiresIn,
        message: response.message
      };
      if (activeFlow) {
        activeFlow.codeInfo = codeInfo;
      }
      resolveCode(codeInfo);
    }
  }).then((response) => {
    tokenResponse = response;
    account = response.account;
    console.log(`[MSAL] Usuário autenticado com sucesso: ${account?.username || 'desconhecido'}`);
    return response;
  }).catch((error) => {
    rejectCode(error);
    console.error('[MSAL DeviceCode Error]:', error.message);
  }).finally(() => {
    activeFlow = null;
  });

  const timer = setTimeout(() => {
    rejectCode(new Error('Tempo limite excedido ao comunicar com a Microsoft.'));
  }, 25000);

  codePromise.finally(() => clearTimeout(timer));

  activeFlow = { codePromise, codeInfo: null, tokenPromise };
  return codePromise;
}

async function getAccessToken() {
  if (!account) return null;
  try {
    const silent = await pca.acquireTokenSilent({
      account,
      scopes: ['User.Read', 'Mail.ReadWrite', 'offline_access']
    });
    tokenResponse = silent;
    return silent.accessToken;
  } catch {
    return tokenResponse?.accessToken || null;
  }
}

function signOut() {
  account = null;
  tokenResponse = null;
  activeFlow = null;
}

module.exports = { startDeviceCodeFlow, getAccessToken, isAuthenticated, getAccount, signOut };
