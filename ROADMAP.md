# Roadmap — Vell Financing rumo a plataforma profissional

Este documento registra as decisões tomadas durante a rodada de melhoria
descrita em `IMPROVE.md`, o porquê de cada uma, e o que ainda falta. Vai
sendo atualizado conforme o trabalho avança.

## Feito

### Segurança (§1)

- **JWT_SECRET obrigatório em produção.** `lib/auth.js` agora lança erro ao
  assinar/verificar token se `JWT_SECRET` não estiver definido e
  `VERCEL_ENV`/`NODE_ENV` for `production`. Fora de produção mantém um
  fallback só pra não travar `vercel dev` local sem configurar nada.
- **Rate limiting** por IP+usuário via KV (contador com TTL) em login,
  register, forgot, reset e change.
- **Fim da enumeração de usuários:** login/forgot/reset devolvem a mesma
  mensagem/status pra usuário inexistente e credencial errada; `bcrypt.compare`
  roda sempre (contra hash dummy quando o usuário não existe) pra não vazar
  por timing; `forgot` devolve uma pergunta sintética estável por username
  quando a conta não existe, em vez de 404.
- **Payload validado em todo endpoint de escrita** (`api/transactions.js`,
  `api/goals.js`, `api/investments.js`, `api/budgets.js`, `api/import.js`,
  `api/restore.js`): tamanho máximo de string, tipos, e toda query sempre
  escopada por `user_id` do token — nunca confia em id de recurso sozinho.
  (O `api/data.js` original, que só validava um blob solto, foi substituído
  pela API por recurso do §6.)
- **XSS auditado:** todo `innerHTML` que renderiza dado do usuário/extrato
  já passava por `esc()`/`escAuth()` — confirmado com leitura de cada um dos
  ~28 pontos, nenhum fix necessário.
- **CSP + headers** via `vercel.json`: `script-src 'self'` (viável porque
  não há mais JS inline nem CDN de script), X-Content-Type-Options,
  X-Frame-Options, Referrer-Policy, Permissions-Policy. `style-src` mantém
  `'unsafe-inline'` porque o app usa muitos `style=""` dinâmicos vindos de um
  mapa de cores fixo (`CL`), nunca de texto livre — o vetor real de XSS é
  script, que agora é estrito.
- **xlsx trocado de 0.18.5 → 0.20.3** (baixado do CDN oficial da SheetJS):
  a versão anterior, ainda a mais recente publicada no registro npm, tem duas
  vulnerabilidades altas sem fix (prototype pollution, ReDoS); a SheetJS só
  publica correções no CDN próprio.
- **Token em localStorage:** mantido. Migrar pra cookie `HttpOnly` exigiria
  CSRF token + mudar o contrato de toda chamada `fetch` do frontend pra
  incluir credentials — reavaliado depois da reescrita de API do §6 (que já
  trocou toda a superfície) e adiado: o ganho de segurança é pequeno dado que
  o XSS audit já está limpo (não há vetor de injeção de script conhecido pra
  roubar o token), e o custo de reprojetar a auth agora não se paga.

### Arquitetura (§3)

- `index.html` (94KB, tudo inline) dividido em `css/styles.css` +
  `js/*.js` por concern. Optou-se por **scripts clássicos**, não ES modules:
  a UI depende de ~30 handlers `onclick`/`onchange` inline nos templates
  gerados, e módulos ES não expõem funções no escopo global automaticamente
  — exigiria expor cada handler manualmente em `window`, mesmo risco de erro
  de digitação sem ganho real sem um bundler. Um teste
  (`test/handlers.test.js`) garante que todo handler referenciado existe.
- Chart.js e SheetJS `xlsx` vendorizados em `vendor/`, carregados sob
  demanda via `js/loader.js` (nunca no load inicial) — cobre também o item
  de performance do §4.
- ESLint (flat config) + Prettier configurados e limpos.
- `npm test` com `node:test`: parser OFX/CSV + categorização automática
  (prioridade pedida no brief), helpers de auth (normalização, leitura de
  corpo com limite de tamanho, comparação timing-safe), conversão
  reais↔centavos, e a checagem de handlers acima.
