# MV Financing

Controle financeiro pessoal — single user por conta, UI em pt-BR.

## Stack

- **Frontend:** `index.html` + `css/styles.css` + `js/*.js` — vanilla JS em scripts clássicos (sem build step), organizados por concern: `state`, `ui`, `render`, `charts`, `actions`, `export`, `backup`, `extrato`, `auth`. Chart.js e SheetJS `xlsx` são vendorizados em `vendor/` e carregados sob demanda (`js/loader.js`).
- **Backend:** funções serverless da Vercel em `api/*.js` (CommonJS). Helpers compartilhados em `lib/`.
- **Auth:** JWT (`jsonwebtoken`), senha com `bcryptjs`, rate limiting por IP+usuário via KV/Upstash Redis.
- **Banco:** Postgres (Neon, via Vercel Marketplace) acessado com Drizzle ORM (`db/schema.js`). Migrações versionadas em `db/migrations/` (drizzle-kit). KV segue em uso só pra rate limiting (contador com TTL) — dados financeiros e credenciais moraram no KV até esta rodada e migraram pro Postgres, ver [ROADMAP.md](./ROADMAP.md) §6.

## Rodando localmente

```bash
npm install
vercel env pull --yes     # baixa .env.local com DATABASE_URL, JWT_SECRET, etc. do projeto na Vercel
npx dotenv -e .env.local -- npx drizzle-kit push   # aplica o schema no banco (1ª vez / após mudar db/schema.js)
npm run dev:vercel         # vercel dev — roda frontend + funções serverless localmente
```

Sem a Vercel CLI, `index.html` + `css/` + `js/` + `vendor/` são estáticos e podem
ser servidos por qualquer servidor de arquivos (ex: `npx serve .`) — nesse caso
só o modo demo (`?demo` na URL) funciona, já que ele não depende da API.

## Variáveis de ambiente

| Variável                                              | Obrigatória          | Descrição                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                        | Sim                  | Connection string do Postgres (Neon). Provisionada automaticamente ao instalar a integração Neon via Vercel Marketplace (`vercel integration add neon`); localmente, `vercel env pull` traz ela pro `.env.local`.                                                   |
| `JWT_SECRET`                                          | Sim em produção      | Segredo pra assinar/verificar tokens JWT. Sem ela, `lib/auth.js` recusa assinar/verificar tokens em produção (`VERCEL_ENV=production` ou `NODE_ENV=production`); fora de produção cai num valor de desenvolvimento inseguro só pra não travar o `vercel dev` local. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN`               | Sim (rate limiting)  | Credenciais do KV/Upstash Redis, usado só pra contadores de rate limit (login/register/forgot/reset/change) — não guarda mais dado financeiro nem credencial de usuário.                                                                                            |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Alternativa às acima | Mesma coisa, nome das variáveis quando o KV vem de uma integração Upstash direto do Marketplace.                                                                                                                                                                    |
| `GOOGLE_CLIENT_ID`                                    | Só pra login Google  | Client ID OAuth do Google usado pra validar o token no backend (`api/auth.js`, action `google`). Sem ela, login com Google responde 500. Ver "Login com Google" abaixo pra como criar.                                                                              |

### Login com Google

Não é uma integração do Vercel Marketplace — precisa ser criada manualmente no Google Cloud Console (passo humano, não automatizável):

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials → Create Credentials → OAuth client ID** → tipo **Web application**.
2. Em **Authorized JavaScript origins**, adicione a URL do app (ex: `https://seu-app.vercel.app` e `http://localhost:3000` pra dev local).
3. Copie o **Client ID** gerado (não precisa do Client Secret — o fluxo usado é Google Identity Services com ID token, verificado no backend).
4. Backend: `vercel env add GOOGLE_CLIENT_ID` (ou direto no dashboard) com esse valor.
5. Frontend: cole o mesmo Client ID em `GOOGLE_CLIENT_ID` no topo de `js/auth.js` (é público, não é segredo — só precisa bater com o do backend). Sem isso, o botão "Entrar com Google" não aparece.

## Scripts

| Comando                            | O que faz                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run dev:vercel`               | `vercel dev` — roda frontend + funções serverless localmente                                                      |
| `npm test`                         | Roda os testes (`node --test`) em `test/`                                                                         |
| `npm run lint` / `lint:fix`        | ESLint                                                                                                            |
| `npm run format` / `format:check`  | Prettier                                                                                                          |
| `npx drizzle-kit generate`         | Gera uma nova migration SQL a partir de mudanças em `db/schema.js`                                                |
| `npx drizzle-kit push`             | Aplica o schema atual direto no banco (útil em dev)                                                               |
| `node scripts/migrate-kv-to-pg.js` | Migração única KV→Postgres (dry-run por padrão, `--apply` pra rodar de verdade) — ver ROADMAP.md §6 antes de usar |

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
- Todo endpoint de dados valida entrada e escopa toda query por `user_id` do
  token — nunca confia em id de recurso sozinho sem checar o dono.
- CSP + headers de segurança em `vercel.json` — `script-src 'self'` (só é
  possível porque não há mais JS inline nem CDN externo).

## Estrutura

```
index.html          shell da SPA
css/styles.css       estilos
js/
  loader.js          carregamento sob demanda de libs externas
  state.js            constantes, estado global, cache + sync com a API
  ui.js                sidebar, navegação, tema
  render.js           desenho das páginas
  charts.js            gráficos (Chart.js, lazy)
  actions.js           modais e CRUD de lançamentos
  export.js            exportação Excel/PDF
  backup.js            backup/restore em JSON
  extrato.js           import de extrato bancário (OFX/CSV) + categorização
  auth.js               login/registro/sync com a API
vendor/              Chart.js e xlsx vendorizados (sem CDN)
api/                 funções serverless — auth (login/register/forgot/reset/change)
                     e CRUD por recurso (transactions/goals/investments/budgets/
                     import/export/restore/stats/clear-all)
db/
  schema.js           schema Drizzle (Postgres)
  client.js            client lazy (só conecta na 1ª query)
  migrations/          SQL versionado (drizzle-kit generate)
lib/
  auth.js              JWT, rate limiting, leitura de corpo com limite
  users.js             CRUD de usuário no Postgres
  resources.js         helpers de dinheiro (centavos) e resolução de categoria
scripts/
  migrate-kv-to-pg.js  migração única do blob no KV pras tabelas relacionais
test/                testes (node:test)
```

Veja também [ROADMAP.md](./ROADMAP.md) pras decisões de arquitetura, o que foi
feito nesta rodada e o que fica como próximo passo.
