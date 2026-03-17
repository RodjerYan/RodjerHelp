import { randomUUID } from 'crypto';
import type { LearningInsight, LearningSettings } from '../common/types/learning.js';
import type { TaskMessage, TaskStatus } from '../common/types/task.js';

type LearnableTask = {
  id: string;
  prompt: string;
  summary?: string;
  status: TaskStatus;
  messages: TaskMessage[];
};

interface LearningScope {
  scopeKey?: string;
  scopeLabel?: string;
}

interface InsightRule {
  key: string;
  title: string;
  content: string;
  category: LearningInsight['category'];
  tags: string[];
  patterns: RegExp[];
  baseConfidence: number;
}

const TERMINAL_STATUSES = new Set<TaskStatus>(['completed', 'failed', 'cancelled', 'interrupted']);

const INSIGHT_RULES: InsightRule[] = [
  {
    key: 'language-russian',
    title: 'Предпочтительный язык: русский',
    content: 'Если пользователь явно не просит иначе, отвечай на русском языке.',
    category: 'communication',
    tags: ['language', 'russian', 'communication'],
    patterns: [/на русском/iu, /по-русски/iu, /русск(ий|ом)/iu],
    baseConfidence: 0.7,
  },
  {
    key: 'preserve-existing-functionality',
    title: 'Сохранять текущее поведение',
    content:
      'При изменениях в коде сначала выбирать безопасные правки и не ломать уже работающий функционал.',
    category: 'safety',
    tags: ['safety', 'compatibility', 'stability', 'code'],
    patterns: [
      /не лом(ая|ай|ать)/iu,
      /не сломав/iu,
      /current functionalit(y|ies)/iu,
      /без регресс/iu,
    ],
    baseConfidence: 0.78,
  },
  {
    key: 'verification-first',
    title: 'Подтверждать изменения проверками',
    content:
      'После изменений по возможности запускать typecheck, lint и релевантные тесты и сообщать результат.',
    category: 'quality',
    tags: ['quality', 'verification', 'tests', 'lint', 'typecheck', 'code'],
    patterns: [/typecheck/iu, /\blint\b/iu, /\bтест(ы|ов)?\b/iu, /проверк/iu],
    baseConfidence: 0.72,
  },
  {
    key: 'concise-answers',
    title: 'Краткие и практичные ответы',
    content:
      'Предпочитать короткие, практичные ответы без лишней воды, если это не противоречит задаче.',
    category: 'communication',
    tags: ['communication', 'concise', 'brief'],
    patterns: [/кратк/iu, /коротк/iu, /без воды/iu, /brief/iu, /concise/iu],
    baseConfidence: 0.68,
  },
  {
    key: 'deep-analysis',
    title: 'Любит глубокий разбор',
    content:
      'Для аналитических и диагностических задач предпочитать полный разбор, а не поверхностный ответ.',
    category: 'workflow',
    tags: ['analysis', 'deep', 'diagnostics'],
    patterns: [/полн(ый|остью)/iu, /глубок(ий|о)/iu, /проанализир/iu, /deep analysis/iu],
    baseConfidence: 0.69,
  },
  {
    key: 'structured-roadmaps',
    title: 'Любит структурированные планы',
    content:
      'Когда задача про развитие продукта или внедрение, полезно предлагать дорожную карту и приоритеты.',
    category: 'workflow',
    tags: ['plan', 'roadmap', 'priorities', 'strategy'],
    patterns: [/дорожн(ая|ую) карт/iu, /\broadmap\b/iu, /\bплан\b/iu, /приорит/iu],
    baseConfidence: 0.64,
  },
  {
    key: 'sales-analytics-domain',
    title: 'Контекст аналитики продаж',
    content:
      'В задачах по аналитике продаж учитывать plan-vs-fact, SKU, скидки, остатки, отток клиентов и аномалии.',
    category: 'domain',
    tags: ['sales', 'analytics', 'plan-fact', 'sku', 'маржа', 'остатки'],
    patterns: [/аналитик(а|и)? продаж/iu, /plan[\s-]?vs[\s-]?fact/iu, /\bsku\b/iu, /лимкорм/iu],
    baseConfidence: 0.67,
  },
];

