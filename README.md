# MV Financing

Controle financeiro pessoal — single user por conta, UI em pt-BR.

## Stack

- **Frontend:** `index.html` + `css/styles.css` + `js/*.js` — vanilla JS em scripts clássicos (sem build step), organizados por concern: `state`, `ui`, `render`, `charts`, `actions`, `export`, `backup`, `extrato`, `auth`. Chart.js e SheetJS `xlsx` são vendorizados em `vendor/` e carregados sob demanda (`js/loader.js`).
- **Backend:** funções serverless da Vercel em `api/*.js` (CommonJS). Helpers compartilhados em `lib/auth.js`.
- **Auth:** JWT (`jsonwebtoken`), senha com `bcryptjs`, rate limiting por IP+usuário via KV.
- **Storage:** Vercel KV — `user:<username>` (credenciais) e `data:<username>` (blob dos dados financeiros).

## Rodando localmente

```bash
npm install
npm run dev     # vercel dev — precisa da Vercel CLI e das env vars abaixo
```

Sem a Vercel CLI, `index.html` + `css/` + `js/` + `vendor/` são estáticos e podem
ser servidos por qualquer servidor de arquivos (ex: `npx serve .`) — nesse caso
só o modo demo (`?demo` na URL) funciona, já que ele não depende da API.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `JWT_SECRET` | Sim em produção | Segredo pra assinar/verificar tokens JWT. Sem ela, `lib/auth.js` recusa assinar/verificar tokens em produção (`VERCEL_ENV=production` ou `NODE_ENV=production`); fora de produção cai num valor de desenvolvimento inseguro só pra não travar o `vercel dev` local. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Sim | Credenciais do KV (integração "Vercel KV" — hoje descontinuada, migrada pra Upstash Redis nas integrações da Vercel). |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Alternativa às acima | Mesma coisa, nome das variáveis quando o KV vem de uma integração Upstash direto do Marketplace. |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | `vercel dev` — roda frontend + funções serverless localmente |
| `npm test` | Roda os testes (`node --test`) em `test/` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |

CI (`.github/workflows/ci.yml`) roda lint, format:check e test em todo push/PR pra `main`.

## Modo demo

`?demo` na URL entra num modo somente-leitura com dados fictícios em memória —
não toca `localStorage` nem a API. Usado pra demonstrar o produto sem precisar
de conta nem de backend.

## Segurança

- Rate limiting por IP+usuário (KV com TTL) em login/register/forgot/reset/change.
- `login`/`forgot`/`reset` respondem com a mesma mensagem/status pra usuário
  inexistente e credencial errada, e sempre rodam `bcrypt.compare` (contra um
  hash dummy quando o usuário não existe) pra não vazar por timing.
- `data.js` valida payload: só aceita chaves `mvf3_*`, com limite de tamanho
  por chave e total.
- CSP + headers de segurança em `vercel.json` — `script-src 'self'` (só é
  possível porque não há mais JS inline nem CDN externo).

## Estrutura

```
index.html          shell da SPA
css/styles.css       estilos
js/
  loader.js          carregamento sob demanda de libs externas
  state.js            constantes, estado global, camada de storage
  ui.js                sidebar, navegação, tema
  render.js           desenho das páginas
  charts.js            gráficos (Chart.js, lazy)
  actions.js           modais e CRUD de lançamentos
  export.js            exportação Excel/PDF
  backup.js            backup/restore em JSON
  extrato.js           import de extrato bancário (OFX/CSV) + categorização
  auth.js               login/registro/sync com a API
vendor/              Chart.js e xlsx vendorizados (sem CDN)
api/                 funções serverless (login, register, data, change, forgot, reset)
lib/auth.js          JWT, KV, rate limiting, leitura de corpo com limite
test/                testes (node:test)
```

Veja também [ROADMAP.md](./ROADMAP.md) pras decisões de arquitetura, o que foi
feito nesta rodada e o que fica como próximo passo.
