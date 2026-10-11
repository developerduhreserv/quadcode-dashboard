export const CHANNEL_IDS = ["x", "threads", "discord", "reddit"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];
export type ChannelStatus = "active" | "paused" | "idle";

/** Аккаунт канала из справочника: ник, кто ведёт, подпись («Максим · разработка»). */
export interface ChannelAccount {
  handle: string;
  /** Пусто = владелец не указан. */
  memberId: string;
  label: string;
}

export interface Channel {
  id: ChannelId;
  status: ChannelStatus;
  /** Ники через запятую. Пишется вместе с accounts, его читает старый код. */
  account: string;
  /** Справочник аккаунтов. Нет поля: берём ники из account. */
  accounts?: ChannelAccount[];
  /** Сколько касаний в день планируем. 0 = без дневной цели. */
  dailyGoal: number;
  note: string;
  /** Круги рассылки: галочки сбрасываются каждые cycleHours. Нет поля: включено только у Telegram. */
  cyclesEnabled?: boolean;
  /** Длина круга в часах, по умолчанию 4. Круги идут от полуночи. */
  cycleHours?: number;
  /** Часовой пояс кругов и плитки «Сегодня», по умолчанию Asia/Tbilisi. */
  cycleTz?: string;
  /** Тост и уведомление о новом круге, по умолчанию вкл. */
  cycleNotify?: boolean;
}

