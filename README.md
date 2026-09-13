# emailClassification

Aplicação web para visualizar, abrir e excluir mensagens da caixa de entrada Outlook/Hotmail usando Microsoft Graph e OAuth 2.0 Device Code Flow.

## Segurança

O projeto usa um **public client**: o `CLIENT_ID` é um identificador público e não há client secret no código. Tokens ficam somente em memória no backend; `.env`, caches e dependências estão ignorados pelo Git. O HTML das mensagens é sanitizado com DOMPurify antes da renderização. Nunca adicione secrets, access tokens ou refresh tokens a commits.

## Configuração do Microsoft Entra

No registro do aplicativo `6579b82a-843b-4461-9016-abd09e928a65`, habilite **Allow public client flows** e adicione permissões delegadas do Microsoft Graph: `User.Read`, `Mail.ReadWrite` e `offline_access`. Para contas pessoais, use o tenant `consumers`; não é necessário client secret nem URI de redirecionamento para o fluxo de código de dispositivo.

A aplicação não faz login automaticamente na conta informada. O usuário inicia o fluxo e conclui a autorização no endereço oficial da Microsoft, garantindo consentimento explícito.

## Execução local

```bash
cp .env.example .env
npm install
npm run install:all
npm run dev
```

Abra `http://localhost:3000`, clique em **Conectar conta Microsoft**, acesse o endereço indicado, informe o código e aguarde a caixa de entrada carregar.

O backend também pode ser iniciado isoladamente:

```bash
npm start
```

## API

| Método | Rota | Função |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/auth/status` | Estado da sessão |
| POST | `/api/auth/device-code` | Inicia Device Code Flow |
| POST | `/api/auth/logout` | Limpa a sessão em memória |
| GET | `/api/mail` | Lista mensagens da Inbox |
| GET | `/api/mail/:id` | Abre uma mensagem |
| DELETE | `/api/mail/:id` | Exclui uma mensagem |

## Limitações do MVP

A sessão é mantida em memória e será perdida ao reiniciar o backend. Para produção, use armazenamento de sessão criptografado, HTTPS, proteção CSRF, rate limiting, auditoria sem tokens e uma política de retenção adequada.
