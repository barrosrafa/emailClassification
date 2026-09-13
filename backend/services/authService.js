const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const msal = require('@azure/msal-node');

const clientId = process.env.CLIENT_ID;
if (!clientId) throw new Error('CLIENT_ID não configurado. Copie .env.example para .env.');

const DATA_DIR = path.resolve(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const CACHE_PATH = path.join(DATA_DIR, 'msal-cache.json');

// Plugin de persistência em disco do cache de tokens MSAL (SSD 3.4.1)
const cachePlugin = {
  beforeCacheAccess: async (cacheContext) => {
    if (fs.existsSync(CACHE_PATH)) {
      try {
        const cacheData = fs.readFileSync(CACHE_PATH, 'utf8');
        if (cacheData) cacheContext.tokenCache.deserialize(cacheData);
      } catch (e) {
        console.warn('[MSAL Cache] Falha ao ler cache:', e.message);
      }
    }
  },
  afterCacheAccess: async (cacheContext) => {
    if (cacheContext.cacheHasChanged) {
      try {
        fs.writeFileSync(CACHE_PATH, cacheContext.tokenCache.serialize());
      } catch (e) {
        console.warn('[MSAL Cache] Falha ao gravar cache:', e.message);
      }
    }
  },
};

const pca = new msal.PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${process.env.TENANT_ID || 'consumers'}`
  },
  cache: { cachePlugin },
  system: { loggerOptions: { loggerCallback: () => {}, piiLoggingEnabled: false } }
});

let account = null;
let tokenResponse = null;
let activeFlow = null;

// Inicializa restaurando contas existentes do cache persistente
(async function init() {
  try {
    const tokenCache = pca.getTokenCache();
    const accounts = await tokenCache.getAllAccounts();
    if (accounts.length > 0) {
      account = accounts[0];
      const silent = await pca.acquireTokenSilent({
        account,
        scopes: ['User.Read', 'Mail.ReadWrite', 'offline_access']
      }).catch(() => null);
      if (silent) {
        tokenResponse = silent;
        console.log(`[MSAL] Sessão restaurada com sucesso para: ${account?.username || 'desconhecido'}`);
      }
    }
  } catch (err) {
    console.warn('[MSAL] Inicialização do cache:', err.message);
  }
})();

function isAuthenticated() {
  return Boolean(account && (tokenResponse?.accessToken || account.homeAccountId));
}

function getAccount() {
  return account;
}

function getUserId() {
  return account?.homeAccountId || 'default';
}

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
  }, 35000);

  codePromise.finally(() => clearTimeout(timer));

  activeFlow = { codePromise, codeInfo: null, tokenPromise };
  return codePromise;
}

async function getAccessToken() {
  if (!account) {
    const accounts = await pca.getTokenCache().getAllAccounts().catch(() => []);
    if (accounts.length > 0) account = accounts[0];
  }
  if (!account) return null;

  try {
    const silent = await pca.acquireTokenSilent({
      account,
      scopes: ['User.Read', 'Mail.ReadWrite', 'offline_access']
    });
    tokenResponse = silent;
    return silent.accessToken;
  } catch (err) {
    return tokenResponse?.accessToken || null;
  }
}

function signOut() {
  if (account) {
    try {
      pca.getTokenCache().removeAccount(account);
    } catch {}
  }
  account = null;
  tokenResponse = null;
  activeFlow = null;
  if (fs.existsSync(CACHE_PATH)) {
    try { fs.unlinkSync(CACHE_PATH); } catch {}
  }
}

module.exports = {
  startDeviceCodeFlow,
  getAccessToken,
  isAuthenticated,
  getAccount,
  getUserId,
  signOut
};