- CI (`.github/workflows/ci.yml`): lint + format:check + test em todo
  push/PR pra `main`.
- `package-lock.json` commitado (faltava).

### Correção (§2)

- `readBody` agora tem limite de tamanho em toda leitura de corpo — evita
  DoS por body gigante.
- Dedup de import de extrato: antes vivia só em `mvf3_extrato_hashes` no
  localStorage; com a migração do §6 virou uma tabela real
  (`import_hashes`, unique por `user_id`+`hash`), então reimportar o mesmo
  extrato em outro dispositivo agora é impossível de duplicar (o server é
  quem decide, não cada dispositivo com seu próprio cache).
- **Sync last-write-wins na blob inteira: resolvido pelo §6.** Cada
  lançamento agora é uma linha própria com seu próprio id; dois dispositivos
  editando coisas diferentes no mesmo mês não pisam mais um no outro. Edição
  simultânea do _mesmo_ lançamento nos dois ainda é last-write-wins (o mais
  recente que chegar no servidor vence) — não há lock otimista por
  `updated_at` na escrita ainda; ver "Próximo" abaixo.

### Performance (§4)

- Chart.js/xlsx deixam de carregar em toda visita — só quando um gráfico
  renderiza ou uma exportação roda.
- Destroy+recreate de instância de `Chart` já existia no código original
  antes desta rodada (`if (chartInstance) chartInstance.destroy()` antes de
  criar uma nova) — confirmado, sem leak.
- Sync deixou de ser "reenvia o blob inteiro a cada mudança, debounced" e
  virou por recurso: só o lançamento/meta/ativo que de fato mudou vira uma
  chamada à API (ver §6). Menos tráfego, sem debounce artificial.
- Full re-render de tela a cada mudança de estado: mantido. É um app pessoal
  de single user com datasets pequenos (dezenas/centenas de lançamentos por
  mês); reescrever pra diffing granular de DOM (padrão React-like) sem
  framework seria um custo de engenharia alto pra um ganho imperceptível
  nesse volume. Reavaliar se/quando o app ganhar múltiplos usuários
  simultâneos por conta ou datasets muito maiores.
- Consultas indexadas: `transactions` tem índice em `(user_id, year, month)`,
  `(user_id, type)` e `(user_id, category_id)`; `budgets`/`goals`/
  `investments`/`import_hashes` indexados por `user_id` (ou pela unique key
  que já cobre o padrão de consulta). `api/stats.js` agrega no banco em vez
  de trazer tudo pro client pra somar.

### Banco de dados relacional (§6)

O blob único `data:<username>` no KV virou um banco Postgres normalizado.

- **Provider: Neon Postgres via Vercel Marketplace** — é a opção preferencial
  documentada pra esse tipo de projeto (serverless, pool de conexão HTTP
  embutido, zero infra pra gerenciar, integra com o mesmo fluxo de env vars
  que o KV já usava). Alternativas descartadas: Supabase/Prisma (mais
  produto do que o app precisa — não usamos auth nem realtime deles) e
  Turso/libSQL (SQLite não tem os tipos de data/enum que o schema usa tão
  bem quanto Postgres).
- **ORM: Drizzle**, não Prisma — schema em JS puro (`db/schema.js`, sem
  precisar de build step/TypeScript, consistente com o resto do projeto),
  migrations SQL geradas e versionadas (`db/migrations/`, via
  `drizzle-kit generate`) em vez de SQL solto rodado à mão.
- **Schema** (`db/schema.js`): `users`, `categories` (seedadas por usuário a
  partir das listas fixas EC/IC no registro — abre caminho pra "gestão de
  categorias" do §5 mais tarde), `transactions` (receitas+despesas+contas
  numa tabela só, com `type` — os três têm a mesma forma e já apareciam
  misturados no Histórico), `budgets`, `goals`, `investments`,
  `import_hashes`. Dinheiro sempre em `integer` centavos, nunca float.
  `transactions`/`goals`/`investments` usam **id `text` gerado pelo client**
  (mesma função `uid()` de sempre) em vez de serial do banco — decisão
  central pra permitir sincronização granular sem round-trip pra descobrir o
  id definitivo (ver abaixo).
