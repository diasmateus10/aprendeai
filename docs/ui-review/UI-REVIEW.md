# AprendeAI — Revisão de UI

**Auditado em:** 2026-10-23
**Base de comparação:** padrões abstratos de 6 pilares (não existe UI-SPEC)
**Screenshots:** não capturados (site exige login; auditoria feita só pelo código)

---

## Notas por pilar

| Pilar | Nota | Achado principal |
|-------|------|------------------|
| 1. Copywriting | 3/4 | Texto claro e em PT-BR, mas neutro e sem voz de marca; "Muito bem!", "Vamos brincar?", "Carregando…" são genéricos |
| 2. Visuals | 2/4 | Emoji faz o papel de logo, ícone, mascote e ilustração; telas "mascote centralizado + h1 + hint + botão" repetidas 7 vezes |
| 3. Color | 2/4 | Cinza-carvão + azul suave (padrão de template); 8 cores de unidade vindas da paleta Tailwind; adulto e Kids parecem dois produtos |
| 4. Typography | 2/4 | Rubik em tudo, 22 tamanhos diferentes e 5 pesos (600/700/800/900); sem fonte de display |
| 5. Spacing | 3/4 | Escala quase coerente (8/10/12/16), sem valores arbitrários graves; falta ritmo e densidade variada |
| 6. Experience Design | 3/4 | Boa cobertura de estados (loading, erro de mic/IA, vazio, desabilitado); faltam confirmações, foco visível global e erro mais humano |

**Total: 15/24**

---

## Top 3 correções prioritárias

1. **Emoji como identidade e ícone** — o app inteiro (logo, favicon, tabs, contadores, nós da trilha, atividades, mascote) usa emoji, que muda de aparência em cada celular e é o maior sinal de "feito por IA". Troque por um logotipo próprio + biblioteca de ícones SVG (Phosphor/Lucide) + um mascote ilustrado em SVG.
2. **Paleta e tipografia de template** — carvão `#242729` + azul `#64a2f7` + Rubik é a combinação padrão. Adote uma paleta de marca com um tom quente de assinatura, e uma fonte de display para títulos (ex.: Fraunces ou Bricolage Grotesque) com uma de texto (Inter/Figtree).
3. **Dois sistemas visuais diferentes (adulto escuro x Kids claro)** — o `.kids` redefine todos os tokens (`styles.css:1624`), então não parece a mesma marca. Unifique em um só conjunto de tokens, com o Kids apenas mais saturado e arredondado, compartilhando logo, fonte e mascote.

---

## Achados detalhados

### Pilar 1: Copywriting (3/4)

Pontos bons: rótulos de ação específicos ("Fazer teste de nivelamento", "Começar do zero", "Esqueci minha senha"); mensagens de erro de login acionáveis (`Auth.tsx:24,31,36`); sem "Click here" nem "Submit".

Problemas:
- Voz de marca ausente. "Bem-vindo ao AprendeAI" (`App.tsx:163,187`) e "Entre para salvar seu progresso" (`Auth.tsx:45`) descrevem o produto sem prometer nada. O `index.html` já tem uma frase melhor ("fale inglês de verdade") que não aparece na tela.
- O mesmo título "Bem-vindo ao AprendeAI" aparece em duas telas seguidas (`App.tsx:163` e `:187`).
- "Carregando…" (`App.tsx:131`) como única mensagem de espera. Sem personalidade nem contexto.
- Feedback genérico: "Muito bem!" (`Kids.tsx:501,675`), "Lição concluída!" (`App.tsx:330`), "Continue falando todo dia…" (`App.tsx:350`). Padrão típico de IA.
- "Uma criança" / "Eu" na escolha de modo (`App.tsx:167-173`) é confuso; "Eu" não diz que é o curso adulto.
- Rótulos de lição repetidos em toda unidade: "Treino de escuta", "Treino de fala", "Conversa" (`course.ts:292-294`), então a trilha parece cópia de si mesma.
- Erro de IA fala em "servidor rodando" (`Conversation.tsx:291`), linguagem de desenvolvedor para um cliente pagante.
- Sem texto de planos/valor, o que será necessário quando entrar o Stripe.

### Pilar 2: Visuals (2/4)

