# Roadmap — MV Financing rumo a plataforma profissional

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
- **Payload de `data.js` validado:** whitelist de chaves `mvf3_*`, limite de
  tamanho por chave e total, limite de quantidade de chaves.
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
- **Token em localStorage:** mantido por ora. Migrar pra cookie `HttpOnly`
  exigiria reprojetar toda superfície de API (CSRF token, mudança de contrato
  em todo endpoint) — decidiu-se fazer isso junto da reescrita de API do §6,
  não isoladamente, já que ali toda a superfície muda de qualquer forma.

### Arquitetura (§3, parcial)

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
  corpo com limite de tamanho, comparação timing-safe), e a checagem de
  handlers acima.
- CI (`.github/workflows/ci.yml`): lint + format:check + test em todo
  push/PR pra `main`.
- `package-lock.json` commitado (faltava).

### Correção (§2)

- `readBody` agora tem limite de tamanho em toda leitura de corpo — evita
  DoS por body gigante.
- Dedup de import de extrato (`mvf3_extrato_hashes`) **já era sincronizado**
  entre dispositivos: `sd()` dispara `syncPush()`, que lê o `localStorage`
  inteiro (incluindo os hashes) e envia pro blob. O item do brief que dizia
  "dedup é só local" não procede no código atual — confirmado lendo o fluxo
  de `importExtrato` → `saveExtratoHashes` → `syncPush`. Isso deixa de valer
  na migração pro banco relacional (§6), onde `import_hashes` vira tabela
  própria por design.
- Sync last-write-wins na blob inteira: mantido por ora, será resolvido pela
  migração pra linhas por recurso no §6 (cada endpoint grava só o que mudou).

### Performance (§4, parcial)

- Chart.js/xlsx deixam de carregar em toda visita — só quando um gráfico
  renderiza ou uma exportação roda.
- Destroy+recreate de instância de `Chart` já existia no código original
  antes desta rodada (`if (chartInstance) chartInstance.destroy()` antes de
  criar uma nova) — confirmado, sem leak.
- Full re-render a cada mudança de estado: mantido. É um app pessoal de
  single user com datasets pequenos (dezenas/centenas de lançamentos por
  mês); reescrever pra diffing granular (padrão React-like) sem framework
  seria um custo de engenharia alto pra um ganho imperceptível nesse volume
  de dados. Reavaliar se/quando o app ganhar múltiplos usuários simultâneos
  por conta ou datasets muito maiores.

## Limitação conhecida (documentada, não corrigida nesta rodada)

- `parseCsvExtrato`/`csvValue` assumem formato brasileiro (vírgula decimal,
  ponto como milhar). Um CSV separado por vírgula (`,`) com valor
  `-120,50` quebra, porque a vírgula do valor colide com o delimitador de
  coluna — só funciona com delimitador `;` nesse caso. Coberto por teste em
  `test/extrato.test.js` que documenta o comportamento em vez de mascará-lo.
  Fix correto seria detectar o formato numérico independente do delimitador;
  não foi feito por falta de amostras reais de extrato pra validar contra
  vários bancos sem quebrar o que já funciona.

## Em andamento / próximo

- §6 — migração pra banco relacional real (substituindo o blob único no KV).
- §5 — pesquisa de mercado + features priorizadas.

(Este documento continua sendo atualizado conforme o trabalho avança.)