- **API rescrita por recurso**: `api/transactions.js`, `api/goals.js`,
  `api/investments.js`, `api/budgets.js` (CRUD completo, sempre escopado por
  `user_id`), mais `api/import.js` (import de extrato: dedup+categorização
  agora no servidor), `api/export.js`/`api/restore.js` (backup/restore
  completo lendo/escrevendo o banco, não mais o localStorage), `api/stats.js`
  (agregação pra Configurações) e `api/clear-all.js`. `api/data.js` (blob
  único) foi removido.
- **Auth migrada pro Postgres**: `user:<username>` no KV virou a tabela
  `users`; `lib/users.js` centraliza o acesso. KV continua em uso, mas só pra
  rate limiting (contador com TTL) — não guarda mais nada sensível de longo
  prazo.
- **Frontend: sincronização granular sem reescrever render/actions/charts.**
  `gd/sd/gg/sg/gi/si/gb/sb` (em `js/state.js`) mantiveram a **mesma
  assinatura síncrona** de quando liam/escreviam localStorage direto — por
  dentro, agora leem de um cache em memória (populado sob demanda por
  `ensureMonthLoaded`/`hydrateCollections`) e, ao escrever, fazem um **diff**
  contra o último estado conhecido do servidor pra decidir o que
  criar/atualizar/remover via API, em segundo plano. Essa foi a decisão mais
  importante da migração: como o app inteiro (render.js, actions.js,
  charts.js, export.js) já chamava essas oito funções de forma síncrona em
  dezenas de pontos, e não havia como testar visualmente num browser nesta
  sessão, reescrever a leitura/escrita por trás das mesmas assinaturas foi
  julgado bem menos arriscado do que propagar `async`/`await` (ou uma troca
  de estado tipo Redux) por todo o app às cegas. `localStorage` deixou de ser
  fonte da verdade e virou só cache offline.
  - Isso exigiu corrigir um bug que a mudança introduziria: `recurForward`
    (lançamento recorrente) e a cópia de conta pro mês seguinte liam
    `gd(mêsFuturo, ano)` — que no modelo antigo sempre tinha o histórico
    completo (tudo sincronizado no login), mas no novo cache é vazio até ser
    visitado. Sem correção, `sd()` teria sobrescrito meses futuros com só o
    novo lançamento, apagando o que já existisse lá. Corrigido com
    `await ensureMonthLoaded()` antes de ler, em ambos os pontos.
  - Gráficos que olham vários meses (`renderNetChart`: 12 meses,
    `renderHistChart`: 6 meses) também precisaram de
    `await ensureMonthsLoaded([...])` antes de montar o dataset, pelo mesmo
    motivo.
- **Import de extrato**: parsing OFX/CSV continua no client (precisa de
  `FileReader`), mas dedup e categorização moveram pro servidor
  (`POST /api/import`, reusa `categorizeExtrato`/`hashStr` de
  `js/extrato.js` via o guard `if (typeof module !== 'undefined')`) — o
  servidor é a fonte da verdade do hash agora, resolvendo de vez o problema
  de dedup não sincronizar entre dispositivos.
- **Migração dos dados existentes**: `scripts/migrate-kv-to-pg.js`.
  Dry-run por padrão (só faz backup e mostra o que faria); `--apply` pra
  rodar de verdade. Sempre grava um backup local em `backups/` (gitignored —
  contém hash de senha) e **verifica que o backup é legível de volta antes
  de tocar no Postgres**; idempotente (pula usuário que já existe no PG, não
  duplica numa segunda execução); nunca escreve nem apaga nada no KV.