- **Logo/marca:** a marca é o emoji 🦜 + texto "AprendeAI" (`App.tsx:417`), o favicon é um emoji em SVG data-URI (`index.html:17`), e o ícone do app é um papagaio sobre fundo azul. Não há logotipo, wordmark nem forma própria.
- **Emoji como ícone** (cerca de 100+ ocorrências em `.tsx`/`.ts`): contadores 🔥 ⚡ 🎤 (`App.tsx:420-422`), nós da trilha (`l.icon`, `course.ts:292`), 🔒 nos bloqueados, atividades 💬 🃏 🗣️ 🎯 🧒 (`App.tsx:617-641`), 📖 Guia, 🔊 e 🐢 em botões, "☆★" nas estrelas, "✓" no anel. Emoji varia entre Android, iOS e Windows, não herda cor e não dá para estilizar.
- **Tela "mascote 96px + h1 + hint + botão"** repetida em: carregando, escolha de modo, boas-vindas, nível, resultado, login, nova senha, flashcards concluídos. Tudo usa `.result-card` centralizado (`styles.css:660`) com `.mascot.big` (96px). A repetição passa sensação de template.
- **Mascote trocado por emoji aleatório** nas telas (🎯, 🔑, 🃏, 😵): o papagaio some e a identidade se perde.
- **Cartões "pílula" uniformes:** 14 usos de `border-radius: 999px` e cartões todos com 14-18px de raio e borda de 2px. Tudo tem o mesmo peso visual, então o foco do dashboard (o botão "Continuar" da próxima lição) disputa com 5 atividades iguais.
- **Dashboard:** ordem atual = meta diária, lembrete, próximo conteúdo, atividades. A ação principal (continuar a lição) é o 3º cartão. O anel de meta é bom, mas "Alterar" é um link pequeno.
- **Trilha em zigue-zague** (`translateX` 0/60/-60 em `App.tsx:469`) com nós redondos e sombra em degradê "3D" `shade()` (`App.tsx:650`): é o layout do Duolingo copiado literalmente. Identidade própria exigiria outro formato.
- **Orb da conversa** (`styles.css:1269`) é o elemento mais original do app e o melhor candidato a virar assinatura visual.
- Acessibilidade: `aria-label` ausente em `Auth.tsx`, `Reminder.tsx`, `VoicePicker.tsx`; botões de emoji sozinhos (🔊, 🐢) dependem de `title`.

### Pilar 3: Color (2/4)

- Tokens (`styles.css:1-20`): fundo `#242729`, superfície `#2e3236`, primária `#64a2f7`, destaque `#f5a35c`. Funciona e tem contraste adequado, mas é o par "cinza escuro + azul pastel" de qualquer template.
- Cores de unidade em `course.ts`: `#0ea5a4`, `#8b5cf6`, `#f59e0b`, `#ef4444`, `#3b82f6`, `#10b981`, `#ec4899`, `#64748b`. São as cores Tailwind 500 (teal, violet, amber, red, blue, emerald, pink, slate), sem relação com a marca. Competem com a primária azul e com o vermelho de erro (unidade `#ef4444` parece erro).
- Kids (`styles.css:1624`): `#fff6e9` creme, `#ff7a59` coral, `#2b2340` roxo escuro. Paleta mais interessante que a do modo adulto, mas sem ligação com ele.
- Hardcoded em CSS: cerca de 30 valores hex únicos fora dos tokens (`#ffc93c`, `#ff9f1c`, `#f59e0b`, `#c2410c`, `#4a3500` etc.), em sua maioria no Kids e no sticker/estrelas. Deveriam virar tokens.
- A cor primária é usada em muitos elementos (botões, contadores, bordas, hover das atividades, estatísticas), então não há hierarquia de acento (60/30/10 diluído).

### Pilar 4: Typography (2/4)

- Fonte única: Rubik 400-700 (`index.html:8`), mas o CSS usa pesos 800 e 900 (6 e 4 vezes) que **não são carregados**, então o navegador sintetiza negrito falso.
- 22 tamanhos distintos em `styles.css` (11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 36, 38, 40, 42, 44, 96, 120px). Sem escala. 13px (12x), 18px (9x) e 14px (9x) dominam.
- Cinco pesos em uso (400, 600, 700, 800, 900). Meta ideal: 3.
- Sem fonte de display: títulos e corpo são a mesma família, tudo em negrito arredondado, o que lembra Duolingo/Wlingua.
- Texto de 11-13px usado em rótulos e dicas (`.hint`, `.card-label`), pequeno para o público infantil e para leitura em celular.

### Pilar 5: Spacing (3/4)

- Escala majoritariamente em múltiplos de 2/4: `gap` 12px (19x), 8px (11x), 10px (11x), 4px (8x), 6px, 14px, 16px. Sem `[valores]` arbitrários de Tailwind (é CSS puro).
- Pequenas inconsistências: 10 e 14px misturados com 8/12/16 (`padding: 10px 14px`, `14px 16px`, `16px 18px`).
- Todos os cartões têm o mesmo padding (14-16px), então falta ritmo entre seções (título de seção -> cartões usa `margin-top` fixo de 12-24px).
- Só 4 media queries (520-560px); tablet/desktop usam a mesma coluna estreita.

