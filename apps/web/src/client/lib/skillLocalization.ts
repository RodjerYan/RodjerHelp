import type { Skill } from '@accomplish_ai/agent-core/common';

export const RU_SKILL_OVERRIDES: Record<string, { title: string; description: string }> = {
  'official:code-review': {
    title: 'Проверка кода',
    description:
      'Проверяет код на баги, уязвимости, проблемы производительности и нарушения лучших практик. Даёт конкретные рекомендации по исправлению.',
  },
  'code-review': {
    title: 'Проверка кода',
    description:
      'Проверяет код на баги, уязвимости, проблемы производительности и нарушения лучших практик. Даёт конкретные рекомендации по исправлению.',
  },
  'official:download-file': {
    title: 'Скачивание файлов',
    description:
      'Скачивает файлы в Chrome на Windows и macOS, запускает загрузку, отслеживает процесс и помогает устранять сбои.',
  },
  'download-file': {
    title: 'Скачивание файлов',
    description:
      'Скачивает файлы в Chrome на Windows и macOS, запускает загрузку, отслеживает процесс и помогает устранять сбои.',
  },
  'official:git-commit': {
    title: 'Git-коммит',
    description:
      'Помогает создавать понятные коммиты: подсказывает conventional messages, staging и лучшие практики Git.',
  },
  'git-commit': {
    title: 'Git-коммит',
    description:
      'Помогает создавать понятные коммиты: подсказывает conventional messages, staging и лучшие практики Git.',
  },
  'official:google-sheets': {
    title: 'Google Таблицы',
    description:
      'Автоматизирует работу с Google Таблицами через браузер: создаёт таблицы, вводит данные и применяет форматирование.',
  },
  'google-sheets': {
    title: 'Google Таблицы',
    description:
      'Автоматизирует работу с Google Таблицами через браузер: создаёт таблицы, вводит данные и применяет форматирование.',
  },
  'official:web-research': {
    title: 'Веб-исследование',
    description:
      'Ищет информацию в интернете по нескольким источникам, собирает материалы и делает краткую сводку с выводами.',
  },
  'web-research': {
    title: 'Веб-исследование',
    description:
      'Ищет информацию в интернете по нескольким источникам, собирает материалы и делает краткую сводку с выводами.',
  },
};

export function localizeSkillForRu(skill: Skill): { name: string; description: string } {
  const override = RU_SKILL_OVERRIDES[skill.id] ?? RU_SKILL_OVERRIDES[skill.name];
  return {
    name: override?.title ?? skill.name,
    description: override?.description ?? skill.description,
  };
}
