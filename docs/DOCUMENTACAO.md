# Content Recommender — Documentação técnica

> Escrito a partir do código-fonte (revisão `e397ccb`). Problemas e correções sugeridas em [`AUDITORIA.md`](AUDITORIA.md).

## 1. Visão geral

Página estática que se conecta a um servidor **Jellyfin**, separa o que o usuário já assistiu do que ainda não
assistiu e mostra recomendações em duas seções:

1. **"Based on Your General Watched Content"** — perfil de gosto agregado (gêneros/tags) aplicado a todo o catálogo
   não assistido; botão **Load More**.
2. **"Because you watched X"** — para alguns títulos assistidos escolhidos ao acaso, os itens não assistidos mais
   parecidos; mais grupos aparecem com *scroll* infinito.

Publicado em `https://jeffersoncgo.github.io/content-recommender/`. Não há build nem backend.

## 2. Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | Cabeçalho, janela de login (`#loginBox`), contêiner de recomendações e carregamento dos scripts |
| `style.css` | Tema escuro, grade de cartões responsiva (≤ 768 px e ≤ 480 px) |
| `script.js` | Login, coleta de assistidos/não assistidos, renderização dos cartões |
| `findSimilar.js` | Algoritmos de similaridade e de gosto |
| `script_infinity_scroll.js` | Busca mais grupos "Because you watched" ao chegar perto do fim da página |

### Dependências carregadas em tempo de execução (sem versão fixa)

```
https://jeffersoncgo.github.io/cdn/js/common.js        utils, extensões de String/Array
https://jeffersoncgo.github.io/cdn/js/base.js          JCGWeb
https://jeffersoncgo.github.io/cdn/js/object.js        searchInArray (usado pelo cliente Jellyfin)
https://jeffersoncgo.github.io/cdn/js/controller.js    Controller (debounce do searchItems)
https://jeffersoncgo.github.io/cdn/js/observer.js      Observer (usado pelo pageMemory)
https://jeffersoncgo.github.io/cdn/js/pagememory.js    persistência dos campos de login
https://jeffersoncgo.github.io/CoverMaker/js/windowsHandle.js   showWindow/hideWindow
https://jeffersoncgo.github.io/cdn/js/fetchqueue.js    FetchQueue
https://jeffersoncgo.github.io/CoverMaker/js/jellyfin.js        classe Jellyfin (API + cache IndexedDB + Meilisearch)
https://jeffersoncgo.github.io/cdn/js/search.js        SearchEngine (recomendação por gosto, modo estrito)
https://cdnjs.cloudflare.com/.../font-awesome/6.7.2    ícones (com SRI)
```

Qualquer push em `main` dos repositórios `cdn` e `CoverMaker` altera este app imediatamente.

## 3. Fluxo

```
carregamento
 ├─ loadFieldsFromStorage()                       servidor (+ usuário/senha só de versões antigas, usados 1 vez)
 └─ DOMContentLoaded
     ├─ sessão salva (Jellyfin.getSavedAuth) ou credenciais antigas? → InitializeJellyfin() │ senão → mostra #loginBox
     └─ new pageMemory().init()                    restaura campos [save]

InitializeJellyfin(explicitLogin)                  explicitLogin = botão Connect
 └─ new Jellyfin(server, user, pass, eventos, false, { preferCredentials: explicitLogin })
     │                                             (classe do CoverMaker: login por token ou senha, getLibraries, cache)
     ├─ onLoginSuccess → forgetSavedPassword()     apaga usuário/senha antigos; mostra "Sign out"
     └─ Sign out → jellyfin.logout() + recarrega   POST /Sessions/Logout, apaga a sessão salva
     └─ onLibraryLoad
         ├─ updateTestesSugestions(true)           seção "Based on Your General Watched Content"
         └─ updateRecommendations()                seção "Because you watched" (3 âncoras × 6 itens)
```

`getList(…, 'Played'|'Unplayed')` define `searchParams.PlayedOnly/UnplayedOnly`, `limit = 999999` e chama
`jellyfin.searchItems('', '', {})`, que junta os itens de todas as bibliotecas carregadas e filtra com
`jellyfin.isPlayed(item)` (`UserData.Played` ou `PlayCount > 0`).

Cada cartão abre `${Server.ExternalAddress}/web/#/details?id=<Id>&serverId=<ServerId>` em nova aba
(clique, Enter ou Espaço).

## 4. Algoritmo "Because you watched" (`findSimilar`)

`findSimilar(assistidos, naoAssistidos, numeroDeAncoras = 10, porAncora = 7, useSingleAppearance = true)`

1. Remove dos não assistidos os que têm `UserData.Played`.
2. **Raridade** de cada gênero/tag no catálogo inteiro: `log((N + 1) / (freq + 1))` (estilo IDF).
3. Sorteia uma âncora assistida ainda não usada (`usedWatchedIds`, global entre chamadas) e pontua cada candidato:

| Componente | Cálculo | Peso (`WEIGHTS`) |
|---|---|---|
| Gêneros | Jaccard ponderado pela raridade: `Σ raridade(comuns) / Σ raridade(união)` | `GENRE = 4` |
| Tags | idem | `TAG = 4` |
| Nota da comunidade | `max(0, 1 − |Δ| / 10)` (só se os dois tiverem nota) | `COMMUNITY_RATING = 3` |
| Ano | `max(0, 1 − |Δ| / 80)` (só se os dois tiverem ano) | `PRODUCTION_YEAR = 2` |
| Palavras do título | `|comuns| / max(|A|, |B|)` (tokens a-z0-9, sem "the/part/season/episode") | `NAME = 3` |
| Prefixo do título | +peso se um título começa com o outro | `START_WITH = 6` |

   `score = Σ(componente × peso) / Σ(pesos aplicáveis) × 100`. Ficam os candidatos com `score > 15`, ordenados, até `porAncora`.
   `CRITIC_RATING`, `ACTOR`, `DIRECTOR_WRITER` e `STUDIO` estão declarados mas **não são usados**.
4. Com `useSingleAppearance = true`, um item recomendado não volta a aparecer para outra âncora (`usedUnwatchedIds`).
5. Repete até ter `numeroDeAncoras` grupos ou esgotar as tentativas (`2 × assistidos`).

Saída: `[{ Name, Id, Recommendations: [{ Name, Id, Genres, CommunityRating, ProductionYear, similarityScore, ImageUrl }] }]`.

## 5. Algoritmo "por gosto" (`getTasteBasedContentfindSimilar`)

**Perfil de gosto** (`buildTasteProfile`): proporção de cada gênero e tag entre os itens assistidos.

**Pontuação** (`computeTasteSimilarity`):

```
genreScore = Σ proporção(gênero do item)
tagScore   = Σ proporção(tag do item) × 1,25
penalidade = 0,85 ^ (nºGêneros − 4)   se o item tiver mais de 4 gêneros, senão 1
score      = min(1, (0,65 × genreScore + 0,35 × tagScore) × penalidade) × 100
```

- **Modo não estrito**: pontua todo o catálogo não assistido, devolve os `limite` melhores.
- **Modo estrito** (usado pelo app): monta consultas de busca a partir dos assistidos
  (`extractSearchProfileFromWatched`: 7 gêneros e 7 tags mais frequentes com operador `all`, ano médio ± 5,
  nota > `max(média − 0,5, 6)`), filtra os assistidos com o `SearchEngine`, recalcula o perfil sobre esse subconjunto,
  filtra os não assistidos com as novas consultas e ordena pela pontuação acima. O resultado completo fica em
  `window.recommendations` e o botão **Load More** exibe mais 6 por clique.

## 6. Configuração

| O quê | Onde |
|---|---|
| Pesos da similaridade | `WEIGHTS` em `findSimilar.js` |
| Ano máximo considerado | `MAX_YEAR_DIFF = 80` |
| Limiar mínimo | `similarityScore > 15` em `findSimilarForOne` |
| Âncoras e itens por âncora | `ContentsToCheck = 3`, `similarsToShow = 6` em `script.js` |
| Itens por clique em Load More | `similarsToShow` |
| Imagem padrão | `noImage` (placehold.co) |

## 7. Armazenamento

| Onde | Chave | Conteúdo |
|---|---|---|
| `localStorage` | `server` | Endereço do servidor |
| `localStorage` | `jellyfinAuth` | Sessão `{ server, serverId, userId, token }` (classe `Jellyfin`; nunca a senha) |
| `localStorage` | `username`, `password` | Só de versões antigas: usados uma vez para obter o token e apagados |
| IndexedDB `pageMemoryDB` | URL da página | Campos `[save]` (só o servidor; usuário e senha não são mais salvos) |
| IndexedDB `<Server.Id>` | `Tags`, `Genres`, `Studios`, `<libraryId>` | Cache de bibliotecas (classe `Jellyfin`) |

Como CoverMaker e este app estão na mesma origem (`jeffersoncgo.github.io`), esses dados são **compartilhados** entre eles.
**Clean Saved Memory** chama `jellyfin.cleanDb()` (apaga o cache do Jellyfin e recarrega).

## 8. Rodar localmente

```bash
git clone https://github.com/jeffersoncgo/content-recommender.git
cd content-recommender
python3 -m http.server 8080    # abrir http://localhost:8080/
```

O navegador precisa alcançar o Jellyfin diretamente (mesma rede/VPN) e o servidor precisa permitir CORS para a origem
do app.