function buildTaskCorpus(task: LearnableTask): string {
  const messageText = task.messages
    .map((message) => [message.toolName, message.content].filter(Boolean).join(' '))
    .join('\n');

  return [task.prompt, task.summary || '', messageText].join('\n');
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function hasVerificationEvidence(messages: TaskMessage[]): boolean {
  return messages.some((message) => {
    const haystack = `${message.toolName || ''} ${message.content}`.toLowerCase();
    return (
      haystack.includes('pnpm lint') ||
      haystack.includes('pnpm typecheck') ||
      haystack.includes('prettier --check') ||
      haystack.includes('tsc --noemit') ||
      haystack.includes('vitest') ||
      haystack.includes('eslint')
    );
  });
}

function toLearningInsight(
  rule: InsightRule,
  taskId: string,
  confidenceBoost: number,
  scope: LearningScope,
): LearningInsight {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    key: `${scope.scopeKey || 'global'}::${rule.key}`,
    title: rule.title,
    content: rule.content,
    category: rule.category,
    scopeKey: scope.scopeKey || 'global',
    scopeLabel: scope.scopeLabel,
    tags: rule.tags,
    confidence: Math.min(0.95, rule.baseConfidence + confidenceBoost),
    occurrenceCount: 1,
    sourceTaskId: taskId,
    createdAt: now,
    updatedAt: now,
  };
}

export function analyzeTaskForLearning(
  task: LearnableTask,
  scope: LearningScope = {},
): LearningInsight[] {
  if (!TERMINAL_STATUSES.has(task.status)) {
    return [];
  }

  const text = buildTaskCorpus(task);
  if (!text.trim()) {
    return [];
  }

  const insights = INSIGHT_RULES.flatMap((rule) => {
    const hits = countMatches(text, rule.patterns);
    if (hits === 0) {
      return [];
    }
    return [toLearningInsight(rule, task.id, Math.min(0.2, (hits - 1) * 0.07), scope)];
  });

  if (task.status === 'completed' && hasVerificationEvidence(task.messages)) {
    const verificationRule = INSIGHT_RULES.find((rule) => rule.key === 'verification-first');
    const alreadyHasVerification = insights.some((insight) =>
      insight.key.endsWith('verification-first'),
    );
    if (verificationRule && !alreadyHasVerification) {
      insights.push(toLearningInsight(verificationRule, task.id, 0.1, scope));
    }
  }

  return insights.filter(
    (insight, index, source) => source.findIndex((item) => item.key === insight.key) === index,
  );
}

function scoreInsight(prompt: string, insight: LearningInsight): number {
  const normalizedPrompt = prompt.toLowerCase();
  let score = 0;

  if (insight.category === 'communication' || insight.category === 'safety') {
    score += 5;
  }

  if (
    insight.category === 'quality' &&
    /код|bug|ошиб|test|lint|typecheck|refactor/iu.test(prompt)
  ) {
    score += 5;
  }

  if (
    insight.category === 'workflow' &&
    /анализ|plan|roadmap|внедр|strategy|стратег/iu.test(prompt)
  ) {
    score += 4;
  }

  for (const tag of insight.tags) {
    if (normalizedPrompt.includes(tag.toLowerCase())) {
      score += 3;
    }
  }

  return score + insight.occurrenceCount + insight.confidence;
}

export function buildLearningSystemPromptAppend(options: {
  prompt: string;
  insights: LearningInsight[];
  settings: LearningSettings;
  maxInsights?: number;
}): string | undefined {
  const { prompt, insights, settings, maxInsights = 5 } = options;

  if (!settings.selfLearningEnabled || !settings.autoApplyLearning || insights.length === 0) {
    return undefined;
  }

  const selected = [...insights]
    .sort((left, right) => scoreInsight(prompt, right) - scoreInsight(prompt, left))
    .slice(0, maxInsights);

  if (selected.length === 0) {
    return undefined;
  }

  const bulletList = selected.map((insight) => `- ${insight.content}`).join('\n');
  return [
    'Учитывай накопленные предпочтения пользователя и рабочие паттерны из прошлых задач.',
    bulletList,
  ].join('\n');
}

export function mergeSystemPromptAppend(
  existingAppend: string | undefined,
  learningAppend: string | undefined,
): string | undefined {
  const parts = [existingAppend, learningAppend].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join('\n\n');
}