### Pilar 6: Experience Design (3/4)

Pontos bons:
- Loading de sessão (`App.tsx:126`), erro de microfone com causas (`Conversation.tsx:235`), erro de rede da IA (`:291`), banner de navegador sem STT (`App.tsx:444`), estados `disabled` (flashcards sem cartões, botões de login com `busy`), `prefers-reduced-motion` tratado (`styles.css:1340,2062`), foco com outline em um trecho (`:1008`).

Lacunas:
- Foco visível: só 3 menções a `focus` e 3 `outline: none` (`styles.css:1384,1511,2167`) sem substituto confirmado; navegação por teclado fica fraca.
- Sem confirmação em ações destrutivas ("Refazer nivelamento" muda o nível; "Sair da conta" apaga o progresso local em `logout`).
- Tela de carregamento com mascote estático e sem skeleton.
- Para o Stripe: não há tela de planos, paywall, estado "assinatura ativa/expirada", nem gating visual de conteúdo premium. Os nós bloqueados (🔒) hoje significam "ordem da trilha", e isso vai confundir com "bloqueado por plano".
- Footer da conta (`App.tsx:493`) é o único lugar de conta/sair; não há tela de perfil/assinatura.

---

## Por que parece "cara de IA" (diagnóstico)

1. **Emoji no lugar de design.** Nenhum ícone, logotipo ou ilustração foi desenhado. Cada emoji muda por sistema operacional, então o app nem sequer fica igual entre aparelhos.
2. **Paleta padrão.** Carvão + azul pastel + um laranja, sem decisão de marca.
3. **Fonte única arredondada** em negrito para tudo.
4. **Mesma "pílula"/cartão** em todo lugar; sem escala de importância.
5. **Mascote-sobre-título centralizado** como resposta para toda tela.
6. **Copy neutra** ("Bem-vindo", "Muito bem!", "Carregando…").
7. **Trilha clonada do Duolingo** (zigue-zague, nós 3D, "COMEÇAR" em balão).
8. **Dois produtos num só:** adulto escuro e Kids claro, com tokens diferentes.
9. **Sem assets de marca:** favicon em emoji, ícone de app do papagaio no azul padrão, sem og:image, sem wordmark.

---

## Plano de redesign priorizado

### 1. Identidade: logotipo, wordmark e mascote (alto impacto, 1-2 dias)
- Criar um wordmark "AprendeAI" (ou melhor, avaliar um nome mais ownable) e um símbolo SVG: um balão de fala que forma a letra "A" ou uma onda de voz. O app é sobre fala, e o orb já sugere isso.
- Redesenhar o papagaio como mascote SVG único (3-4 poses: neutro, feliz, pensando, triste) com 2 cores da marca. Usar no lugar de 🦜 🎯 🔑 🃏 😵.
- Gerar favicon, `icon-192/512`, `maskable-512`, `apple-touch-icon` e `og:image` novos.
- Arquivos: novo `src/components/Logo.tsx` e `src/components/Mascot.tsx`; `index.html:17` (favicon), `public/icons/*`, `public/manifest.webmanifest`, `App.tsx:130,162,186,218,329,417`, `Auth.tsx:43,104`, `Flashcards.tsx:147`, `data/kids.ts:367`.

### 2. Substituir emojis de interface por ícones SVG
- Biblioteca: **Phosphor Icons** (`@phosphor-icons/react`, estilo duotone/bold) ou **Lucide** (`lucide-react`). Ambas são npm; para CDN, `https://unpkg.com/@phosphor-icons/web`.
- Mapa sugerido (Phosphor): 🔥 `Flame` | ⚡ `Lightning` | 🎤 `Microphone` | 🔊 `SpeakerHigh` | 🐢 `Wind` ou `Gauge` (velocidade lenta; evitar tartaruga) | 💬 `ChatCircleDots` | 🃏 `Cards` | 🗣️ `Waveform` | 🎯 `Target` | 🧒 `Baby`/`SmileyWink` | 📖 `BookOpenText` | 🔒 `Lock` | 🎧 `Headphones` | ★ `Star` (weight fill/regular) | ✓ `Check` | 🎉 remover (ou confete SVG).
- Manter emoji/ilustração só onde é conteúdo (flashcards, histórias do Kids), e mesmo assim trocar o mix de emoji por ilustrações consistentes (os `.webp` Fluent já ajudam; usar essas no Kids em vez de emoji de sistema).
- Estilo: tamanho 20/24px, `currentColor`, caixa de ícone 40x40 com raio 12px.
- Arquivos: `App.tsx` (linhas 384-399, 420-422, 480, 483, 552, 617-641), `data/course.ts:51,291-298`, `Conversation.tsx`, `Exercises.tsx`, `Flashcards.tsx`, `Kids.tsx` (20 aria-labels e todos os emojis), `Reminder.tsx`.

