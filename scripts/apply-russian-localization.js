/**
 * RodjerHelp Russian localization patch
 *
 * What it does:
 * 1) Recursively scans the repo for .ts/.tsx/.js/.jsx/.json/.md locale/content files
 * 2) Replaces common English UI phrases with Russian
 * 3) Updates skill card/button/search labels shown in the screenshots
 * 4) Translates common "thinking/execution" phrases like:
 *    - Loading agent...
 *    - Plan / Goal / Steps
 *    - Task: failed
 *
 * IMPORTANT:
 * - It does NOT rename file names / skill IDs / internal command slugs.
 * - It only replaces visible UI text and descriptions.
 * - It creates .bak backups next to changed files.
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\apply-russian-localization.js
 *
 * Then rebuild:
 *   pnpm -F @accomplish/desktop build:base
 *   or
 *   pnpm -F @accomplish/desktop build:unpack
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const ALLOWED_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".yml", ".yaml"]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === "release" || ent.name === ".git") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function safeRead(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return null; }
}
function safeWrite(file, data) {
  fs.writeFileSync(file, data, "utf8");
}

const exactReplacements = [
  // General UI
  ["Search skills...", "Поиск навыков..."],
  ["Use Skills", "Использовать навыки"],
  ["Manage", "Управление"],
  ["Create", "Создать"],
  ["Refresh", "Обновить"],
  ["Loading agent...", "Загрузка агента..."],
  ["Task: failed", "Задача: ошибка"],
  ["Task failed", "Задача: ошибка"],
  ["Plan:", "План:"],
  ["Goal:", "Цель:"],
  ["Steps:", "Шаги:"],
  ["Cancel", "Отмена"],
  ["Submit", "Отправить"],
  ["Loading...", "Загрузка..."],
  ["Use skills", "Использовать навыки"],
  ["Attach files", "Прикрепить файлы"],
  ["New task", "Новая задача"],
  ["No conversations yet", "Пока нет диалогов"],
  ["Search providers...", "Поиск провайдеров..."],
  ["Search logs...", "Поиск по логам..."],

  // Skill cards from screenshots
  ["Review code for bugs, security issues, performance problems, and best practices. Provide actionable...", "Провести ревью кода на баги, проблемы безопасности, производительности и соответствие лучшим практикам. Дать практические рекомендации..."],
  ["Download files in Chrome on Windows and macOS. Handles triggering downloads, detecting and resolving...", "Скачивать файлы в Chrome на Windows и macOS. Обрабатывает запуск загрузки, определение и устранение проблем..."],
  ["Create well-structured git commits with conventional commit messages, proper staging, and commit best...", "Создавать аккуратные git-коммиты с conventional commit сообщениями, корректным staging и хорошими практиками коммитов..."],
  ["Automate Google Sheets interactions through browser automation - create spreadsheets, enter data, apply...", "Автоматизировать работу с Google Sheets через браузер: создавать таблицы, вносить данные, применять..."],
  ["Research topics on the web, gather information from multiple sources, and summarize findings.", "Исследовать темы в интернете, собирать информацию из нескольких источников и подводить итоги."],

  // Search / submenu / placeholders
  ["Describe the task — AI will do the rest", "Опишите задачу — ИИ сделает остальное"],
  ["Search skills", "Поиск навыков"],
  ["Use skills", "Использовать навыки"],
  ["No skills found", "Навыки не найдены"],
  ["Built by you", "Создано вами"],
  ["by RodjerHelp", "От RodjerHelp"],
  ["GitHub", "GitHub"],

  // Common provider/settings strings
  ["Providers", "Провайдеры"],
  ["Skills", "Навыки"],
  ["Connectors", "Коннекторы"],
  ["Voice input", "Голосовой ввод"],
  ["About", "О программе"],
  ["OpenAI Settings", "Настройки OpenAI"],
  ["Sign in", "Вход"],
  ["or", "или"],

  // Common ask-user-question style prompts
  ["Where should I get the sales data from?", "Где взять данные продаж?"],
  ["Data", "Данные"],
  ["Source", "Источник"],
  ["File", "Файл"],
  ["Excel/CSV file", "Excel/CSV файл"],
  ["Other", "Другое"],
];

const regexReplacements = [
  [/Review code for bugs, security issues, performance problems, and best practices/gi, "Провести ревью кода на баги, проблемы безопасности, производительности и соответствие лучшим практикам"],
  [/Download files in Chrome on Windows and macOS/gi, "Скачивать файлы в Chrome на Windows и macOS"],
  [/Create well-structured git commits with conventional commit messages/gi, "Создавать аккуратные git-коммиты с conventional commit сообщениями"],
  [/Automate Google Sheets interactions through browser automation/gi, "Автоматизировать работу с Google Sheets через браузер"],
  [/Research topics on the web, gather information from multiple sources, and summarize findings/gi, "Исследовать темы в интернете, собирать информацию из нескольких источников и подводить итоги"],

  [/Loading agent\.\.\./gi, "Загрузка агента..."],
  [/\bPlan:\b/gi, "План:"],
  [/\bGoal:\b/gi, "Цель:"],
  [/\bSteps:\b/gi, "Шаги:"],
  [/Task:\s*failed/gi, "Задача: ошибка"],

  // Skills menu / button labels
  [/Search skills\.\.\./gi, "Поиск навыков..."],
  [/\bUse Skills\b/gi, "Использовать навыки"],
  [/\bManage\b/gi, "Управление"],
  [/\bCreate\b/gi, "Создать"],
  [/\bRefresh\b/gi, "Обновить"],

  // Dialogs
  [/\bData\b/g, "Данные"],
  [/\bSource\b/g, "Источник"],
  [/Excel\/CSV file/g, "Excel/CSV файл"],
  [/\bOther\b/g, "Другое"],
];

function patchFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return false;

  let src = safeRead(file);
  if (src == null || !src.trim()) return false;

  const original = src;

  for (const [from, to] of exactReplacements) {
    if (src.includes(from)) src = src.split(from).join(to);
  }
  for (const [re, to] of regexReplacements) {
    src = src.replace(re, to);
  }

  if (src !== original) {
    const backup = file + ".bak";
    if (!fs.existsSync(backup)) safeWrite(backup, original);
    safeWrite(file, src);
    return true;
  }
  return false;
}

function main() {
  const files = walk(ROOT);
  const changed = [];

  for (const file of files) {
    if (patchFile(file)) changed.push(path.relative(ROOT, file));
  }

  console.log("Changed files:", changed.length);
  changed.forEach((f) => console.log(" -", f));

  if (!changed.length) {
    console.log("No matching English strings found to replace.");
  } else {
    console.log("✅ Russian localization patch applied.");
  }
}

main();
