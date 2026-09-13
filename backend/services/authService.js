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
let deviceFlowPromise = null;

function isAuthenticated() {
  return Boolean(account && tokenResponse?.accessToken);
}

function getAccount() { return account; }

async function startDeviceCodeFlow(onCode) {
  if (deviceFlowPromise) return deviceFlowPromise;
  deviceFlowPromise = pca.acquireTokenByDeviceCode({
    scopes: ['User.Read', 'Mail.ReadWrite', 'offline_access'],
    deviceCodeCallback: (response) => onCode({
      userCode: response.userCode,
      verificationUri: response.verificationUri,
      expiresIn: response.expiresIn,
      message: response.message
    })
  }).then((response) => {
    tokenResponse = response;
    account = response.account;
    return response;
  }).finally(() => { deviceFlowPromise = null; });
  return deviceFlowPromise;
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
}

module.exports = { startDeviceCodeFlow, getAccessToken, isAuthenticated, getAccount, signOut };
