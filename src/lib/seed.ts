/**
 * Стартовые данные Quadcode AI: контент-план X на 02–15 октября 2026
 * (twitter_dashboard_2026_10_02-15.csv), переупакованный в рубрики R1–R7 из ресерча конкурентов.
 * Загружаются один раз, когда хранилище пустое.
 */
import type { Channel, DB, Doc, FormatId, Member, Priority, Release, Row, Task } from "./types";

const SEED_TS = new Date(2026, 9, 2, 9, 0).getTime();

/** Заглушки команды: заменить на реальных людей в «Команде» */
const MEMBERS: Member[] = [
  { id: "m-1", name: "Alex Carter", color: "#ff9569" },
  { id: "m-2", name: "Mia Novak", color: "#3485d1" },
  { id: "m-3", name: "Leo Brandt", color: "#f5b94a" },
  { id: "m-4", name: "Nina Ross", color: "#5ec2a0" },
  { id: "m-5", name: "Sam Ortiz", color: "#b48cf2" },
];

const CHANNELS: Channel[] = [
  {
    id: "x",
    status: "active",
    account: "@quadcode_ai",
    dailyGoal: 2,
    note:
      "Два слота в день: 15:00 и 23:00 МСК. Модель в первой строке, текст ≤ 2 строк, ссылка и оффер только в реплае, ноль хэштегов. Первый час отвечаем на все реплаи.",
  },
  { id: "threads", status: "idle", account: "", dailyGoal: 0, note: "Repurpose постов X: то же видео, текст короче." },
  {
    id: "discord",
    status: "idle",
    account: "",
    dailyGoal: 0,
    note: "Сервер Quadcode + шоукейс-каналы геймдев и AI-серверов. Видео из X, промпт в треде.",
  },
  {
    id: "reddit",
    status: "idle",
    account: "",
    dailyGoal: 0,
    note: "r/gamedev, r/Unity3D, r/blender, r/aivideo. Сначала правила саба, ссылка только в комментарии.",
  },
];

/** [дата, время, тема, рубрика, модель, заметка, референсы, видео в группе] */
type Slot = [string, string, string, FormatId, string, string, string[], string?];