### 3. Nova paleta de marca (tokens no `:root`)
Direção: "noite quente" em vez de cinza frio, com acento coral/laranja como cor de assinatura (conversa/voz) e verde só para acerto.
```
--bg:        #14110F;   /* quase preto quente */
--surface:   #1E1A17;
--surface-2: #2A2420;
--border:    #3A332D;
--text:      #F6EFE6;   /* creme */
--muted:     #A89C90;
--primary:   #FF6B4A;   /* coral de marca (CTA, orb, progresso) */
--primary-dark: #E2502F;
--on-primary:#1A0A05;
--secondary: #5B8CFF;   /* azul só para links/informação */
--good: #4ADE9A;  --good-bg: #123325;
--bad:  #FF5C6C;  --bad-bg:  #3A171B;
--gold: #FFC24B;        /* XP, estrelas, sequência */
--radius: 14px;  --radius-sm: 10px;  --radius-lg: 22px;
```
- Reduzir cores de unidade para 5-6 tons dessaturados que combinem (ex.: `#FF6B4A`, `#FFC24B`, `#4ADE9A`, `#5B8CFF`, `#B58CFF`, `#FF8FB1`) e remover o vermelho puro e o cinza-ardósia. Calcular o tom escuro por token, não pela função `shade()`.
- Mover todos os hex soltos (`#ffc93c`, `#ff9f1c`, `#f59e0b`, `#c2410c`, `#4a3500`...) para `--gold`, `--gold-dark`, `--on-gold`.
- Arquivos: `src/styles.css:1-20` e os ~30 hex espalhados, `src/data/course.ts` (campo `color`), `index.html:10` (`theme-color`), `public/manifest.webmanifest`.

### 4. Tipografia com personalidade e escala fixa
- Títulos/numerais: **Fraunces** (serifada com personalidade, 600-700) ou **Bricolage Grotesque** (700-800). Texto: **Figtree** ou **Inter** (400/500/600). Todas no Google Fonts.
```
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;700;800&family=Figtree:wght@400;500;600&display=swap" rel="stylesheet">
```
- Escala (px): 12 (legenda), 14 (secundário), 16 (corpo), 20 (título de cartão), 28 (h1 de tela), 40 (numeral destaque). Remover 11/13/15/17/18/19/22/24/26/30/36/38/42/44. Pesos: 400, 600, 700 (display 800 só no h1).
- Corpo mínimo de 14px; no Kids, 18px.
- Arquivos: `index.html:7-8`, `styles.css:15` (`font-family`), e substituir os 22 `font-size` por variáveis `--fs-xs … --fs-3xl`.

### 5. Reestruturar o dashboard (hierarquia clara)
- Ordem: (1) cartão grande "Continue de onde parou" com o ícone da lição, título, barra de progresso da unidade e CTA coral de largura total; (2) linha compacta com 3 métricas (sequência, XP, minutos falados) em vez de chips no topo; (3) meta diária menor, com anel de 64px; (4) lembrete só se a notificação estiver desligada; (5) atividades em 2 colunas, mas com a "Conversa com IA" em destaque (cartão largo com mini-orb), pois é o diferencial do produto.
- Trocar "Teste de nível" e "Modo Kids" (ações raras) por itens num menu de perfil.
- Arquivos: `App.tsx:413-448` (topbar) e `Dashboard` (`:505-648`), `styles.css` (`.card`, `.activity`, `.goal-card`, `.topbar`, `.counters`).

### 6. Tela de entrada/login de produto, não de template
- Layout dividido: no mobile, topo com ilustração do mascote + frase de valor; no desktop (>=900px), duas colunas com mockup do orb da conversa. Título: "Fale inglês de verdade, com quem nunca se cansa de ouvir". Subtexto: "Converse em voz alta com uma IA, receba correção na hora e treine pronúncia. 7 dias grátis."
- Botões "Continuar com Google" (Supabase OAuth) acima do formulário; campos com rótulo visível (hoje só placeholder) e botão de mostrar senha; adicionar `aria-label`/`<label>`.
- Unificar boas-vindas: uma única tela de escolha "Para quem é?" com cartões "Para mim — adulto" e "Para meu filho — 0 a 12 anos".
- Arquivos: `Auth.tsx` (todo), `App.tsx:158-201`, `styles.css` (`.result`, `.result-card`, `.auth-*`, `.mode-choice`).