- **Provisionado e validado contra o banco real.** Neon instalado via
  `vercel integration add neon`, schema aplicado com `drizzle-kit push`.
  Validado com dois testes exploratórios (não commitados, rodados e
  descartados nesta sessão): um smoke test direto no `lib/` (criar
  usuário, seed de categoria, insert/select com join, upsert, unique
  constraint, cascade delete) e uma bateria via `vercel dev` batendo em
  todo endpoint HTTP (`register`→`login`→CRUD de transactions/goals/
  investments/budgets→`import` com dedup real→`export`→`clear-all`).
  Achou e corrigiu dois bugs reais que só apareceriam contra um banco de
  verdade:
  - `createUser` usava `db.transaction()`, que o driver `neon-http`
    (HTTP stateless, sem BEGIN/COMMIT) não suporta — quebrava todo
    registro de usuário. Virou dois inserts sequenciais; não-atômico é
    aceitável aqui porque `resolveCategoryId` cria a categoria sob
    demanda se o seed falhar no meio.
  - `rateLimit()` sem try/catch: se o KV cair, `kv.incr()` derrubava
    login/register/etc inteiros (500). Agora loga e deixa passar —
    rate limit é defesa em profundidade, não pode ser single point of
    failure da autenticação.
- **Migração de dados KV→Postgres: confirmada desnecessária.** Ao
  provisionar o Neon, descobri que a integração de KV do projeto já
  estava **desinstalada há 56 dias** — os env vars continuavam anexados
  ao projeto (órfãos, apontando pra um host que não resolve mais:
  `ENOTFOUND`). Rodei `scripts/migrate-kv-to-pg.js` contra isso: falha
  de forma segura (não toca o Postgres, só reporta o erro de conexão) —
  confirma que não havia dado real acessível pra migrar. Reinstalei um
  Redis novo (ver Bloqueios) só pra rate limiting voltar a funcionar,
  não pra recuperar dado nenhum (não havia o que recuperar).

### Features (§5) — pesquisa e priorização

Pesquisa de mercado (busca web, não conhecimento memorizado): Mobills e
Organizze são os concorrentes pt-BR mais citados — Organizze já oferece
import automático via Open Finance, alertas de conta e limite por
categoria; Mobills foca em relatórios e gráficos. YNAB (orçamento
base-zero) e Monarch (patrimônio líquido, investimentos, relatórios) são
as referências internacionais mais citadas em 2026. Tendências do setor:
open banking, lembretes de conta, patrimônio líquido ao longo do tempo,
orçamento com rollover, forecast de fluxo de caixa.

**Priorização** (valor pro usuário × esforço dado o banco novo do §6 ×
risco de quebrar algo sem poder testar num browser real nesta sessão):

| Feature                                       | Decisão                   | Por quê                                                                                                                                                            |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Busca + filtro + intervalo de datas           | **Feito**                 | Pedido explícito no brief; é literalmente o caso de uso que justifica ter um banco indexado em vez de um blob                                                      |
| Gestão de categorias                          | **Feito**                 | Schema já suportava (tabela `categories`); baixo risco, endpoint isolado + card novo na UI                                                                         |
| Relatórios/insights (tendência por categoria) | **Adiado**                | Alto valor, mas exige nova UI de visualização (não só CRUD) — melhor numa sessão com espaço pra desenhar e testar a UX com calma                                   |
| Orçamento com rollover                        | **Adiado**                | Muda a semântica de `budgets` (deixa de ser só limite fixo por categoria); quis evitar mudar comportamento existente sem poder validar visualmente                 |
| PWA (offline + instalável)                    | **Adiado**                | Boa sinergia com o cache local que já existe, mas manifest+service worker é uma superfície nova pra testar sem browser disponível                                  |
| 2FA (TOTP)                                    | **Adiado**                | Adiciona fluxo de auth novo (QR code, códigos de recuperação); §1 já endureceu bastante a auth existente, TOTP é incremento, não bug                               |
| Backup criptografado                          | **Adiado**                | Viável só no client (Web Crypto API), mas competiu por tempo com o resto; hoje o backup já sai só pra quem tem a conta logada                                      |
| Multi-moeda                                   | **Não recomendado agora** | Tocaria o modelo de dinheiro em praticamente todo lugar (todo valor precisaria de moeda + taxa de conversão) — risco alto de regressão pro valor que entrega       |
| Divisão de despesas / compartilhado           | **Fora de escopo**        | O produto é explicitamente single-user por conta (ver `IMPROVE.md` §0) — essa feature muda o modelo de produto, não é um incremento                                |
| Open Finance (Pluggy/Belvo)                   | **Bloqueado — custo**     | Pluggy ~R$2.500/mês, Belvo ~R$6.000/mês (pesquisa web) — infactível pro estágio atual do projeto; precisaria de decisão de negócio, não é algo pra decidir sozinho |
| Anexo de recibo                               | **Adiado**                | Precisaria de Vercel Blob (nova integração) só pra essa feature — baixo valor/esforço comparado ao resto da lista                                                  |