const PLAN: Slot[] = [
  ["2026-10-02", "15:00", "GPT-6.1 Sol: первый тест, 1 промпт", "prompt", "GPT-6.1 Sol", "Самый короткий текст: только стек. Промпт в первом реплае.", ["https://x.com/RoundtableSpace/status/2104356663138693495", "https://x.com/LeeLinAI123/status/2105026848690213333"], "https://t.me/c/3920207472/6093"],
  ["2026-10-02", "23:00", "GPT-6.1 Sol vs Astra: цена против качества", "duel", "GPT-6.1 Sol", "Сплит одна над другой, чек «1 prompt · N min · $X» под каждой. Вопрос «кто выиграл?».", ["https://x.com/higgsfield_ai/status/2105012668348383325", "https://x.com/AI_Screening/status/2105204266365603977"]],
  ["2026-10-03", "15:00", "Gemini 4 Argon: первый тест, 1 промпт", "prompt", "Gemini 4 Argon", "Было «что известно и как идёт доступ» = голый анонс (медиана 230). Показываем результат, доступ и цену пишем в реплае.", ["https://x.com/AdityaJhajhar12/status/2105406224909177080"]],
  ["2026-10-03", "23:00", "Gemini 4 Argon + Unreal + Blender: босс за N минут", "boss", "Gemini 4 Argon", "Было «Argon и его плюсы». Плюсы показываем боссом: HUD с первого кадра, чек времени и цены.", ["https://x.com/ChrisGPT/status/2105045818046808380"]],
  ["2026-10-04", "15:00", "Claude Sonnet 5.5: первый тест, 1 промпт", "prompt", "Claude Sonnet 5.5", "", ["https://x.com/ericmaskfr/status/2105411941279600929", "https://x.com/Da7_Tech/status/2105070912299307145"]],
  ["2026-10-04", "23:00", "Claude Sonnet 5.5 vs Claude Opus 5.5: same prompt", "duel", "Claude Sonnet 5.5", "Внутри одного вендора: цена ×5, разница в результате видна?", ["https://x.com/LeeLinAI123/status/2105026848690213333"]],
  ["2026-10-05", "15:00", "Claude Haiku 5.5: слепой тест, угадай модель", "duel", "Claude Haiku 5.5", "Как на референсе: показываем, не подписываем. Ответ в реплае через 6 часов.", ["https://x.com/itssssDean/status/2102636080520483234"]],
  ["2026-10-05", "23:00", "GPT-6.1 Sol vs Grok 4.7: за те же деньги", "duel", "Grok 4.7", "Привязка к цене: $ за прогон под каждой половиной.", ["https://x.com/RoundtableSpace/status/2102990159184581102"]],
  ["2026-10-06", "15:00", "Claude Sonnet 5 vs Sonnet 5.5: что улучшилось", "duel", "Claude Sonnet 5.5", "Один промпт, две версии. До/после без комментариев.", ["https://x.com/AI_Screening/status/2105427629490983275"]],
  ["2026-10-06", "23:00", "Fog-horror level в духе Silent Hill: Claude Sonnet 5.5 + Unreal", "remake", "Claude Sonnet 5.5", "Жанр, не IP: туман, радио, госпиталь. Без чужих ассетов и логотипов. Билд в реплае.", ["https://x.com/littlenutsac_/status/2105024611066794258"]],
  ["2026-10-07", "15:00", "Grok 4.7 vs GPT-6.1 Sol: 3D game dev", "duel", "Grok 4.7", "", ["https://x.com/first69mins/status/2105406980353331260"]],
  ["2026-10-07", "23:00", "Astra + Unreal: босс недели", "boss", "Astra", "Было «что может Astra, плюсы». Показываем, не рассказываем.", ["https://x.com/gameviiew/status/2105439996446478672"]],
  ["2026-10-08", "15:00", "Промпт недели: GPT-6.1 Sol, полный промпт в реплае", "prompt", "GPT-6.1 Sol", "CTA «попробуй сам». Промпт в реплае удваивает закладки.", ["https://x.com/abxxai/status/2105645670682259817"]],
  ["2026-10-08", "23:00", "GPT-6.1 Sol vs Claude Sonnet 5.5: цена одна, результат разный", "duel", "GPT-6.1 Sol", "1 промпт = результат. Чек одинаковый под обеими половинами.", ["https://x.com/SPAC89/status/2105365004404867293"]],
  ["2026-10-09", "15:00", "DeepSeek V4.1-Flash vs Astra: в 37 раз дешевле", "duel", "DeepSeek V4.1-Flash", "Вопрос в теле: «стоит того?». Цифру 37× [ПРОВЕРИТЬ] по актуальным прайсам.", ["https://x.com/ArtificialAnlys/status/2098148674203488422", "https://x.com/cline/status/2083638204037820734"]],
  ["2026-10-09", "23:00", "Gemini 4 Argon vs Claude Opus 5.5", "duel", "Gemini 4 Argon", "", ["https://x.com/ArtificialAnlys/status/2105392625788637299"]],
  ["2026-10-10", "15:00", "GPT-6.1 Sol vs Claude Opus 5.5: судят друг друга", "duel", "GPT-6.1 Sol", "Каждая модель оценивает работу соперника и ставит баллы. Баллы в кадре.", ["https://x.com/bridgebench/status/2102469365903872306", "https://x.com/VaibhavSisinty/status/2078458954397721021"]],
  ["2026-10-10", "23:00", "How we built the week's boss: prompt → agents → Unreal", "howbuilt", "Claude Opus 5.5", "Было «обзор любой модели + альтушка». Лицо в кадре у конкурентов режет views; показываем интерфейс и движок. Гайд в реплае.", []],
  ["2026-10-11", "15:00", "Gemini 4 Argon vs Astra vs Claude Opus 5.5: тройное", "duel", "Gemini 4 Argon", "Три колонки, один промпт. Голосование в реплаях.", ["https://www.youtube.com/watch?v=GmLcJVzkxPA"]],
  ["2026-10-11", "23:00", "Игра внутри игры: экран в сцене, Gemini 4 Argon + Unreal", "remake", "Gemini 4 Argon", "По референсу Kaizo: играбельный экран внутри 3D-сцены.", ["https://x.com/is__Kaizo/status/2105586414498799844"]],
  ["2026-10-12", "15:00", "Voxel soulslike: босс-файт в кубическом мире, GPT-6.1 Sol", "remake", "GPT-6.1 Sol", "Было «Elden Ring × Minecraft». Жанры смешиваем, IP не трогаем.", ["https://x.com/gameunlocked26/status/2105362579854123104"]],
  ["2026-10-12", "23:00", "Open-city driving level: Claude Opus 5.5 + Unreal", "remake", "Claude Opus 5.5", "Было «под GTA, скоро релиз». Ньюсджек IP = 230 views у нас. Своя сцена города, трейлерный монтаж.", ["https://x.com/0x0SojalSec/status/2105427893648294002"]],
  ["2026-10-13", "15:00", "Gemini 4 Argon дорабатывает игру GPT-6.1 Sol: до/после", "howbuilt", "Gemini 4 Argon", "Шаги 1 → 2 → 3, чтобы сохраняли как рецепт.", ["https://x.com/higgsfield_ai/status/2104662114275344474"]],
  ["2026-10-13", "23:00", "Слепой тест: Claude Opus 5.5 vs GPT-6.1 Sol", "duel", "Claude Opus 5.5", "Без подписей. «Угадай где что» в теле, ответ через 6 часов в реплае.", ["https://x.com/VaibhavSisinty/status/2078458954397721021"]],
  ["2026-10-14", "15:00", "Какую сцену прогнать через Kling 4.0 первой? Голосование", "human", "Kling 4.0", "Было «предположения о Kling 4.0» = текстовое мнение. Собираем идеи в реплаях, топ делаем в день релиза.", ["https://x.com/nawalsehar/status/2105518442447290873", "https://x.com/Kling_ai/status/2104596718067257458"]],
  ["2026-10-14", "23:00", "Промпт недели по референсу: Claude Sonnet 5.5", "prompt", "Claude Sonnet 5.5", "Было «что-то похожее на референс». Повторяем механику референса, промпт в реплае.", ["https://x.com/jeansdildo/status/2105503236505645101"]],
  ["2026-10-15", "15:00", "Anime-style action game: Gemini 4 Argon + Unreal", "remake", "Gemini 4 Argon", "Тест аниме-аудитории. Трейлерный монтаж, билд в реплае.", ["https://x.com/GodlessDawn/status/2105531907115262305"]],
  ["2026-10-15", "23:00", "Kling 4.0: первый тест в день релиза", "prompt", "Kling 4.0", "Дата 15.10 не подтверждена [ПРОВЕРИТЬ]. Релиз → пост в течение 24 часов, протокол в радаре.", []],
];

