# Content Recommender — Auditoria: erros, correções sugeridas e melhorias

> Revisão do código em `e397ccb`. 🔎 = leitura de código, 🧪 = reproduzido.
> O app depende de `CoverMaker/js/jellyfin.js` e de vários arquivos de `jeffersoncgo/cdn`; os problemas dessas bibliotecas
> estão em `CoverMaker/docs/AUDITORIA.md` (`CM-xx`) e `cdn/docs/AUDITORIA.md` (`CDN-xx`).

## Resumo

| ID | Sev. | Onde | Problema |
|---|---|---|---|
| CR-01 | Alta | `script.js:190` | Histórico "assistido" congela no primeiro carregamento (cache sem atualização de `UserData`) 🔎 |
| CR-02 | Alta | dependência `jellyfin.js` | Servidores com plugin Meilisearch: itens chegam sem `UserData` (nada "assistido") ou bibliotecas nem carregam 🔎 |
| CR-03 | Alta | `script.js:64-71` | XSS: nome do item interpolado em `innerHTML` e em atributo 🔎 |
| CR-04 | Alta | `script.js:251`, `index.html:43` | Senha em texto puro no `localStorage` e no IndexedDB (origem compartilhada) 🔎 |
| CR-05 | Alta | `index.html:59-68` | Scripts remotos de outros repositórios sem versão nem SRI 🔎 |
| CR-06 | Média | `findSimilar.js:102-121,411-427` | Perfil de gosto "estrito" praticamente vira só "nota > X" 🧪/🔎 |
| CR-07 | Média | `findSimilar.js:1-12`, `README.md` | Atores/diretores/estúdios/nota da crítica não entram no cálculo (README diz que entram) 🔎 |
| CR-08 | Média | `script_infinity_scroll.js`, `script.js:98-100` | Scroll dispara lotes concorrentes; resultado vazio apaga a página inteira 🔎 |
| CR-09 | Média | `script.js:211-214` | Filtro de tipos (`IncludeItemsTypes`) nunca é aplicado 🔎 |
| CR-10 | Média | `script.js:69,144,233` | Exceções: `CommunityRating` nulo, Load More no modo não estrito, limpar memória sem login 🔎 |
| CR-11 | Baixa | `findSimilar.js:127-133,232`, `jellyfin.js:662-664` | Títulos não-ASCII perdem tokens; sorteio enviesado; `isPlayed` com campo errado 🔎 |
| CR-12 | Baixa | `findSimilar.js:387,430,451`, `style.css:255-258` | Imagem pedida em 480×270 e exibida em cartão retrato 180×270 🔎 |
| CR-13 | Baixa | `README.md`, `index.html` | Documentação e pequenos detalhes de HTML/acessibilidade 🔎 |

---

### CR-01 — Status "assistido" não atualiza (Alta) 🔎

`new Jellyfin(server, username, password, eventos)` (`script.js:190`) não passa o 5º argumento `needsUserData`
(padrão `false`). No `jellyfin.js`, quando a biblioteca está em cache com a mesma contagem de itens, ela é carregada do
IndexedDB e `updateLibraryUserData` retorna sem fazer nada se `needsUserData` for falso. Resultado: o que foi
assistido depois da primeira carga **não** é reconhecido — o app continua recomendando itens já vistos e o perfil
de gosto não evolui, até a quantidade de itens da biblioteca mudar ou o usuário limpar a memória.

```js
window.jellyfin = new Jellyfin(server, username, password, { … }, /* needsUserData */ true);
```

Como o cache é compartilhado com o CoverMaker (mesma origem, mesmo banco `<Server.Id>`), vale também gravar a data
da última atualização de `UserData` e usar `minDateLastSavedForUser` para buscar só o que mudou.

### CR-02 — Meilisearch (Alta) 🔎

Quando o servidor tem o plugin Meilisearch, `jellyfin.js` carrega os itens pelo Meilisearch
(`loadLibraryItemsMeiliSearch`), que **não traz `UserData`** → `isPlayed` é falso para tudo → "Watch some Contents to
get recommendations!". Para usuários não administradores, a inicialização do Meilisearch falha e as bibliotecas não
carregam (detalhes em `CM-08`). Correções: com CR-01 aplicado, `updateLibraryUserData` preenche o `UserData`
depois da carga; e no `jellyfin.js`, cair para a carga "vanilla" quando o Meilisearch falhar.

### CR-03 — XSS nos cartões (Alta) 🔎