### 7. Unificar adulto e Kids em um só sistema
- Manter um único arquivo de tokens; o `.kids` só sobrescreve `--bg`/`--surface` (creme `#FFF4E5`, texto `#2B2018`), `--radius` (+6px) e `--fs-*` (+2px). Primária coral, wordmark e mascote iguais nos dois.
- Considerar oferecer tema claro também no modo adulto (`prefers-color-scheme`), pois o Kids já tem os valores.
- Arquivos: `styles.css:1624-1660+` (bloco `.kids`), `Kids.tsx`, `data/kids.ts`.

### 8. Reescrever o microcopy com voz de marca
Voz sugerida: direta, calorosa, um pouco bem-humorada, foco em "falar".
- "Bem-vindo ao AprendeAI" -> "Vamos fazer você falar inglês." (boas-vindas) / "Bom te ver de volta." (login)
- "Carregando…" -> "Aquecendo a voz…" (com mascote animado)
- "Lição concluída!" -> variações por desempenho: "Boa! Hoje você falou {n}s de inglês." / "Quase lá. Errar é como se aprende a falar."
- "Muito bem!" (Kids) -> alternar "Isso aí!", "Acertou em cheio!", "Que ouvido bom!"
- "Eu / Uma criança" -> "Para mim" / "Para meu filho ou filha"
- "Não consegui conectar com a IA. Verifique se o servidor está rodando." -> "A conversa caiu por um instante. Toque para tentar de novo."
- Rótulos da trilha: trocar "Treino de escuta/fala/Conversa" por nomes por unidade (ex.: "Ouça: no restaurante").
- Arquivos: `App.tsx`, `Auth.tsx`, `Conversation.tsx:291`, `Exercises.tsx:214-216`, `Kids.tsx:336,501,675`, `data/course.ts:291-298`.

### 9. Trilha de curso com forma própria
- Em vez de zigue-zague de nós 3D: trilha vertical alinhada à esquerda, cada lição como linha (ícone SVG + título + barra de progresso + estrelas), unidade como cabeçalho "capítulo" com o número grande (`01`, `02`) em fonte display. Isso evita o aspecto de clone do Duolingo e funciona melhor no desktop.
- Remover `translateX` e `shade()`; usar sombra suave e tokens. Bloqueado por ordem = ícone `Lock` cinza; bloqueado por plano = selo "Premium" dourado (prepara o Stripe).
- Arquivos: `App.tsx:450-491` e `:650-657`, `styles.css:191-230` (`.node`, `.node-wrap`, `.unit-header`).

### 10. Preparar o produto para venda (Stripe) e acessibilidade
- Criar telas: Planos (mensal/anual, destaque no anual, "Cancele quando quiser"), paywall suave após a lição 3, Conta/Assinatura (status, próxima cobrança, gerenciar via Stripe Portal), e selo "Premium" nos itens bloqueados.
- Substituir o rodapé de conta (`App.tsx:493`) por menu de perfil (avatar com iniciais, Assinatura, Voz, Lembrete, Modo Kids, Sair com confirmação).
- Acessibilidade: `:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }` global; revisar os 3 `outline: none`; `aria-label` em todos os botões só com ícone; `<label>` nos inputs; confirmar "Refazer nivelamento" e "Sair".
- Arquivos: novos `src/components/Pricing.tsx`, `src/components/Account.tsx`; `App.tsx`; `styles.css:1008,1384,1511,2167`; `Auth.tsx`, `Reminder.tsx`, `VoicePicker.tsx`.

---

## Arquivos auditados
`src/App.tsx`, `src/components/Auth.tsx`, `src/styles.css` (tokens, `.kids`, cartões, trilha, orb), `index.html`, `src/data/course.ts` (cores e ícones), `src/data/kids.ts` (mascote), `public/manifest.webmanifest` e `public/icons/`; varredura por grep em `Conversation.tsx`, `Exercises.tsx`, `Flashcards.tsx`, `Kids.tsx`, `Reminder.tsx`, `VoicePicker.tsx`, `Lesson.tsx`, `Placement.tsx`. Não verificados em detalhe: telas internas de `Kids.tsx` (jogos, histórias) e `Exercises.tsx`; registry shadcn não se aplica (sem `components.json`).