const RELEASES: Release[] = [
  {
    id: "rel-kling-4",
    model: "Kling 4.0",
    vendor: "Kuaishou",
    date: "2026-10-15",
    confirmed: false,
    source: "https://x.com/Kling_ai/status/2104596718067257458",
    note: "В тизере только «October». Дату уточнить, при сдвиге перенести слоты 14–15.10.",
  },
];

const FREE_REFS = [
  "https://x.com/Just_sharon7/status/2105245788305809884",
  "https://x.com/kevin_t_ngo/status/2105428751115071642",
  "https://x.com/Izkimar/status/2105533696296333544",
  "https://x.com/itsvishaltwt/status/2105314287266955418",
  "https://x.com/cydonix/status/2105624857061081491",
  "https://x.com/higgsfield_ai/status/2105123621522006253",
  "https://x.com/DavidAriew/status/2105360022167601294",
  "https://x.com/p_e_cooper/status/2105397229725032625",
  "https://x.com/p_e_cooper/status/2104980433972703483",
  "https://x.com/luckeyfaraday/status/2105451767987061170",
  "https://x.com/peteyburn/status/2105081352316186813",
  "https://x.com/p_e_cooper/status/2105387636131024992",
];

/** [заголовок, приоритет, заметка] — ежедневная рутина X */
const DAILY: [string, Priority, string][] = [
  ["Отвечать на реплаи первый час после поста", 2, "Ответ автора на reply — сильный сигнал ранжирования. Первые 30–60 минут решают."],
  ["Снять метрики вчерашних постов: T+6ч и T+24ч", 2, "X Analytics → открыть слот в «Плане» → «Снимок». По T+6ч срабатывают kill и boost."],
  ["Радар релизов: анонсы OpenAI, Anthropic, Google, xAI, Kling", 1, "Релиз или апдейт → карточка в радаре → «Протокол» → первый пост в течение 24 часов. Пока руками, потом автоматом."],
  ["Пройти watchlist: 7 креаторов + 3 бренда", 1, "Что выстрелило за сутки, какой формат, какая модель. Годное → референс в слот."],
  ["3 видео-реплая под постами крупных AI-аккаунтов", 1, "Anthropic / OpenAI / Unreal / Unity. Без рекламы, крючок в профиль."],
];