```js
ContentCard.innerHTML = `<img src="${imageUrl}" alt="${Content.Name} cover" …> … <h3>${Content.Name}</h3>`;
```

Nomes vêm de metadados (NFO, *scrapers*, edição manual). Um título com `"` quebra o atributo `alt` e permite injetar
`onerror=…`. Monte com DOM:

```js
const img = document.createElement('img');
img.src = Content.ImageUrl || noImage;
img.alt = `${Content.Name} cover`;
img.onerror = () => { img.onerror = null; img.src = noImage; };
const h3 = document.createElement('h3'); h3.textContent = Content.Name;
```

O mesmo vale para `showLoadingLibraries` e `addVideoposter` do `jellyfin.js` (ver `CM-06`).

### CR-04 — Credenciais (Alta) 🔎

`saveFieldsToStorage` grava `localStorage.password` e `#Password` tem `save` (o `pageMemory` grava o valor no
IndexedDB). Os campos vêm pré-preenchidos com `admin`/`password`. Como os apps do usuário `jeffersoncgo` no GitHub Pages
compartilham a origem, qualquer página em `jeffersoncgo.github.io` lê essas chaves. Guarde só o `AccessToken` retornado
pelo login (e o `UserId`), não a senha; deixe os campos vazios por padrão.

### CR-05 — Dependências remotas sem versão (Alta) 🔎

`index.html:59-68` carrega `cdn/js/*.js` e `CoverMaker/js/jellyfin.js` direto do `main` publicado. Qualquer
refatoração nesses repositórios (renomear um método, mudar a assinatura do construtor de `Jellyfin`, trocar
`Controller.wrap`) quebra este app sem aviso, e não há SRI. Opções, da mais simples à mais robusta:

1. Copiar os arquivos para `vendor/` (como o CoverMaker faz) e atualizar conscientemente.
2. Fixar por commit/tag via jsDelivr: `https://cdn.jsdelivr.net/gh/jeffersoncgo/cdn@<tag>/js/controller.js` + `integrity`.
3. Extrair `jellyfin.js` para o repositório `cdn` (é uma biblioteca compartilhada, não código do CoverMaker) e versioná-lo.

### CR-06 — Busca "estrita" por gosto (Média) 🧪/🔎

`extractSearchProfileFromWatched` e o uso do `SearchEngine` têm vários desencontros:

- `operator: 'between'` (linha 118) não existe no `SearchEngine` (que usa `'..'`): o filtro de ano é ignorado.
- `operator: 'all'` com os **7** gêneros mais frequentes exige que um item tenha os 7 ao mesmo tempo — praticamente
  nenhum tem; o mesmo para as 7 tags. Na prática só o filtro de nota (`>`) pontua.
- `search(…, sort, useSingleAppearance)` (linhas 418 e 427): o 4º parâmetro do `SearchEngine.search` é `isLaxQuery`,
  não `useSingleAppearance`.
- A ordenação pedida (`CommunityRating desc, ProductionYear desc`) não acontece por causa de `CDN-05` (verificado em Node).
- `extractSearchProfileFromWatched(watched, 7)` (linha 411) usa a global implícita `watched` em vez do parâmetro
  `watchedContents`.
- `window.tasteProfile ??=` e `window.profileQueries ??=` fazem o perfil nunca ser recalculado no modo não estrito.

Sugestão:

```js
profile.push({ operator: 'any', fields: ['Genres'], queries: top(genreFreq, 3) });
profile.push({ operator: '..',  fields: ['ProductionYear'], queries: [avgYear - 5, avgYear + 5] });
…
const recs = searchEngine.search(unwatchedContents, profileQueries, undefined, /* isLaxQuery */ true);
```

### CR-07 — Pesos declarados e não usados (Média) 🔎

`WEIGHTS.CRITIC_RATING`, `ACTOR`, `DIRECTOR_WRITER` e `STUDIO` não são usados em `calculateSimilarity`, e o cliente
Jellyfin nem pede `People`/`CriticRating`/`Studios` com `Fields` suficientes. O README descreve o cálculo com esses
fatores. Ou implementar (pedir `Fields=People,Studios,CriticRating` e somar Jaccard de pessoas/estúdios), ou remover
do README e do objeto `WEIGHTS`.

### CR-08 — Scroll infinito (Média) 🔎

- O listener de `scroll` não tem trava de "carregando": cada evento perto do fim chama `getSugestions` de novo →
  vários lotes simultâneos e grupos repetidos/desordenados. Use uma flag (`if (loading) return; loading = true; … finally loading = false`)
  ou `IntersectionObserver` num sentinela no fim da lista.
