import {
  FileText,
  MagnifyingGlass,
  Terminal,
  Brain,
  Clock,
  WarningCircle,
  Globe,
  Cursor,
  TextT,
  Image,
  Code,
  Keyboard,
  ArrowsDownUp,
  ListChecks,
  Stack,
  Highlighter,
  ListNumbers,
  Upload,
  ArrowsOutCardinal,
  FrameCorners,
  ShieldCheck,
  ChatCircleDots,
  CheckCircle,
  Lightbulb,
  Flag,
  Play,
} from '@phosphor-icons/react';

export const THINKING_PHRASES = [
  'Делаю...',
  'Выполняю...',
  'Запускаю...',
  'Обрабатываю...',
  'Завершаю...',
];

export const TOOL_PROGRESS_MAP: Record<string, { label: string; icon: typeof FileText }> = {
  invalid: { label: 'Повтор...', icon: WarningCircle },
  Read: { label: 'Чтение файлов', icon: FileText },
  Glob: { label: 'Поиск файлов', icon: MagnifyingGlass },
  Grep: { label: 'Поиск по коду', icon: MagnifyingGlass },
  Bash: { label: 'Выполнение команды', icon: Terminal },
  Write: { label: 'Запись файла', icon: FileText },
  Edit: { label: 'Редактирование файла', icon: FileText },
  Task: { label: 'Запуск агента', icon: Brain },
  WebFetch: { label: 'Загрузка веб‑страницы', icon: MagnifyingGlass },
  WebSearch: { label: 'Поиск в интернете', icon: MagnifyingGlass },
  dev_browser_execute: { label: 'Действие в браузере', icon: Terminal },
  browser_navigate: { label: 'Переход', icon: Globe },
  browser_snapshot: { label: 'Чтение страницы', icon: MagnifyingGlass },
  browser_click: { label: 'Клик', icon: Cursor },
  browser_type: { label: 'Ввод текста', icon: TextT },
  browser_screenshot: { label: 'Скриншот', icon: Image },
  browser_evaluate: { label: 'Выполнение скрипта', icon: Code },
  browser_keyboard: { label: 'Нажатие клавиш', icon: Keyboard },
  browser_scroll: { label: 'Прокрутка', icon: ArrowsDownUp },
  browser_hover: { label: 'Наведение', icon: Cursor },
  browser_select: { label: 'Выбор опции', icon: ListChecks },
  browser_wait: { label: 'Ожидание', icon: Clock },
  browser_tabs: { label: 'Вкладки', icon: Stack },
  browser_pages: { label: 'Страницы', icon: Stack },
  browser_highlight: { label: 'Подсветка', icon: Highlighter },
  browser_sequence: { label: 'Сценарий браузера', icon: ListNumbers },
  browser_file_upload: { label: 'Загрузка файла', icon: Upload },
  browser_drag: { label: 'Перетаскивание', icon: ArrowsOutCardinal },
  browser_get_text: { label: 'Извлечение текста', icon: FileText },
  browser_is_visible: { label: 'Проверка видимости', icon: MagnifyingGlass },
  browser_is_enabled: { label: 'Проверка состояния', icon: MagnifyingGlass },
  browser_is_checked: { label: 'Проверка состояния', icon: MagnifyingGlass },
  browser_iframe: { label: 'Переключение фрейма', icon: FrameCorners },
  browser_canvas_type: { label: 'Ввод в canvas', icon: TextT },
  browser_script: { label: 'Действия браузера', icon: Globe },
  request_file_permission: { label: 'Запрос доступа', icon: ShieldCheck },
  AskUserQuestion: { label: 'Вопрос пользователю', icon: ChatCircleDots },
  complete_task: { label: 'Завершение задачи', icon: CheckCircle },
  report_thought: { label: 'Мысли', icon: Lightbulb },
  report_checkpoint: { label: 'Контрольная точка', icon: Flag },
  start_task: { label: 'Старт задачи', icon: Play },
};

export function getBaseToolName(toolName: string): string {
  let idx = 0;
  while ((idx = toolName.indexOf('_', idx)) !== -1) {
    const candidate = toolName.substring(idx + 1);
    if (TOOL_PROGRESS_MAP[candidate]) {
      return candidate;
    }
    idx += 1;
  }
  return toolName;
}

export function getToolDisplayInfo(
  toolName: string,
): { label: string; icon: typeof FileText } | undefined {
  if (TOOL_PROGRESS_MAP[toolName]) {
    return TOOL_PROGRESS_MAP[toolName];
  }
  const baseName = getBaseToolName(toolName);
  return TOOL_PROGRESS_MAP[baseName];
}