const RULES_DOC = `# Правила постов X

## Текст
- Первая строка: модель, ≤ 60 символов. Название модели в первой строке — главный ключ дистрибуции.
- Не больше 2 строк текста при видео. Самый сильный пост конкурентов (818K) — только стек: «Opus 5.5 + AE + Higgsfield = … took <30 min».
- Чек в тексте: «1 prompt · N min · $X» даёт +50% к медиане.
- Ссылка и оффер только в первом реплае. Ноль хэштегов. Первое лицо, без «мы».
- Запрещено: excited to announce, game changer, revolutionary, unleash, elevate, seamlessly, supercharge, next-level, effortlessly, «the future of», link in bio, ALL-CAPS, ракеты.
- Не выходит: текстовые мнения, мемы, ньюсджеки чужих IP, голые анонсы. У нас они дают 230–420 views.

## Видео
- 8–25 с (дуэль до 45 с), первый кадр самый сильный, без интро.
- Один эпичный объект в кадре читается за 0,5 с. Сцена без фокуса (машина в пустыне) = 33K против 221K.
- Без лица в кадре: у конкурентов лицо режет views в 1,5–2 раза.
- Watermark quadcode.ai, финальный кадр «Built with Quadcode AI».
- Не больше одного видеопоста в день, если нет окна релиза. У Higgsfield чем больше постов в день, тем ниже медиана (ρ = −0,69).

## Пороги
- Like rate ≥ 0.6%, reply rate ≥ 0.05%, RT/like ≥ 8%, флагман недели ≥ 100K views.
- Закладки: дуэли ≥ 0.3%, рецепты и промпты ≥ 1%.
- Промо-флаг чужого поста: лайков < 0.25% от просмотров → это купленный охват, за образец не брать.

## Kill и boost (по снимку T+6ч)
- Умер: views < 1/3 медианы 30 дней и закладки < 0.1%. Три таких подряд в одной рубрике = рубрику закрываем.
- Бустить: like ≥ 0.5% и ≥ 50 закладок за 6 часов. Единственный случай, когда платим за промо.
- Хит: ≥ 3× медианы. Страница на quadcodegames.com за 48 часов, ссылка в реплае, тред «как построено».
`;

const FORMATS_DOC = `# Рубрики R1–R7

Доли недели: 60% охват (R1, R4, R5), 25% вовлечение (R2, R7), 15% конверсия (R3, R6).

| Код | Рубрика | Хук | Что в кадре | Цель |
|---|---|---|---|---|
| R1 | Дуэль моделей | «{A} vs {B} in 3D game dev. Same prompt.» | Сплит одна над другой, подписи моделей, карточки результата. 12–45 с | Reply rate ≥ 0.05%, закладки ≥ 0.3% |
| R2 | Босс недели | «{Model} + Unreal + Blender. 1 prompt · N min · $X» | HUD с первого кадра, бой, победный экран. 25–30 с | Флагман недели ≥ 100K |
| R3 | Как построено | «How we built {thing}: prompt → agents → Unreal» | 3–5 с интерфейса Quadcode и движка, шаги 1 → 2 → 3 | Закладки ≥ 1%, клики на гайд |
| R4 | Overnight Build | «I spent N hours. Not a demo.» | Тур 2–3 мин с лучшего кадра, карточка часы/токены/$ | Раз в месяц, охват |
| R5 | Жанровый ремейк | «{Genre}-style game built in Unreal with {Model}. Play 👇» | Трейлерный монтаж, билд в реплае. Своя сцена, без чужих IP | Охват, игровые дуэли ×4,4 к неигровым |
| R6 | Промпт недели | «{Model} can now {X}. Prompt 👇» | Клип 10–30 с, пайплайн в подписях, полный промпт в реплае | Закладки ≥ 1% |
| R7 | Человек в цикле | «Reply with a game you want to exist. We build the top 5.» | Идеи из реплаев → игры за 30 с с цитатой автора | Replies ≥ 40 |

Почему игры: у Higgsfield игровые дуэли 63,2K медиана против 14,3K у неигровых. У нас 72% постов неигровые с медианой 282.
`;