- `displayRecommendations([])` faz `recommendationsContainer.innerHTML = '…No recommendations found…'`, apagando também
  a seção de gosto e os grupos já exibidos. Para lotes adicionais, apenas não acrescente nada.
- A primeira carga usa `useSingleAppearance = false` e o scroll usa o padrão `true`.

### CR-09 — Filtro de tipos nunca aplicado (Média) 🔎

`onLoginSuccess` só define `IncludeItemsTypes = ["Audio", "Video", "Book", "Movie", "Series"]` se
`window.jellyfin.onLibraryLoad` existir — mas `onLibraryLoad` é um evento (`jellyfin.events.onLibraryLoad`), não um
método. A atribuição nunca acontece. Defina `IncludeItemsTypes` logo após criar a instância (antes de `getLibraries`).

### CR-10 — Exceções (Média) 🔎

- `Content.CommunityRating !== undefined ? Content.CommunityRating.toFixed(2)` (linha 69) quebra com `null`, e o erro
  substitui todo o contêiner pela mensagem de erro. Use `Number.isFinite(Content.CommunityRating)`.
- **Load More** (linha 144) lê `window.recommendations.length`, que só existe no modo estrito.
- **Clean Saved Memory** sem login: `jellyfin` não existe → `ReferenceError` (linha 233). Use `window.jellyfin?.cleanDb()`
  e limpe também `localStorage`/`pageMemory`.
- `ContentGrid` (linha 136) é atribuída sem declaração (global implícita).

### CR-11 — Detalhes do algoritmo (Baixa) 🔎

- `tokenizeName` remove tudo fora de `a-z0-9`: "Ação" vira `"ao"`, títulos em japonês/coreano ficam sem tokens.
  Use `name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u)`.
- `selectRandomContents` usa `sort(() => 0.5 - Math.random())` (distribuição enviesada); use Fisher-Yates.
- `usedWatchedIds`/`usedUnwatchedIds` são globais e nunca são zerados (trocar de usuário/servidor herda o estado).
- `jellyfin.isPlayed` compara `item.CollectionType != "BoxSet"`, mas itens têm `Type`; e `PlayedPercentage` não é
  guardado no cache, então a regra "≥ 70 %" nunca vale.
- `makeContentUrl` usa `Server.ExternalAddress` mesmo quando o app escolheu o endereço local como o mais rápido.

### CR-12 — Tamanho das imagens (Baixa) 🔎

`jellyfin.makeImageUrl(Content.Id)` usa o padrão `480×270` (paisagem) e o cartão exibe a imagem em retrato
(~180×270, `object-fit: cover`). Peça a proporção do cartão, por exemplo `makeImageUrl(Content.Id, 360, 540, 80)`.
`noImage` depende de `placehold.co`; um SVG local evita a requisição externa.

### CR-13 — Documentação e HTML (Baixa) 🔎

- README: descreve atores/diretores/estúdios/nota da crítica no cálculo (CR-07); o `git clone` usa
  `Content-recommender` (o repositório é `content-recommender`); não menciona as dependências remotas nem o Meilisearch.
- `index.html:58` comentário com erro ("Scripts should bered…"); a janela de login tem `role="dialog"`/`aria-modal`
  mas sem gestão de foco; o botão "Clean Saved Memory" não pede confirmação.
- Os cartões têm `tabindex="0"` mas nenhum `role="link"`; prefira envolver o cartão num `<a href>`.

---

## Melhorias recomendadas

1. **Fixar dependências** (CR-05) e, idealmente, mover `jellyfin.js` para o `cdn` versionado.
2. **Dados certos**: `needsUserData = true`, pedir `Fields=People,Studios,CriticRating,UserData`, e sincronização
   incremental por `minDateLastSavedForUser`.
3. **Explicar a recomendação**: mostrar no cartão por que foi recomendado (gêneros/tags em comum, mesmo diretor),
   o que também ajuda a calibrar `WEIGHTS`.
4. **Configuração na UI**: âncoras, itens por âncora, limiar e pesos editáveis (salvos no `localStorage`).
5. **Filtrar por biblioteca/tipo** (filmes × séries) e excluir itens com `UserData.IsFavorite`/já iniciados, se desejado.
6. **Testes do algoritmo**: `findSimilar.js` é puro (exceto `jellyfin.makeImageUrl`); injete a função de URL e teste
   com um catálogo fixo em `node --test`.
