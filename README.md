# emailClassification

Aplicação web para leitura e gerenciamento da caixa de entrada Outlook/Hotmail, integrada ao Microsoft Graph e protegida pelo OAuth 2.0 Device Code Flow. O sistema classifica mensagens usando **TensorFlow.js no backend Node.js**, destaca mensagens de propaganda ou não importantes em vermelho e permite que o usuário corrija a classificação por meio de feedback explícito.

O feedback confirmado alimenta um conjunto persistente de exemplos e dispara um novo treinamento do modelo. Além disso, o backend executa um retreinamento periódico diário com todos os exemplos confirmados.

> **Estado atual:** o projeto é um MVP funcional. A sessão Microsoft e os dados de aprendizado são locais ao processo e ao filesystem do backend. Antes de um uso multiusuário ou de produção, consulte a seção [Limitações e evolução para produção](#limitações-e-evolução-para-produção).

## Sumário

1. [Visão geral](#visão-geral)
2. [Funcionalidades](#funcionalidades)
3. [Arquitetura](#arquitetura)
4. [Estrutura do projeto](#estrutura-do-projeto)
5. [Backend](#backend)
6. [Frontend](#frontend)
7. [Pipeline de TensorFlow.js](#pipeline-de-tensorflowjs)
8. [Aprendizado por feedback](#aprendizado-por-feedback)
9. [Integração com Microsoft Graph](#integração-com-microsoft-graph)
10. [Configuração do Microsoft Entra](#configuração-do-microsoft-entra)
11. [Instalação e execução](#instalação-e-execução)
12. [Variáveis de ambiente](#variáveis-de-ambiente)
13. [API HTTP](#api-http)
14. [Segurança e privacidade](#segurança-e-privacidade)
15. [Testes e validação](#testes-e-validação)
16. [Troubleshooting](#troubleshooting)
17. [Limitações e evolução para produção](#limitações-e-evolução-para-produção)
18. [Referências](#referências)

## Visão geral

O fluxo principal da aplicação é o seguinte:

1. O usuário conecta uma conta Microsoft pelo Device Code Flow.
2. O backend obtém mensagens da Inbox por meio do Microsoft Graph.
3. O frontend solicita uma classificação para cada mensagem.
4. O backend normaliza o texto, tokeniza o conteúdo e executa inferência no modelo TensorFlow.js.
5. Mensagens classificadas como `spam` ou `promocoes` recebem destaque visual vermelho.
6. O usuário pode abrir a mensagem, excluí-la ou confirmar que ela é propaganda.
7. O feedback confirmado é salvo em `backend/data/feedback.json` e o modelo é retreinado.
8. Um treinamento diário reprocessa os exemplos confirmados enquanto o backend estiver ativo.

A previsão automática é tratada como **sugestão**. O sistema não transforma uma previsão não confirmada em dado de treinamento. Essa separação reduz o risco de realimentar erros do próprio modelo.

## Funcionalidades

| Área | Comportamento |
|---|---|
| Autenticação | Login por código de dispositivo, sem client secret no frontend. |
| Caixa de entrada | Lista mensagens recentes da pasta Inbox. |
| Leitura | Abre o HTML do corpo da mensagem após sanitização. |
| Classificação | Categorias `principal`, `spam`, `promocoes` e `redes_sociais`. |
| Destaque | Mensagens `spam` e `promocoes` aparecem com fundo e borda vermelhos. |
| Feedback | Botão **É propaganda / não importante** disponível na lista e no detalhe. |
| Exclusão em massa | Botão **Excluir vermelhos** reclassifica a Inbox no backend e exclui somente mensagens `spam` ou `promocoes`, após confirmação. |
| Treinamento | Retreinamento após feedback e treinamento periódico diário. |
| Gerenciamento | Atualização da caixa de entrada, exclusão de mensagens e logout. |
| Persistência | Modelo e feedback ficam em `backend/data/`, ignorados pelo Git. |

## Arquitetura

A aplicação é dividida em dois processos durante o desenvolvimento: um servidor Express e uma aplicação Next.js.

```text
┌─────────────────────────────┐
│ Navegador                   │
│ Next.js + React             │
│ - Inbox                     │
│ - Detalhe da mensagem       │
│ - Feedback de aprendizado   │
└──────────────┬──────────────┘
               │ HTTP / JSON
               ▼
┌─────────────────────────────┐
│ Backend Express              │
│ - Rotas REST                 │
│ - Sessão MSAL em memória     │
│ - Serviço Microsoft Graph    │
│ - Serviço TensorFlow.js      │
└─────────┬───────────┬───────┘
          │           │
          ▼           ▼
┌──────────────┐  ┌─────────────────────┐
│ Microsoft    │  │ Filesystem local    │
│ Graph API    │  │ feedback.json       │
│ Outlook Mail │  │ modelo-email/       │
└──────────────┘  └─────────────────────┘
```

### Componentes principais

| Componente | Tecnologia | Responsabilidade |
|---|---|---|
| Frontend | Next.js 15, React 19 | Interface, estado da tela e chamadas HTTP. |
| Sanitização | DOMPurify | Remove conteúdo HTML potencialmente perigoso antes da renderização. |
| Backend | Node.js, Express 4 | API REST, autenticação, integração externa e orquestração do ML. |
| Autenticação | `@azure/msal-node` | Device Code Flow e renovação silenciosa de token. |
| E-mail | Microsoft Graph SDK | Consulta, leitura e exclusão de mensagens. |
| Machine learning | `@tensorflow/tfjs-node` | Treinamento e inferência com backend nativo TensorFlow. |
| Persistência MVP | JSON e filesystem | Armazena feedback e artefatos do modelo localmente. |

## Estrutura do projeto

```text
emailClassification/
├── backend/
│   ├── data/                         # Gerado em runtime; ignorado pelo Git
│   │   ├── feedback.json             # Exemplos rotulados pelo usuário
│   │   └── modelo-email/             # model.json e pesos TensorFlow.js
│   ├── services/
│   │   ├── authService.js            # Sessão MSAL e Device Code Flow
│   │   ├── classifierService.js      # Tokenização, modelo, inferência e treino
│   │   └── graphService.js           # Operações Microsoft Graph
│   ├── package.json
│   └── server.js                     # Aplicação Express e rotas REST
├── frontend/
│   ├── app/
│   │   ├── layout.jsx                # Layout global do Next.js
│   │   └── page.jsx                  # Inbox, detalhe e feedback
│   ├── src/
│   │   ├── services/api.js           # Cliente HTTP do frontend
│   │   └── styles/global.css         # Estilos da interface
│   ├── next.config.mjs
│   └── package.json
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Backend

O backend está em `backend/server.js` e expõe uma API REST sob o prefixo `/api`. O servidor escuta, por padrão, a porta `3001` e aceita requisições do frontend local.

### Inicialização

O servidor carrega as variáveis de ambiente, instancia o Express e importa os serviços de autenticação, Graph e classificação. O `classifierService` mantém o modelo em cache dentro do processo para evitar carregar `model.json` a cada requisição.

### Tratamento de erros

As rotas assíncronas são envolvidas por um adaptador que converte exceções em respostas JSON com status HTTP apropriado. O formato de erro é:

```json
{
  "error": "Descrição do erro"
}
```

### `authService.js`

O serviço usa um `PublicClientApplication` do MSAL. O `CLIENT_ID` é público e o fluxo não depende de client secret. O token de acesso e a conta ficam em memória no processo.

O método `getAccessToken()` tenta primeiro obter um token silenciosamente. Se a renovação silenciosa não for possível, usa o token em memória enquanto ele permanecer válido.

### `graphService.js`

O serviço cria um cliente Microsoft Graph com o token obtido pelo `authService`. As operações atuais são:

- listar mensagens da Inbox;
- abrir uma mensagem completa;
- excluir uma mensagem.

A listagem limita o número de mensagens ao máximo de 100 e ordena os resultados por `receivedDateTime` decrescente.

### `classifierService.js`

O serviço concentra toda a lógica de machine learning:

- vocabulário e normalização;
- tokenização e padding;
- criação e compilação do modelo;
- treinamento com dados base e feedback;
- carregamento lazy do modelo salvo;
- inferência de uma mensagem;
- persistência dos rótulos confirmados;
- treinamento periódico.

O serviço também evita treinamentos concorrentes por meio de `trainingPromise`. Enquanto um treinamento está em andamento, novas solicitações reutilizam a mesma promessa.

## Frontend

O frontend está em Next.js com componentes React no arquivo `frontend/app/page.jsx`. A página é um Client Component porque precisa controlar autenticação, seleção de mensagens, classificação e ações do usuário em tempo real.

### Fluxos da interface

Quando a página é aberta, o frontend consulta `/api/auth/status`. Se não houver sessão autenticada, exibe o painel de login e inicia o Device Code Flow quando o usuário solicita conexão.

Após a autenticação, a página consulta `/api/mail`, classifica as mensagens em paralelo por meio de `/api/classify` e armazena as previsões em memória no estado React.

Ao selecionar uma mensagem, a página consulta `/api/mail/:id`, exibe o conteúdo sanitizado e permite confirmar o rótulo. Ao clicar no botão de propaganda, o frontend envia o texto e o rótulo `promocoes` para `/api/learn`.

### Destaque vermelho

A função visual considera duas categorias como não importantes para o destaque:

```javascript
const isRedCategory = (category) =>
  category === 'spam' || category === 'promocoes';
```

A cor é uma decisão de apresentação. O rótulo do modelo continua disponível na interface e no retorno da API.

### Sanitização de HTML

O corpo da mensagem pode conter HTML fornecido por terceiros. Antes de usar `dangerouslySetInnerHTML`, o conteúdo passa por `DOMPurify.sanitize()`. Essa etapa é obrigatória para reduzir riscos de XSS na leitura de mensagens.

## Pipeline de TensorFlow.js

O backend usa `@tensorflow/tfjs-node`, que executa TensorFlow.js com bindings nativos para Node.js. Essa escolha evita transferir o conteúdo dos e-mails para o navegador e permite que o treinamento fique concentrado no servidor.

### Categorias

As categorias são mantidas na ordem abaixo. A posição numérica é usada como índice do vetor one-hot:

| Índice | Categoria | Interpretação |
|---:|---|---|
| 0 | `principal` | Trabalho, comunicação ou mensagens relevantes. |
| 1 | `spam` | Golpes, phishing ou mensagens fraudulentas. |
| 2 | `promocoes` | Marketing, descontos, ofertas e newsletters. |
| 3 | `redes_sociais` | Notificações de redes sociais. |

### Normalização

A normalização executa as seguintes transformações:

1. converte o texto para letras minúsculas;
2. remove acentos por decomposição Unicode;
3. substitui caracteres que não sejam letras, números ou espaços;
4. divide o resultado em palavras.

Essa estratégia faz com que, por exemplo, `Promoção`, `PROMOCAO` e `promocao` tenham uma representação equivalente.

### Vocabulário

O vocabulário é fixo e definido no código. Ele contém três tokens especiais:

| Token | Índice | Uso |
|---|---:|---|
| `<PAD>` | 0 | Completa sequências menores. |
| `<START>` | 1 | Marca o início do texto. |
| `<UNKNOWN>` | 2 | Representa palavras fora do vocabulário. |

Palavras não cadastradas não são adicionadas automaticamente ao vocabulário durante a inferência. Isso garante que o formato da entrada permaneça compatível com os pesos salvos.

### Sequência de entrada

Cada mensagem é convertida para uma sequência de exatamente 30 inteiros. O texto recebe o token `<START>`, é truncado quando excede o limite e recebe `<PAD>` quando é menor.

### Arquitetura

O modelo implementado é uma rede sequencial leve:

| Camada | Configuração | Objetivo |
|---|---|---|
| Embedding | `inputDim = tamanho do vocabulário`, `outputDim = 32` | Converte índices em vetores densos. |
| LSTM | `units = 32` | Captura dependências na sequência de palavras. |
| Dropout | `rate = 0.3` | Reduz overfitting durante o treinamento. |
| Dense | `units = 16`, ativação ReLU | Aprende uma representação intermediária. |
| Dense de saída | `units = 4`, ativação softmax | Produz probabilidades das quatro categorias. |

O modelo é compilado com Adam, taxa de aprendizado `0.001` e perda `categoricalCrossentropy`.

### Dados base

Na primeira execução, o modelo usa um conjunto base pequeno de exemplos representativos das quatro categorias. Esses exemplos são definidos em `classifierService.js` e servem como ponto de partida para que a aplicação produza classificações antes de receber feedback do usuário.

O conjunto base é combinado com os exemplos persistidos em `feedback.json` a cada treinamento. O treinamento atual é completo sobre esse conjunto combinado; o termo “incremental” significa que novos exemplos confirmados são incorporados sem apagar os exemplos anteriores.

### Inferência

A função de classificação realiza as seguintes etapas:

1. obtém ou carrega o modelo em cache;
2. tokeniza o texto;
3. cria um tensor de entrada com forma `[1, 30]`;
4. executa `model.predict()`;
5. lê as quatro probabilidades;
6. ordena as categorias pela probabilidade;
7. libera os tensores intermediários.

O retorno inclui a categoria com maior probabilidade, sua confiança e a distribuição completa.

Exemplo:

```json
{
  "category": "promocoes",
  "confidence": 0.91,
  "details": [
    { "category": "promocoes", "probability": 0.91 },
    { "category": "principal", "probability": 0.04 },
    { "category": "spam", "probability": 0.03 },
    { "category": "redes_sociais", "probability": 0.02 }
  ]
}
```

### Persistência do modelo

O modelo é salvo em:

```text
backend/data/modelo-email/model.json
backend/data/modelo-email/group1-shard1of1.bin
```

Os nomes dos arquivos podem variar conforme o tamanho dos pesos. O diretório é gerado em runtime e ignorado pelo Git.

## Aprendizado por feedback

O aprendizado é supervisionado por confirmação do usuário. A aplicação não considera uma previsão automática como rótulo confiável.

### Fluxo de feedback

1. O usuário seleciona uma mensagem.
2. O usuário clica em **É propaganda / não importante**.
3. O frontend envia `messageId`, `text` e `label` para `/api/learn`.
4. O backend valida o rótulo.
5. O backend remove um feedback anterior da mesma mensagem, se existir.
6. O novo feedback é salvo em `feedback.json`.
7. O modelo é retreinado com os dados base e todos os feedbacks.
8. O modelo anterior é descartado da memória.
9. O novo modelo passa a ser usado nas próximas inferências.

O botão da interface usa o rótulo `promocoes`. A API aceita qualquer uma das quatro categorias, permitindo que uma futura interface ofereça correção explícita para todos os rótulos.

### Formato do feedback

```json
[
  {
    "messageId": "id-do-microsoft-graph",
    "text": "assunto e conteúdo da mensagem",
    "label": 2,
    "labelName": "promocoes",
    "updatedAt": "2026-09-13T21:00:00.000Z"
  }
]
```

O texto é limitado a 12.000 caracteres antes de ser persistido.

### Treinamento diário

O serviço agenda uma execução após `DAILY_TRAIN_INTERVAL_MS`. O valor padrão é 24 horas. O treinamento periódico usa somente os exemplos confirmados e o conjunto base.

O agendamento interno é adequado para o MVP enquanto o processo permanece ativo. Em produção, recomenda-se substituir ou complementar esse mecanismo com um scheduler externo que invoque `POST /api/learning/run`.

## Integração com Microsoft Graph

A aplicação consulta a pasta Inbox pelo endpoint Graph equivalente a:

```text
/me/mailFolders/inbox/messages
```

A listagem solicita os campos `id`, `subject`, `from`, `receivedDateTime`, `bodyPreview`, `isRead` e `hasAttachments`. A abertura de uma mensagem solicita também `body`, `toRecipients` e `ccRecipients`.

As permissões delegadas utilizadas são:

| Permissão | Uso |
|---|---|
| `User.Read` | Identificação da conta autenticada. |
| `Mail.ReadWrite` | Leitura e exclusão de mensagens. |
| `offline_access` | Renovação silenciosa do token quando possível. |

A exclusão é uma operação destrutiva na caixa de entrada e exige confirmação no frontend antes da chamada `DELETE`.

## Configuração do Microsoft Entra

Para contas Outlook ou Hotmail pessoais:

1. Abra o registro da aplicação no portal Microsoft Entra.
2. Habilite **Allow public client flows**.
3. Configure o tenant como `consumers`.
4. Adicione as permissões delegadas `User.Read`, `Mail.ReadWrite` e `offline_access`.
5. Conceda consentimento conforme a política da conta.
6. Copie o identificador público da aplicação para `CLIENT_ID`.

O Device Code Flow não exige URI de redirecionamento nem client secret. O usuário autoriza a aplicação em uma página oficial da Microsoft usando o código exibido na interface.

## Instalação e execução

### Requisitos

| Requisito | Versão ou observação |
|---|---|
| Node.js | Versão compatível com Next.js 15 e TensorFlow.js Node. Node.js 22 foi usado na validação. |
| npm | Incluído na instalação do Node.js. |
| Conta Microsoft | Outlook ou Hotmail com acesso à Inbox. |
| Aplicação Entra | Registro com Device Code Flow habilitado. |

### Instalação

Na raiz do projeto:

```bash
cp .env.example .env
npm install
npm run install:all
```

O comando `npm install` instala o `concurrently` da raiz. O comando `npm run install:all` instala as dependências independentes do backend e do frontend.

### Desenvolvimento

```bash
npm run dev
```

Esse comando inicia simultaneamente:

- backend em `http://localhost:3001`;
- frontend em `http://localhost:3000`.

Abra `http://localhost:3000` no navegador, clique em **Conectar conta Microsoft**, abra o endereço indicado e informe o código de dispositivo.

### Execução isolada

Backend:

```bash
npm start
```

Frontend em modo de desenvolvimento:

```bash
npm run dev --prefix frontend
```

Build de produção do frontend:

```bash
npm run build --prefix frontend
npm run start --prefix frontend
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste os valores:

| Variável | Obrigatória | Padrão | Descrição |
|---|---:|---|---|
| `CLIENT_ID` | Sim | — | Identificador público da aplicação Entra. |
| `TENANT_ID` | Não | `consumers` | Tenant usado pelo MSAL. |
| `PORT` | Não | `3001` | Porta do backend Express. |
| `FRONTEND_ORIGIN` | Não | — | Origem autorizada adicional para CORS. |
| `NEXT_PUBLIC_API_URL` | Não | `http://localhost:3001/api` | URL base da API usada pelo browser. |
| `TRAIN_ON_START` | Não | `false` | Se `true`, executa treino ao iniciar. |
| `DAILY_TRAIN_INTERVAL_MS` | Não | `86400000` | Intervalo do treinamento periódico em milissegundos. |

Para testar o agendamento rapidamente, pode-se usar:

```env
DAILY_TRAIN_INTERVAL_MS=60000
```

Esse valor não é recomendado para produção porque executa treinamentos com frequência desnecessária.

## API HTTP

Todas as rotas são prefixadas por `/api`. As respostas usam JSON, exceto o conteúdo HTML da mensagem dentro do campo `body.content` retornado pelo Graph.

### Health check

```http
GET /api/health
```

Resposta:

```json
{ "ok": true }
```

### Status de autenticação

```http
GET /api/auth/status
```

Resposta autenticada:

```json
{
  "authenticated": true,
  "account": "usuario@outlook.com"
}
```

### Iniciar Device Code Flow

```http
POST /api/auth/device-code
```

A resposta contém `userCode`, `verificationUri`, `expiresIn` e `message`.

### Logout

```http
POST /api/auth/logout
```

Resposta:

```json
{ "success": true }
```

### Listar mensagens

```http
GET /api/mail?top=50
```

O backend limita o parâmetro a 100 mensagens.

### Abrir mensagem

```http
GET /api/mail/:id
```

O identificador deve ser codificado pelo cliente quando contiver caracteres especiais.

### Excluir mensagem

```http
DELETE /api/mail/:id
```

Resposta:

```json
{ "success": true }
```

### Excluir todas as mensagens vermelhas

```http
POST /api/mail/delete-promotional
```

O backend lista até 100 mensagens da Inbox, classifica novamente cada mensagem usando o modelo atual e exclui apenas as categorias `spam` e `promocoes`. A decisão é repetida no backend para não depender exclusivamente das previsões mantidas no navegador.

O frontend solicita confirmação antes de executar a operação. A ação é permanente na conta Microsoft e retorna os identificadores excluídos:

```json
{
  "success": true,
  "deleted": 3,
  "ids": ["AAMkAG...", "AAMkBG...", "AAMkCG..."]
}
```

### Classificar texto

```http
POST /api/classify
Content-Type: application/json
```

Corpo:

```json
{
  "text": "Promoção exclusiva com desconto por tempo limitado"
}
```

Resposta:

```json
{
  "category": "promocoes",
  "confidence": 0.87,
  "details": [
    { "category": "promocoes", "probability": 0.87 },
    { "category": "principal", "probability": 0.06 },
    { "category": "spam", "probability": 0.04 },
    { "category": "redes_sociais", "probability": 0.03 }
  ]
}
```

### Salvar feedback e retreinar

```http
POST /api/learn
Content-Type: application/json
```

Corpo:

```json
{
  "messageId": "AAMkAG...",
  "text": "Assunto e conteúdo da mensagem",
  "label": "promocoes"
}
```

Valores válidos para `label`: `principal`, `spam`, `promocoes` e `redes_sociais`.

### Consultar status do aprendizado

```http
GET /api/learning/status
```

Resposta:

```json
{
  "feedback": 12,
  "labels": ["principal", "spam", "promocoes", "redes_sociais"]
}
```

### Executar treinamento manual

```http
POST /api/learning/run
```

Resposta:

```json
{
  "samples": 32,
  "feedback": 12,
  "trainedAt": "2026-09-13T21:00:00.000Z"
}
```

## Segurança e privacidade

O projeto adota as seguintes medidas no MVP:

- o client ID é público e não há client secret no código;
- tokens Microsoft permanecem no backend e não são enviados ao browser;
- arquivos `.env`, token cache, modelo e feedback são ignorados pelo Git;
- o HTML das mensagens passa por DOMPurify antes da renderização;
- o frontend solicita confirmação antes de excluir uma mensagem;
- o texto persistido para aprendizado é limitado a 12.000 caracteres;
- o modelo não aprende com previsões automáticas sem confirmação.

O conteúdo dos e-mails pode conter dados pessoais e informações confidenciais. O diretório `backend/data/` deve ser protegido com permissões de filesystem apropriadas e nunca deve ser publicado ou anexado a logs.

## Testes e validação

Validação de sintaxe do backend:

```bash
node --check backend/server.js
node --check backend/services/classifierService.js
```

Build do frontend:

```bash
npm run build --prefix frontend
```

Verificação de whitespace no Git:

```bash
git diff --check
```

O ciclo funcional de aprendizado pode ser validado chamando a API em um backend local:

```bash
curl -X POST http://localhost:3001/api/classify \
  -H 'Content-Type: application/json' \
  -d '{"text":"desconto exclusivo aproveite agora"}'

curl -X POST http://localhost:3001/api/learn \
  -H 'Content-Type: application/json' \
  -d '{"messageId":"teste-1","text":"desconto exclusivo aproveite agora","label":"promocoes"}'
```

A validação deve confirmar que o primeiro endpoint retorna uma distribuição de probabilidades e que o segundo retorna a quantidade de amostras usada no treinamento.

## Troubleshooting

### `CLIENT_ID não configurado`

Crie o arquivo `.env` a partir de `.env.example` e configure `CLIENT_ID` com o identificador da aplicação Microsoft Entra.

### A Microsoft não retorna o código de dispositivo

Confirme se **Allow public client flows** está habilitado e se o tenant está correto. Para contas pessoais, use `TENANT_ID=consumers`.

### O frontend não consegue acessar o backend

Confirme que o backend está em execução na porta configurada e que `NEXT_PUBLIC_API_URL` aponta para a URL correta. Em desenvolvimento, o valor padrão é `http://localhost:3001/api`.

### O primeiro carregamento demora

O primeiro uso pode treinar o modelo base e gerar os artefatos em `backend/data/modelo-email/`. Após isso, o modelo é carregado do disco e mantido em cache durante o processo.

### O modelo retorna resultados inesperados

O vocabulário é pequeno e o conjunto base é sintético. Confirme mensagens reais com o botão de feedback para adaptar o modelo ao seu padrão de e-mails. Também verifique se a mensagem contém termos que estão fora do vocabulário.

### O treinamento diário não acontece

O agendamento interno só executa enquanto o processo Node.js estiver ativo. Para processos que reiniciam ou ficam suspensos, configure um scheduler externo e chame `POST /api/learning/run`.

### O TensorFlow.js não instala

Use uma versão suportada do Node.js e remova instalações incompletas antes de tentar novamente:

```bash
rm -rf backend/node_modules backend/package-lock.json
npm install --prefix backend
```

## Limitações e evolução para produção

A sessão atual fica em memória. Reiniciar o backend exige nova autenticação.

O feedback e o modelo ficam em um único diretório local. Para múltiplos usuários, cada conta deve ter isolamento de sessão, exemplos e modelo.

O modelo não possui conjunto de validação, matriz de confusão, métricas por classe ou controle de versões. Uma evolução recomendada é separar dados de treino e validação, registrar acurácia por versão e impedir regressões antes de ativar um novo modelo.

O retreinamento completo cresce linearmente com a quantidade de exemplos. Para grandes volumes, considere filas de treinamento, armazenamento estruturado, batching e uma estratégia de versionamento de modelos.

O scheduler interno não é um mecanismo distribuído. Em produção, use um job scheduler confiável, controle de concorrência e observabilidade.

O CORS ainda é permissivo no código para facilitar o desenvolvimento local. Em produção, restrinja `allowedOrigins` a domínios conhecidos.

As mensagens são classificadas apenas quando a Inbox é carregada. Para processamento contínuo, adicione sincronização incremental baseada em `delta` do Microsoft Graph ou um worker persistente, respeitando limites de API e privacidade.

O aplicativo não move mensagens para pastas do Outlook. O destaque vermelho é visual na interface. Uma futura integração pode aplicar categorias do Microsoft Graph, mas essa mudança exige permissões, tratamento de erros e definição clara da política de automação.

## Referências

[1]: https://www.tensorflow.org/js "TensorFlow.js — documentação oficial"

[2]: https://www.tensorflow.org/js/guide/nodejs "TensorFlow.js em Node.js — documentação oficial"

[3]: https://learn.microsoft.com/en-us/entra/msal/js/node/ "Microsoft Authentication Library para Node.js — documentação oficial"

[4]: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code "OAuth 2.0 Device Authorization Grant — Microsoft identity platform"

[5]: https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview "Microsoft Graph Mail API — documentação oficial"

[6]: https://nextjs.org/docs "Next.js — documentação oficial"

[7]: https://react.dev/ "React — documentação oficial"

[8]: https://github.com/cure53/DOMPurify "DOMPurify — projeto e documentação"