const RELEASE_DOC = `# Протокол релиза модели

Окно T+24–96 часов после релиза собирает 60% квартальных просмотров у конкурентов: медиана 48,8K в окне против 283 вне. Релиз → первый пост в течение 24 часов.

| Шаг | Когда | Рубрика | Что выходит |
|---|---|---|---|
| 1 | T+0–4 ч | R6 | Первый тест, 1 промпт. Самый короткий текст: только стек. Промпт в реплае |
| 2 | T+4–24 ч | R1 | Дуэль с текущим лидером (Claude Opus 5.5). Вопрос «кто выиграл?» |
| 3 | T+24–96 ч | R2 | Флагман: босс недели на новой модели, чек «1 prompt · N min · $X» |
| 4 | T+3–5 д | R3 | «Как построено»: интерфейс + движок, гайд на guides.quadcode.ai в реплае |
| 5 | T+5–10 д | R7 | Итоги голосования «Results: 68% picked …», ссылка на гайд «{A} vs {B}» |

Кнопка «Протокол» в радаре релизов создаёт пять слотов с датами. Ставить в радар всё: подтверждённые даты и слухи (помечаются «слух»). Слух подтвердился → поправить дату, слоты пересоздать.

Пока радар ведём руками: ежедневная задача «Радар релизов». Автоматизация — отдельный план.
`;

const WATCHLIST_DOC = `# Watchlist

## Бренды
- @higgsfield_ai — медиана 16,5K, игровые дуэли 63,2K. Берём формат дуэлей и бэкстейдж.
- @Magnific_AI — 7,8K, одна и та же модель против себя же, простой дифф.
- @ManusAI_HQ — 58K медиана, одно видео в день, половина — ролики с лицом. Лицо не берём.

## Креаторы (органика, не промо)
- @MengTo — «Opus 5.5 + AE + Higgsfield = … took <30 min» 818K. Формула стека.
- @chongdashu — Unity/Unreal пайплайны с AI, рецепты.
- @DannyLimanseta — соло-геймдев, overnight builds.
- @shneural — 3D и шейдеры.
- @AiBattle_ — дуэли моделей, механика голосования.
- @xikhar — 3D и анимация.
- Stefan 3D AI — Blender + AI.

## Как читать чужой пост
1. Views и likes. Лайков < 0.25% от просмотров = промо, за образец не брать.
2. Первая строка: есть ли модель. Первый кадр: один объект или каша.
3. Закладки > лайков = рецепт, который сохраняют. Копировать механику, не сцену.
4. Годное → в слот как референс, в заметку: что именно берём.
`;

const CHECKLIST_DOC = `# Чеклист перед выходом

Линтер в карточке слота проверяет это автоматически. Красное — не выходит.

- [ ] Рубрика R1–R7 указана. «Вне рубрик» = медиана 230–420.
- [ ] Модель написана точно и стоит в первой строке: Claude Opus 5.5, GPT-6.1 Sol, Gemini 4 Argon.
- [ ] Первая строка ≤ 60 символов, всего ≤ 2 строк.
- [ ] В теле нет ссылок, хэштегов, стоп-слов.
- [ ] Первый комментарий готов: промпт, файлы, ссылка. Промпт в реплае удваивает закладки (1,0% против 0,52%).
- [ ] Видео 8–25 с, первый кадр без интро, один объект в фокусе, watermark, финал «Built with Quadcode AI».
- [ ] Лица в кадре нет.
- [ ] Это первый видеопост дня или открыто окно релиза.
- [ ] Через час после выхода: ответить на все реплаи, снять T+1ч.
- [ ] T+6ч: снимок → вердикт. Бустить или не трогать.
- [ ] T+24ч: снимок. Хит → страница на games за 48 часов.
`;

