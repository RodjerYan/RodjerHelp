/**
 * Safe Russian localization patch.
 *
 * Unlike the broken global replacer, this ONLY patches:
 * - apps/web/locales/ru/*.json
 * - visible skill descriptions in bundled skill markdown files
 *
 * It does NOT touch source code keywords like import/export/core/etc.
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\apply-safe-russian-localization.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function patchJson(file, replacements) {
  if (!fs.existsSync(file)) return false;
  let src = fs.readFileSync(file, "utf8");
  const original = src;
  for (const [from, to] of replacements) {
    src = src.split(from).join(to);
  }
  if (src !== original) {
    fs.writeFileSync(file, src, "utf8");
    return true;
  }
  return false;
}

function patchText(file, replacements) {
  if (!fs.existsSync(file)) return false;
  let src = fs.readFileSync(file, "utf8");
  const original = src;
  for (const [from, to] of replacements) {
    src = src.split(from).join(to);
  }
  if (src !== original) {
    fs.writeFileSync(file, src, "utf8");
    return true;
  }
  return false;
}

const localeFiles = [
  path.join(ROOT, "apps", "web", "locales", "ru", "common.json"),
  path.join(ROOT, "apps", "web", "locales", "ru", "errors.json"),
  path.join(ROOT, "apps", "web", "locales", "ru", "execution.json"),
  path.join(ROOT, "apps", "web", "locales", "ru", "home.json"),
  path.join(ROOT, "apps", "web", "locales", "ru", "settings.json"),
];

const localeReplacements = [
  ["Search skills...", "Поиск навыков..."],
  ["Use Skills", "Использовать навыки"],
  ["Manage", "Управление"],
  ["Create", "Создать"],
  ["Refresh", "Обновить"],
  ["Loading agent...", "Загрузка агента..."],
  ["Task: failed", "Задача: ошибка"],
  ["Task failed", "Задача: ошибка"],
  ["Plan", "План"],
  ["Goal", "Цель"],
  ["Steps", "Шаги"],
  ["No conversations yet", "Пока нет диалогов"],
  ["Describe the task — AI will do the rest", "Опишите задачу — ИИ сделает остальное"],
  ["Attach files", "Прикрепить файлы"],
  ["Use skills", "Использовать навыки"],
  ["Search providers...", "Поиск провайдеров..."],
  ["OpenAI Settings", "Настройки OpenAI"],
  ["Voice input", "Голосовой ввод"],
  ["About", "О программе"],
];

const skillFiles = [
  path.join(ROOT, "apps", "desktop", "bundled-skills", "code-review", "SKILL.md"),
  path.join(ROOT, "apps", "desktop", "bundled-skills", "download-file", "SKILL.md"),
  path.join(ROOT, "apps", "desktop", "bundled-skills", "git-commit", "SKILL.md"),
  path.join(ROOT, "apps", "desktop", "bundled-skills", "google-sheets", "SKILL.md"),
  path.join(ROOT, "apps", "desktop", "bundled-skills", "web-research", "SKILL.md"),
];

const skillReplacements = [
  ["Review code for bugs, security issues, performance problems, and best practices.", "Проверяй код на баги, проблемы безопасности, производительности и соответствие лучшим практикам."],
  ["Download files in Chrome on Windows and macOS.", "Скачивай файлы в Chrome на Windows и macOS."],
  ["Create well-structured git commits with conventional commit messages, proper staging, and commit best practices.", "Создавай аккуратные git-коммиты с conventional commit сообщениями, корректным staging и хорошими практиками коммитов."],
  ["Automate Google Sheets interactions through browser automation", "Автоматизируй работу с Google Sheets через браузер"],
  ["Research topics on the web, gather information from multiple sources, and summarize findings.", "Исследуй темы в интернете, собирай информацию из нескольких источников и подводи итоги."],
];

let changed = 0;
for (const file of localeFiles) if (patchJson(file, localeReplacements)) changed++;
for (const file of skillFiles) if (patchText(file, skillReplacements)) changed++;

console.log("Safely changed files:", changed);
console.log("Done.");
