import path from 'path';
import type { Skill } from '../common/types/skills.js';
import type { TaskConfig, TaskPersonaMode } from '../common/types/task.js';

const GLOBAL_SCOPE_KEY = 'global';

const TASK_MODE_INSTRUCTIONS: Record<Exclude<TaskPersonaMode, 'default'>, string[]> = {
  'code-review': [
    'Сначала ищи баги, риски регрессии, архитектурные проблемы и пробелы в тестах.',
    'Если задача про код, приоритизируй корректность, обратную совместимость и проверяемость изменений.',
  ],
  analysis: [
    'Делай глубокий, структурированный разбор с выводами, причинами и приоритетами.',
    'Если данных мало, формулируй выводы как гипотезы и явно отделяй факты от интерпретации.',
  ],
  sales: [
    'Смотри на задачу как аналитик продаж: plan-vs-fact, SKU, скидки, остатки, маржу, отток и аномалии.',
    'Предлагай выводы, которые можно превратить в действия для отдела продаж или руководителя.',
  ],
  executive: [
    'Отвечай коротко и управленчески: ключевой вывод, риски, приоритеты и рекомендуемое действие.',
    'По возможности своди детали к решению уровня руководителя, а не к низкоуровневому пересказу.',
  ],
};

export function resolveTaskMemoryContext(config: TaskConfig): {
  memoryContext?: string;
  scopeKey: string;
  scopeLabel?: string;
} {
  if (config.memoryContext?.trim()) {
    const memoryContext = config.memoryContext.trim();
    return {
      memoryContext,
      scopeKey: `context:${
        memoryContext
          .toLowerCase()
          .replace(/[^a-zа-я0-9]+/giu, '-')
          .replace(/^-|-$/g, '') || 'custom'
      }`,
      scopeLabel: memoryContext,
    };
  }

  if (config.workingDirectory?.trim()) {
    const workingDirectory = config.workingDirectory.trim();
    const folderName = path.basename(workingDirectory) || workingDirectory;
    return {
      memoryContext: folderName,
      scopeKey: `workspace:${workingDirectory.toLowerCase()}`,
      scopeLabel: folderName,
    };
  }

  return { scopeKey: GLOBAL_SCOPE_KEY };
}

export function buildTaskModeSystemPromptAppend(
  taskMode: TaskPersonaMode | undefined,
): string | undefined {
  if (!taskMode || taskMode === 'default') {
    return undefined;
  }

  const instructions = TASK_MODE_INSTRUCTIONS[taskMode];
  if (!instructions?.length) {
    return undefined;
  }

  return [`Работай в режиме "${taskMode}".`, ...instructions.map((item) => `- ${item}`)].join('\n');
}

function scoreSkill(prompt: string, taskMode: TaskPersonaMode | undefined, skill: Skill): number {
  const haystack = `${skill.name} ${skill.command} ${skill.description}`.toLowerCase();
  const normalizedPrompt = prompt.toLowerCase();
  let score = 0;

  for (const token of normalizedPrompt.split(/[^a-zа-я0-9]+/iu).filter(Boolean)) {
    if (token.length > 2 && haystack.includes(token)) {
      score += 2;
    }
  }

  if (taskMode === 'code-review' && /review|ревью|bug|test|lint|git|code/iu.test(haystack)) {
    score += 6;
  }
  if (taskMode === 'analysis' && /research|sheet|analysis|исслед|report|review/iu.test(haystack)) {
    score += 4;
  }
  if (taskMode === 'sales' && /sheet|research|download|google/iu.test(haystack)) {
    score += 3;
  }
  if (taskMode === 'executive' && /review|research|sheet/iu.test(haystack)) {
    score += 2;
  }

  return score;
}

export function recommendSkillsForTask(options: {
  prompt: string;
  taskMode?: TaskPersonaMode;
  skills: Skill[];
  maxSkills?: number;
}): Skill[] {
  const { prompt, taskMode, skills, maxSkills = 3 } = options;

  return skills
    .map((skill) => ({ skill, score: scoreSkill(prompt, taskMode, skill) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name),
    )
    .slice(0, maxSkills)
    .map((entry) => entry.skill);
}

export function buildRecommendedSkillsAppend(skills: Skill[]): string | undefined {
  if (skills.length === 0) {
    return undefined;
  }

  return [
    'С высокой вероятностью пригодятся следующие навыки. Если они релевантны, включи их в start_task и прочитай их SKILL.md:',
    ...skills.map((skill) => `- ${skill.name} (${skill.command})`),
  ].join('\n');
}