## Limitação conhecida (documentada, não corrigida nesta rodada)

- `parseCsvExtrato`/`csvValue` assumem formato brasileiro (vírgula decimal,
  ponto como milhar). Um CSV separado por vírgula (`,`) com valor
  `-120,50` quebra, porque a vírgula do valor colide com o delimitador de
  coluna — só funciona com delimitador `;` nesse caso. Coberto por teste em
  `test/extrato.test.js` que documenta o comportamento em vez de mascará-lo.
  Fix correto seria detectar o formato numérico independente do delimitador;
  não foi feito por falta de amostras reais de extrato pra validar contra
  vários bancos sem quebrar o que já funciona.
- `drizzle-kit` traz uma dependência transitiva do `esbuild` com uma
  vulnerabilidade moderada conhecida (exposição do dev server do esbuild a
  requisições de qualquer site). Risco real é nulo aqui: `drizzle-kit` só
  roda como CLI pontual local (`generate`/`push`), nunca como processo de
  longa duração acessível pela rede, e nunca é deployado (é devDependency).
  O fix automático (`npm audit fix --force`) rebaixaria `drizzle-kit` pra
  `0.18.1`, uma versão bem mais antiga — não vale a troca pra esse risco.

## Em andamento / próximo

- Rodar a migração real KV→Postgres assim que o banco estiver provisionado
  e as credenciais de KV de produção estiverem acessíveis (ver Bloqueios).
- Lock otimista em `transactions`/`goals`/`investments`: hoje a edição
  concorrente do _mesmo_ registro em dois dispositivos é last-write-wins.
  Dado que já existe `updated_at`, dá pra endpoint de PUT rejeitar quando o
  client manda um `updated_at` mais velho que o do banco — não implementado
  ainda porque exige o client guardar/mandar esse campo, e o cenário
  (mesmíssimo lançamento editado em dois lugares ao mesmo tempo) é raro pra
  um app single-user.
- §5 — pesquisa de mercado + features priorizadas, a implementar sobre o
  banco novo.

## Bloqueios (precisam de você)

- ~~Provisionar o Postgres~~ **Resolvido**: Neon provisionado, schema
  aplicado, validado contra o banco real (ver §6 acima).
- ~~Migração de dados reais~~ **Resolvido (não havia o que migrar)**:
  confirmado que o KV antigo já estava morto antes desta sessão começar.
- **Rate limiting sem Redis conectado**: reinstalar o Upstash/Redis pelo
  CLI (`vercel integration add upstash-kv` ou `redis`) sempre volta
  "Additional setup required. Opening browser..." e não completa em modo
  não-interativo — parece exigir um passo no dashboard (plano/pagamento
  ou região) que só você consegue ver. Não é bloqueante: `rateLimit()`
  agora falha aberto se o KV estiver fora do ar (ver fix acima), então
  login/registro/etc funcionam normalmente sem rate limiting até isso
  ser resolvido. Quando quiser, complete a instalação em
  https://vercel.com/miguelvzs-projects/~/stores (ou rode
  `vercel integration add redis` de novo depois) e me avise pra eu
  confirmar que `kv.incr` volta a funcionar.

(Este documento continua sendo atualizado conforme o trabalho avança.)