const INSIGHTS_DOC = `# Выводы ресерча: что меняем в работе

Источники: разбор Higgsfield / Magnific / Manus (148 видео, 30.09.2026) и 23 бренда, 2934 поста (01.10.2026).

## Где мы
- @quadcode_ai: 1 201 подписчик, медиана 366 views, закладки 0%. У Higgsfield медиана 16,5K, у Manus 58K.
- 72% наших постов — неигровые, их медиана 282. Игровые у конкурентов ×1,9–4,4.
- Мы постим вне окон релизов и без модели в первой строке.

## 10 решений
1. Каждый слот — рубрика R1–R7. «Вне рубрик» не выходит.
2. Модель в первой строке, точное название. Чек «1 prompt · N min · $X» где возможно.
3. Релиз модели → протокол из 5 постов, первый в течение 24 часов. Радар релизов ведём ежедневно.
4. Один видеопост в день вне окон релиза. Второй слот — реплаи, R7, repurpose.
5. Промпт всегда в первом реплае. Цель: ≥ 70% постов с закладками.
6. Снимки метрик T+1ч / 6ч / 24ч / 72ч / 7д по каждому посту. Без цифр нет вердикта.
7. Kill rule: < 1/3 медианы и закладки < 0.1% на T+6ч = умер. Три подряд в рубрике = рубрику закрываем.
8. Boost rule: like ≥ 0.5% и ≥ 50 закладок за 6 ч = единственный повод платить за промо.
9. Хит (≥ 3× медианы) → страница на quadcodegames.com за 48 часов → гайд на guides → цикл.
10. Без лиц, без чужих IP, без ньюсджеков, без ALL-CAPS, без голых анонсов.

## KPI на 4 недели
- Медиана views ≥ 1 000 (сейчас 366).
- ≥ 70% постов с закладками (сейчас 0%).
- Дуэли: закладки ≥ 0.3%. Рецепты и промпты: ≥ 1%.
- Replies ≥ 40 на R7.
- Хотя бы один флагман ≥ 100K за месяц.

## Что пока руками (автоматизация — отдельный план)
- Радар релизов: проверка анонсов вендоров.
- Watchlist: 7 креаторов + 3 бренда раз в день.
- Снимки метрик из X Analytics.
`;

export function emptyDB(): DB {
  const channels = {} as DB["channels"];
  for (const c of CHANNELS) channels[c.id] = { ...c, status: "idle", account: "", dailyGoal: 0, note: "" };
  return {
    members: {},
    channels,
    targets: {},
    tasks: {},
    events: {},
    docs: {},
    expenses: {},
    pulse: {},
    meta: { workspace: "Quadcode AI", funnelGoal: { sent: 28, replied: 10, concept: 5, call: 2, won: 1 } },
  };
}

export function seedRows(): Row[] {
  const rows: Row[] = [];
  for (const m of MEMBERS) rows.push({ kind: "member", id: m.id, data: m });
  for (const c of CHANNELS) rows.push({ kind: "channel", id: c.id, data: c });

  PLAN.forEach(([due, time, title, format, model, note, refs, video], i) => {
    const t: Task = {
      id: `post-${due}-${time.replace(":", "")}`,
      title,
      note: [note, refs.length ? "" : "Референса нет: найти до дня публикации."].filter(Boolean).join("\n"),
      status: "todo",
      channelId: "x",
      assigneeId: null,
      priority: refs.length ? 1 : 2,
      due,
      createdAt: SEED_TS,
      createdBy: null,
      doneAt: null,
      order: i,
      time,
      format,
      model,
      refs,
      ...(video ? { video } : {}),
    };
    rows.push({ kind: "task", id: t.id, data: t });
  });

  DAILY.forEach(([title, priority, note], i) => {
    const t: Task = {
      id: `daily-${i + 1}`,
      title,
      note,
      status: "todo",
      channelId: "x",
      assigneeId: null,
      priority,
      due: null,
      createdAt: SEED_TS,
      createdBy: null,
      doneAt: null,
      order: i,
      daily: true,
      doneDays: {},
    };
    rows.push({ kind: "task", id: t.id, data: t });
  });

  const doc = (id: string, title: string, body: string): Doc => ({ id, title, body, format: "md", createdAt: SEED_TS, updatedAt: SEED_TS, createdBy: null });
  const docs: Doc[] = [
    doc("doc-insights", "Выводы ресерча: 10 решений и KPI", INSIGHTS_DOC),
    doc("doc-rules", "Правила постов X", RULES_DOC),
    doc("doc-formats", "Рубрики R1–R7", FORMATS_DOC),
    doc("doc-release", "Протокол релиза модели", RELEASE_DOC),
    doc("doc-checklist", "Чеклист перед выходом", CHECKLIST_DOC),
    doc("doc-watchlist", "Watchlist: бренды и креаторы", WATCHLIST_DOC),
    doc("doc-free-refs", "Референсы без привязки к дате", `# Референсы без привязки\n\n${FREE_REFS.map((u) => `- ${u}`).join("\n")}\n`),
  ];
  for (const d of docs) rows.push({ kind: "doc", id: d.id, data: d });

  rows.push({
    kind: "meta",
    id: "meta",
    data: { workspace: "Quadcode AI", funnelGoal: { sent: 28, replied: 10, concept: 5, call: 2, won: 1 }, releases: RELEASES },
  });
  return rows;
}