export const STAGES = ["new", "sent", "replied", "concept", "call", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const FUNNEL_STAGES = ["sent", "replied", "concept", "call", "won"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** Цель рассылки: чат, аккаунт, группа. */
export interface Target {
  id: string;
  channelId: ChannelId;
  title: string;
  url: string;
  offer: string;
  note: string;
  starred: boolean;
  /** Первое сообщение, адаптированное под эту цель. */
  message?: string;
  /** Второе сообщение, после ответа. */
  followUp?: string;
  /** С какого аккаунта канала пишем этой цели. Пусто = не закреплено. */
  via?: string;
  stage: Stage;
  /** Сколько раз писали или постили. */
  touches: number;
  lastTouchAt: number | null;
  /** «Можно постить раз в» по правилам чата, в часах. Нет поля: раз в круг. */
  cooldownHours?: number;
  /** Когда впервые достигнут этап воронки. 0 = дата неизвестна (импорт). */
  at: Partial<Record<FunnelStage, number>>;
  createdAt: number;
  order: number;
}

export type TaskStatus = "todo" | "doing" | "done";
export type Priority = 0 | 1 | 2;

/** Рубрики постов X из ресерча конкурентов (R1–R7). other = вне рубрик, линтер ругается. */
export const FORMAT_IDS = ["duel", "boss", "howbuilt", "overnight", "remake", "prompt", "human", "other"] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

/** Итог поста по правилам: хит (≥3× медианы), норм, умер (kill rule), бустить (boost rule). */
export type Verdict = "hit" | "ok" | "dead" | "boost";

/** Снимок метрик поста через N часов после выхода. Вносится руками из X Analytics. */
export interface MetricSnapshot {
  /** Через сколько часов после публикации: 1, 6, 24, 72, 168 */
  hours: number;
  at: number;
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  bookmarks: number;
}

/** Релиз модели: открывает окно T+24–96h, в котором посты собирают в разы больше. */
export interface Release {
  id: string;
  model: string;
  vendor: string;
  /** YYYY-MM-DD */
  date: string;
  /** false = слух, дата не подтверждена */
  confirmed: boolean;
  source: string;
  note?: string;
}

export interface Task {
  id: string;
  title: string;
  note: string;
  status: TaskStatus;
  channelId: ChannelId | null;
  assigneeId: string | null;
  priority: Priority;
  /** YYYY-MM-DD */
  due: string | null;
  createdAt: number;
  createdBy: string | null;
  doneAt: number | null;
  order: number;
  /** Повторяется каждый день и закреплена сверху доски. */
  daily?: boolean;
  /** Дни, когда ежедневная задача сделана: YYYY-MM-DD → кто отметил. */
  doneDays?: Record<string, string | null>;
  /** Пост контент-плана: время выхода HH:MM (МСК). Есть поле = задача видна на «Плане». */
  time?: string;
  /** Референсы поста: ссылки на твиты и видео. */
  refs?: string[];
  /** Готовое видео в рабочей группе Telegram. */
  video?: string;
  /** Рубрика поста. */
  format?: FormatId;
  /** Модель в первой строке: «Claude Opus 5.5». */
  model?: string;
  /** Текст поста: первая строка ≤ 60 символов, всего ≤ 2 строк. */
  hook?: string;
  /** Первый комментарий: промпт, файлы, ссылка. Единственное место для ссылок. */
  firstReply?: string;
  /** Ссылка на вышедший пост. Есть поле = пост опубликован, по нему снимаем метрики. */
  postUrl?: string;
  /** Когда вышел пост, мс. Нет поля: берём due + time. */
  postedAt?: number;
  /** Снимки метрик T+1h, 6h, 24h, 72h, 7d. */
  metrics?: MetricSnapshot[];
  /** Ручное переопределение вердикта. Нет поля: считается по правилам. */
  verdict?: Verdict;
  /** Куда ещё дублируем пост, кроме основного channelId. */
  alsoTo?: ChannelId[];
}

export interface Member {
  id: string;
  name: string;
  color: string;
}

/** Документ команды: оффер, инструкция, отчёт, выгрузка базы. Хранится текстом. */
export interface Doc {
  id: string;
  title: string;
  body: string;
  /** md: заметка или отчёт, csv: таблица, txt: простой текст */
  format: "md" | "csv" | "txt";
  createdAt: number;
  updatedAt: number;
  createdBy: string | null;
}

export const EXPENSE_STATUSES = ["reserve", "plan", "paid", "published", "result", "refunded", "declined"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export const CURRENCIES = ["RUB", "USD", "GEL"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Трата на трафик: реклама в канале, звёзды в чате, PRO на бирже и т.д. */
export interface Expense {
  id: string;
  status: ExpenseStatus;
  /** Дата оплаты, YYYY-MM-DD */
  date: string | null;
  /** К какому месяцу бюджета относится, YYYY-MM */
  month: string;
  /** TeleTarget, Telegram чат, FL.ru, Kwork, Instagram Ads */
  platform: string;
  channelUrl?: string;
  /** Название канала или услуги */
  channelTitle: string;
  topic?: string;
  amount: number;
  currency: Currency;
  /** Охват по данным площадки */
  reachPlanned?: number;
  /** Просмотры после выхода */
  viewsFact?: number;
  subs?: number;
  /** Заявки и диалоги */
  leads?: number;
  creative?: string;
  /** Связь с целью в каналах, если есть */
  targetId?: string;
  note?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface Budget {
  amount: number;
  currency: Currency;
}

export type EvType =
  | "doc.add"
  | "target.import"
  | "task.add"
  | "task.start"
  | "task.done"
  | "task.daily"
  | "task.reopen"
  | "task.delete"
  | "target.add"
  | "target.touch"
  | "target.stage"
  | "channel.status"
  | "expense.add"
  | "expense.import"
  | "expense.paid"
  | "expense.result";

/** Запись в журнале действий. На журнале построена вся аналитика. */
export interface Ev {
  id: string;
  ts: number;
  by: string | null;
  type: EvType;
  channelId: ChannelId | null;
  text: string;
  ref?: string;
  stage?: Stage;
  /** С какого аккаунта было касание. */
  account?: string;
}

export interface Meta {
  workspace: string;
  /** Недельный ориентир по воронке. */
  funnelGoal: Record<FunnelStage, number>;
  /** Бюджет на трафик по месяцам: YYYY-MM → сумма. */
  budgets?: Record<string, Budget>;
  /** Радар релизов моделей. */
  releases?: Release[];
}

// ───────────── Пульс: что происходит в соцсетях ─────────────

/** Соцсети, которые слушает «Пульс». */
export const PULSE_NETWORKS = ["x", "reddit", "discord"] as const;
export type PulseNetwork = (typeof PULSE_NETWORKS)[number];

/** Что слушаем. Общая настройка команды. */
export interface PulseSources {
  /** Watchlist в X: ники без @ */
  xAccounts: string[];
  /** Поиск по X, нужен X_BEARER_TOKEN */
  xQueries: string[];
  /** Отдельные твиты. Референсы из плана и наши вышедшие посты добавляются сами */
  xPosts: string[];
  subreddits: string[];
  /** Поиск упоминаний по Reddit */
  redditQueries: string[];
  /** Коды инвайтов Discord: discord.gg/<код> */
  discordInvites: string[];
  /** ID каналов Discord, которые читает бот */
  discordChannels: string[];
}

export type PulseItemKind = "post" | "mention" | "message" | "server";

/** Одна единица из соцсети: пост, упоминание, сообщение или сервер. */
export interface PulseItem {
  id: string;
  network: PulseNetwork;
  kind: PulseItemKind;
  author: string;
  title?: string;
  text: string;
  url: string;
  /** мс */
  at: number;
  likes: number;
  replies: number;
  reposts?: number;
  views?: number;
  bookmarks?: number;
  /** Сабреддит, канал, запрос: откуда пришло */
  source: string;
  media?: "video" | "image" | null;
  /** Наш пост или наш сервер */
  ours?: boolean;
  /** Для серверов Discord: онлайн */
  online?: number;
}

export interface PulseInsight {
  network: PulseNetwork | "all";
  title: string;
  detail: string;
  /** Что сделать */
  action?: string;
  /** Ссылки на примеры */
  refs?: string[];
}

export interface PulseDigest {
  at: number;
  by: string | null;
  /** ai = собрал Claude, rules = посчитано по правилам без ключа */
  engine: "ai" | "rules";
  headline: string;
  insights: PulseInsight[];
  /** Готовые ответы на чужие посты и упоминания */
  replies: { url: string; to: string; draft: string }[];
  /** Идеи постов */
  ideas: string[];
}

export interface PulseStore {
  sources?: PulseSources;
  digest?: PulseDigest;
  /** Черновики ответов: url → текст */
  replies?: Record<string, string>;
}

export interface DB {
  members: Record<string, Member>;
  channels: Record<ChannelId, Channel>;
  targets: Record<string, Target>;
  tasks: Record<string, Task>;
  events: Record<string, Ev>;
  docs: Record<string, Doc>;
  expenses: Record<string, Expense>;
  pulse: PulseStore;
  meta: Meta;
}

export type Kind = "member" | "channel" | "target" | "task" | "event" | "doc" | "expense" | "pulse" | "meta";

/** Одна строка хранилища. data === null означает удаление. */
export interface Row {
  kind: Kind;
  id: string;
  data: unknown | null;
}

export type Range = "all" | "30d" | "7d";
