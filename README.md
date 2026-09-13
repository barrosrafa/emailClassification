# emailClassification

Aplicação web para visualizar mensagens do Outlook/Hotmail usando Microsoft Graph e OAuth 2.0 Device Code Flow, classificando cada e-mail com TensorFlow.js.

## O que foi implementado

A caixa de entrada é classificada em **principal**, **spam**, **promocoes** e **redes_sociais**. Mensagens classificadas como spam ou promoções aparecem com fundo e borda vermelhos. A classificação é uma sugestão: o modelo não aprende com uma previsão automática sem confirmação do usuário.

Ao clicar em **É propaganda / não importante**, o texto e o rótulo confirmado são salvos localmente em `backend/data/feedback.json` e o modelo é retreinado incrementalmente. O processo também executa um treinamento diário com todos os exemplos confirmados. Para executar o treino imediatamente, use o botão **Treinar agora** ou `POST /api/learning/run`.

O modelo segue a arquitetura do guia: tokenização manual com vocabulário fixo, padding, Embedding(32), LSTM(32), Dropout, Dense(16) e saída softmax com quatro categorias. O artefato treinado fica em `backend/data/modelo-email/`, ambos ignorados pelo Git.

## Segurança

O projeto usa um public client: `CLIENT_ID` é identificador público e não há client secret no código. Tokens ficam somente em memória no backend; `.env`, caches, feedback e modelo treinado são ignorados pelo Git. O HTML das mensagens é sanitizado com DOMPurify antes da renderização.

## Configuração do Microsoft Entra

No registro do aplicativo, habilite **Allow public client flows** e adicione permissões delegadas do Microsoft Graph: `User.Read`, `Mail.ReadWrite` e `offline_access`. Para contas pessoais, use o tenant `consumers`.

## Execução local

```bash
cp .env.example .env
npm install
npm run install:all
npm run dev
```

Abra `http://localhost:3000`, conecte a conta Microsoft, autorize o acesso e carregue a caixa de entrada. O primeiro carregamento treina o modelo base; os seguintes carregam o modelo salvo.

## Variáveis úteis

`TRAIN_ON_START=true` força um treino no início do backend. `DAILY_TRAIN_INTERVAL_MS` controla o intervalo do treino automático; o padrão é 24 horas. Para testes, pode-se usar um valor menor, por exemplo `DAILY_TRAIN_INTERVAL_MS=60000`, mas não é recomendado em produção.

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
| POST | `/api/classify` | Classifica texto de e-mail |
| POST | `/api/learn` | Salva feedback confirmado e retreina |
| GET | `/api/learning/status` | Consulta quantidade de feedbacks |
| POST | `/api/learning/run` | Executa treinamento diário manualmente |

## Limitações e produção

A sessão Microsoft e o feedback ficam locais ao processo. Para produção, use armazenamento persistente criptografado por usuário, HTTPS, proteção CSRF, rate limiting e auditoria sem conteúdo sensível. O aprendizado diário deste MVP acontece enquanto o backend está em execução; em hospedagem, configure um cron diário para chamar `/api/learning/run` ou mantenha o serviço ativo.
