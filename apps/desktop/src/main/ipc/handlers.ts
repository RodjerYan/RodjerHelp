import crypto from 'crypto';
import * as path from 'path';
import { ipcMain, BrowserWindow, shell, dialog, nativeTheme } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { URL } from 'url';
import fs from 'fs';
import * as XLSX from 'xlsx';
import {
  isOpenCodeCliInstalled,
  getOpenCodeCliVersion,
  getTaskManager,
  cleanupVertexServiceAccountKey,
} from '../opencode';
import { getLogCollector } from '../logging';
import {
  validateApiKey,
  validateBedrockCredentials,
  fetchBedrockModels,
  validateAzureFoundry,
  testAzureFoundryConnection,
  fetchOpenRouterModels,
  fetchProviderModels,
  testLiteLLMConnection,
  fetchLiteLLMModels,
  validateHttpUrl,
  sanitizeString,
  generateTaskSummary,
  validateTaskConfig,
  analyzeTaskForLearning,
  buildLearningSystemPromptAppend,
  buildRecommendedSkillsAppend,
  buildTaskModeSystemPromptAppend,
  mergeSystemPromptAppend,
  recommendSkillsForTask,
  resolveTaskMemoryContext,
} from '@accomplish_ai/agent-core';
import { createTaskId, createMessageId } from '@accomplish_ai/agent-core';
import {
  storeApiKey,
  getApiKey,
  deleteApiKey,
  getAllApiKeys,
  hasAnyApiKey,
  getBedrockCredentials,
} from '../store/secureStorage';
import {
  testOllamaConnection,
  testLMStudioConnection,
  fetchLMStudioModels,
  validateLMStudioConfig,
} from '@accomplish_ai/agent-core';
import { getStorage } from '../store/storage';
import { getOpenAiOauthStatus } from '@accomplish_ai/agent-core';
import { loginOpenAiWithChatGpt } from '../opencode/auth-browser';
import type {
  ProviderId,
  ConnectedProvider,
  BedrockCredentials,
  McpConnector,
  OAuthMetadata,
  OAuthClientRegistration,
} from '@accomplish_ai/agent-core';
import {
  discoverOAuthMetadata,
  registerOAuthClient,
  generatePkceChallenge,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
} from '@accomplish_ai/agent-core';
import {
  startPermissionApiServer,
  startQuestionApiServer,
  initPermissionApi,
  resolvePermission,
  resolveQuestion,
  isFilePermissionRequest,
  isQuestionRequest,
} from '../permission-api';
import {
  validateElevenLabsApiKey,
  transcribeAudio,
  isElevenLabsConfigured,
} from '../services/speechToText';

import type {
  TaskConfig,
  PermissionResponse,
  TaskMessage,
  SelectedModel,
  OllamaConfig,
  AzureFoundryConfig,
  LiteLLMConfig,
  LMStudioConfig,
  FileAccessMode,
} from '@accomplish_ai/agent-core';
import {
  DEFAULT_PROVIDERS,
  ALLOWED_API_KEY_PROVIDERS,
  STANDARD_VALIDATION_PROVIDERS,
  ZAI_ENDPOINTS,
} from '@accomplish_ai/agent-core';
import { normalizeIpcError, permissionResponseSchema, validate } from './validation';
import { createTaskCallbacks } from './task-callbacks';
import {
  isMockTaskEventsEnabled,
  createMockTask,
  executeMockTaskFlow,
  detectScenarioFromPrompt,
} from '../test-utils/mock-task-flow';
import { skillsManager } from '../skills';
import { registerVertexHandlers } from '../providers';

let lastPickedChatFiles: Array<{ path: string; name: string; size: number; lastModified: number }> =
  [];

const API_KEY_VALIDATION_TIMEOUT_MS = 15000;
const MAX_ATTACHMENT_TEXT_BYTES = 128 * 1024;
const MAX_ATTACHMENT_PREVIEW_CHARS = 128 * 1024;
const MAX_SPREADSHEET_SHEETS = 5;
const MAX_SPREADSHEET_ROWS_PER_SHEET = 60;
const MAX_SPREADSHEET_COLUMNS_PER_ROW = 20;
const MAX_PRESENTATION_SLIDES = 12;
const MAX_IMAGE_OCR_BYTES = 15 * 1024 * 1024;
type SpreadsheetCell = string | number | boolean | Date | null | undefined;
type SpreadsheetRow = SpreadsheetCell[];
type SupportedTextEncoding = 'utf8' | 'utf16le' | 'utf16be';
type AttachmentPreviewResult = {
  text?: string;
  error?: string;
  truncated?: boolean;
};

function isSpreadsheetAttachment(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return ['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods'].includes(extension);
}

function isPdfAttachment(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

function isWordAttachment(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return ['.docx', '.odt'].includes(extension);
}

function isPresentationAttachment(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return ['.pptx', '.ppsx', '.potx', '.odp'].includes(extension);
}

function isImageAttachment(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.svg'].includes(
    extension,
  );
}

function stringifySpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).replace(/\r?\n/g, ' ').trim();
}

function buildSpreadsheetPreview(filePath: string): string {
  const workbookBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(workbookBuffer, {
    type: 'buffer',
    cellDates: true,
    dense: true,
  });
  const sheetNames: string[] = workbook.SheetNames.slice(0, MAX_SPREADSHEET_SHEETS);

  const sections = sheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows: SpreadsheetRow[] = XLSX.utils.sheet_to_json<SpreadsheetRow>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });

    const totalRows = rows.length;
    const previewRows = rows.slice(0, MAX_SPREADSHEET_ROWS_PER_SHEET).map((row: SpreadsheetRow) => {
      return row
        .slice(0, MAX_SPREADSHEET_COLUMNS_PER_ROW)
        .map((cell: SpreadsheetCell) => stringifySpreadsheetCell(cell))
        .join(' | ');
    });

    const truncatedRows =
      totalRows > MAX_SPREADSHEET_ROWS_PER_SHEET
        ? `\n[Rows truncated: showing first ${MAX_SPREADSHEET_ROWS_PER_SHEET} of ${totalRows}]`
        : '';

    return `### Sheet: ${sheetName}\n${previewRows.join('\n')}${truncatedRows}`;
  });

  const omittedSheets =
    workbook.SheetNames.length > MAX_SPREADSHEET_SHEETS
      ? `\n[Sheets truncated: showing first ${MAX_SPREADSHEET_SHEETS} of ${workbook.SheetNames.length}]`
      : '';

  return `[Spreadsheet workbook]\n${sections.join('\n\n')}${omittedSheets}`;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncatePreviewText(value: string, maxChars = MAX_ATTACHMENT_PREVIEW_CHARS): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n[Preview truncated]`;
}

function extractXmlText(xml: string): string {
  const withLineBreaks = xml
    .replace(/<text:line-break\s*\/>/gi, '\n')
    .replace(/<text:tab\s*\/>/gi, '\t')
    .replace(/<\/(?:text:p|text:h|w:p|a:p|table:table-row)>/gi, '\n')
    .replace(/<a:br\s*\/>/gi, '\n');
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, ' ');
  return normalizeExtractedText(decodeXmlEntities(withoutTags));
}

function extractPresentationText(xml: string): string {
  const textRuns = [
    ...xml.matchAll(/<(?:a:t|text:span|text:p)[^>]*>([\s\S]*?)<\/(?:a:t|text:span|text:p)>/gi),
  ]
    .map((match) => decodeXmlEntities(match[1] ?? '').trim())
    .filter(Boolean);

  if (textRuns.length > 0) {
    return normalizeExtractedText(textRuns.join('\n'));
  }

  return extractXmlText(xml);
}

function compareZipEntryNumbers(left: string, right: string): number {
  const leftMatch = left.match(/(\d+)(?!.*\d)/);
  const rightMatch = right.match(/(\d+)(?!.*\d)/);
  const leftNumber = leftMatch ? Number(leftMatch[1]) : 0;
  const rightNumber = rightMatch ? Number(rightMatch[1]) : 0;

  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}

function detectTextEncoding(buffer: Buffer): SupportedTextEncoding | null {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf8';
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return 'utf16le';
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return 'utf16be';
  }

  const sampleLength = Math.min(buffer.length, 4096);
  if (sampleLength < 4) {
    return 'utf8';
  }

  let zeroOnEvenIndex = 0;
  let zeroOnOddIndex = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] !== 0) {
      continue;
    }

    if (index % 2 === 0) {
      zeroOnEvenIndex += 1;
    } else {
      zeroOnOddIndex += 1;
    }
  }

  const evenRatio = zeroOnEvenIndex / Math.ceil(sampleLength / 2);
  const oddRatio = zeroOnOddIndex / Math.floor(sampleLength / 2);

  if (oddRatio > 0.35 && evenRatio < 0.1) {
    return 'utf16le';
  }

  if (evenRatio > 0.35 && oddRatio < 0.1) {
    return 'utf16be';
  }

  if (buffer.subarray(0, sampleLength).includes(0)) {
    return null;
  }

  return 'utf8';
}

function decodeTextBuffer(buffer: Buffer, encoding: SupportedTextEncoding): string {
  if (encoding === 'utf8') {
    return buffer.toString('utf8');
  }

  if (encoding === 'utf16le') {
    const startOffset = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe ? 2 : 0;
    const evenLength = Math.floor((buffer.length - startOffset) / 2) * 2;
    return buffer.subarray(startOffset, startOffset + evenLength).toString('utf16le');
  }

  const startOffset = buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff ? 2 : 0;
  const evenLength = Math.floor((buffer.length - startOffset) / 2) * 2;
  const swapped = Buffer.from(buffer.subarray(startOffset, startOffset + evenLength));

  for (let index = 0; index < swapped.length; index += 2) {
    const current = swapped[index];
    swapped[index] = swapped[index + 1];
    swapped[index + 1] = current;
  }

  return swapped.toString('utf16le');
}

async function buildZipXmlPreview(
  filePath: string,
  options: {
    header: string;
    entryNames?: string[];
    entryPattern?: RegExp;
    maxEntries?: number;
    extractor?: (xml: string) => string;
    sectionLabel?: (entryName: string, index: number) => string;
  },
): Promise<string> {
  const jszipModule = await import('jszip');
  const JSZip = jszipModule.default;
  const archive = await JSZip.loadAsync(fs.readFileSync(filePath));

  const extractor = options.extractor ?? extractXmlText;
  let entryNames = options.entryNames ?? [];
  if (entryNames.length === 0 && options.entryPattern) {
    entryNames = Object.keys(archive.files)
      .filter((entryName) => options.entryPattern?.test(entryName))
      .sort(compareZipEntryNumbers);
  }

  const maxEntries = options.maxEntries ?? entryNames.length;
  const previewEntries = entryNames.slice(0, maxEntries);
  const sections: string[] = [];

  for (let index = 0; index < previewEntries.length; index += 1) {
    const entryName = previewEntries[index];
    const zipEntry = archive.file(entryName);
    if (!zipEntry) {
      continue;
    }

    const xml = await zipEntry.async('string');
    const text = extractor(xml);
    if (!text) {
      continue;
    }

    if (options.sectionLabel) {
      sections.push(`### ${options.sectionLabel(entryName, index + 1)}\n${text}`);
    } else {
      sections.push(text);
    }
  }

  const omittedEntries = entryNames.length > previewEntries.length;
  const suffix = omittedEntries
    ? `\n[Sections truncated: showing first ${previewEntries.length} of ${entryNames.length}]`
    : '';

  if (sections.length === 0) {
    return `${options.header}\nNo readable text was detected.${suffix}`;
  }

  return `${options.header}\n${sections.join('\n\n')}${suffix}`;
}

async function buildPdfPreview(filePath: string): Promise<string> {
  const pdfParseModule = await import('pdf-parse');
  const { PDFParse } = pdfParseModule;
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });

  try {
    const result = await parser.getText();
    const text = normalizeExtractedText(result.text ?? '');
    if (text) {
      return `[PDF document]\n${truncatePreviewText(text)}`;
    }

    return '[PDF document]\nNo selectable text was detected in the PDF.';
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function buildWordPreview(filePath: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.odt') {
    return buildZipXmlPreview(filePath, {
      header: '[OpenDocument text]',
      entryNames: ['content.xml'],
    });
  }

  const mammothModule = await import('mammoth');
  const mammoth = 'default' in mammothModule ? mammothModule.default : mammothModule;
  const result = await mammoth.extractRawText({ path: filePath });
  const text = normalizeExtractedText(result.value ?? '');

  if (!text) {
    return '[Word document]\nNo readable text was detected.';
  }

  return `[Word document]\n${truncatePreviewText(text)}`;
}

async function buildPresentationPreview(filePath: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.odp') {
    return buildZipXmlPreview(filePath, {
      header: '[OpenDocument presentation]',
      entryNames: ['content.xml'],
    });
  }

  return buildZipXmlPreview(filePath, {
    header: '[Presentation deck]',
    entryPattern: /^ppt\/slides\/slide\d+\.xml$/i,
    maxEntries: MAX_PRESENTATION_SLIDES,
    extractor: extractPresentationText,
    sectionLabel: (_entryName, index) => `Slide ${index}`,
  });
}

async function recognizeImageText(
  image: string | Buffer,
  loggerLabel: string,
): Promise<string | null> {
  const tesseractModule = await import('tesseract.js');
  const worker = await tesseractModule.createWorker(['rus', 'eng'], undefined, {
    logger: () => undefined,
    errorHandler: () => undefined,
  });

  try {
    const result = await worker.recognize(image, { rotateAuto: true });
    const text = normalizeExtractedText(result.data.text ?? '');
    if (!text) {
      return null;
    }

    return `[Image OCR: ${loggerLabel}]\n${truncatePreviewText(text)}`;
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

async function buildImagePreview(filePath: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.svg') {
    const text = extractXmlText(fs.readFileSync(filePath, 'utf8'));
    if (!text) {
      return '[SVG image]\nNo readable text was detected.';
    }

    return `[SVG image]\n${truncatePreviewText(text)}`;
  }

  const stat = fs.statSync(filePath);
  if (stat.size > MAX_IMAGE_OCR_BYTES) {
    return `[Image attachment]\nOCR skipped because the image is larger than ${Math.round(MAX_IMAGE_OCR_BYTES / (1024 * 1024))} MB.`;
  }

  const text = await recognizeImageText(filePath, path.basename(filePath));
  if (!text) {
    return '[Image attachment]\nNo readable text was detected in the image.';
  }

  return text;
}

function buildGenericTextPreview(filePath: string, maxBytes: number): AttachmentPreviewResult {
  const buffer = fs.readFileSync(filePath);
  const encoding = detectTextEncoding(buffer);
  if (!encoding) {
    return {
      error: 'Binary file preview is not supported',
    };
  }

  let previewBuffer = buffer;
  if (encoding === 'utf16le' || encoding === 'utf16be') {
    const safeLength = Math.floor(Math.min(buffer.length, maxBytes) / 2) * 2;
    previewBuffer = buffer.subarray(0, safeLength);
  } else {
    previewBuffer = buffer.subarray(0, maxBytes);
  }

  const decodedText = normalizeExtractedText(decodeTextBuffer(previewBuffer, encoding));
  return {
    text: truncatePreviewText(decodedText || '[Text file is empty]'),
    truncated: buffer.length > previewBuffer.length,
  };
}

async function buildAttachmentPreview(
  filePath: string,
  maxBytes: number,
): Promise<AttachmentPreviewResult> {
  if (isSpreadsheetAttachment(filePath)) {
    return {
      text: buildSpreadsheetPreview(filePath),
    };
  }

  if (isPdfAttachment(filePath)) {
    return {
      text: await buildPdfPreview(filePath),
    };
  }

  if (isWordAttachment(filePath)) {
    return {
      text: await buildWordPreview(filePath),
    };
  }

  if (isPresentationAttachment(filePath)) {
    return {
      text: await buildPresentationPreview(filePath),
    };
  }

  if (isImageAttachment(filePath)) {
    return {
      text: await buildImagePreview(filePath),
    };
  }

  return buildGenericTextPreview(filePath, maxBytes);
}

function assertTrustedWindow(window: BrowserWindow | null): BrowserWindow {
  if (!window || window.isDestroyed()) {
    throw new Error('Untrusted window');
  }

  const focused = BrowserWindow.getFocusedWindow();
  if (BrowserWindow.getAllWindows().length > 1 && focused && focused.id !== window.id) {
    throw new Error('IPC request must originate from the focused window');
  }

  return window;
}

function isE2ESkipAuthEnabled(): boolean {
  return (
    (global as Record<string, unknown>).E2E_SKIP_AUTH === true ||
    process.argv.includes('--e2e-skip-auth') ||
    process.env.E2E_SKIP_AUTH === '1'
  );
}

function persistLearningFromTask(taskId: string): void {
  const storage = getStorage();
  if (!storage.getSelfLearningEnabled()) {
    return;
  }

  const task = storage.getTask(taskId);
  if (!task) {
    return;
  }

  const scope = resolveTaskMemoryContext({
    prompt: task.prompt,
    taskMode: task.taskMode,
    memoryContext: task.memoryContext,
  });
  const insights = analyzeTaskForLearning(task, scope);
  for (const insight of insights) {
    storage.upsertLearningInsight(insight);
  }
}

async function appendTaskIntelligenceContext(config: TaskConfig): Promise<TaskConfig> {
  const storage = getStorage();
  const memoryContext = resolveTaskMemoryContext(config);
  const relevantInsights = storage
    .listLearningInsights()
    .filter(
      (insight) => insight.scopeKey === 'global' || insight.scopeKey === memoryContext.scopeKey,
    );
  const learningAppend = buildLearningSystemPromptAppend({
    prompt: config.prompt,
    insights: relevantInsights,
    settings: storage.getLearningSettings(),
  });
  const taskModeAppend = buildTaskModeSystemPromptAppend(config.taskMode);
  const enabledSkills = await skillsManager.getEnabled().catch(() => []);
  const recommendedSkills = recommendSkillsForTask({
    prompt: config.prompt,
    taskMode: config.taskMode,
    skills: enabledSkills,
  });
  const skillsAppend = buildRecommendedSkillsAppend(recommendedSkills);

  return {
    ...config,
    memoryContext: memoryContext.memoryContext ?? config.memoryContext,
    systemPromptAppend: mergeSystemPromptAppend(
      mergeSystemPromptAppend(
        mergeSystemPromptAppend(config.systemPromptAppend, learningAppend),
        taskModeAppend,
      ),
      skillsAppend,
    ),
  };
}

function handle<Args extends unknown[], ReturnType = unknown>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => ReturnType,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as Args));
    } catch (error) {
      console.error(`IPC handler ${channel} failed`, error);
      throw normalizeIpcError(error);
    }
  });
}

export function registerIPCHandlers(): void {
  const storage = getStorage();
  const taskManager = getTaskManager();

  let permissionApiInitialized = false;

  handle('task:start', async (event: IpcMainInvokeEvent, config: TaskConfig) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedConfig = await appendTaskIntelligenceContext(validateTaskConfig(config));

    if (!isMockTaskEventsEnabled() && !storage.hasReadyProvider()) {
      throw new Error(
        'No provider is ready. Please connect a provider and select a model in Settings.',
      );
    }

    if (!permissionApiInitialized) {
      initPermissionApi(
        window,
        () => taskManager.getActiveTaskId(),
        () => storage.getFileAccessMode(),
      );
      startPermissionApiServer();
      startQuestionApiServer();
      permissionApiInitialized = true;
    }

    const taskId = createTaskId();

    if (isMockTaskEventsEnabled()) {
      const mockTask = createMockTask(taskId, validatedConfig.prompt);
      const scenario = detectScenarioFromPrompt(validatedConfig.prompt);

      storage.saveTask(mockTask);

      void executeMockTaskFlow(window, {
        taskId,
        prompt: validatedConfig.prompt,
        scenario,
        delayMs: 50,
      });

      return mockTask;
    }

    const activeModel = storage.getActiveProviderModel();
    const selectedModel = activeModel || storage.getSelectedModel();
    if (selectedModel?.model) {
      validatedConfig.modelId = selectedModel.model;
    }

    const callbacks = createTaskCallbacks({
      taskId,
      window,
      sender,
    });

    const task = await taskManager.startTask(taskId, validatedConfig, callbacks);
    task.taskMode = validatedConfig.taskMode;
    task.memoryContext = validatedConfig.memoryContext;

    const initialUserMessage: TaskMessage = {
      id: createMessageId(),
      type: 'user',
      content: validatedConfig.prompt,
      timestamp: new Date().toISOString(),
    };
    task.messages = [initialUserMessage];

    storage.saveTask(task);

    generateTaskSummary(validatedConfig.prompt, getApiKey)
      .then((summary) => {
        storage.updateTaskSummary(taskId, summary);
        persistLearningFromTask(taskId);
        if (!window.isDestroyed() && !sender.isDestroyed()) {
          sender.send('task:summary', { taskId, summary });
        }
      })
      .catch((err) => {
        console.warn('[IPC] Failed to generate task summary:', err);
      });

    return task;
  });

  handle('task:cancel', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) return;

    if (taskManager.isTaskQueued(taskId)) {
      taskManager.cancelQueuedTask(taskId);
      storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
      return;
    }

    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.cancelTask(taskId);
      storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
    }
  });

  handle('task:interrupt', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) return;

    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.interruptTask(taskId);
    }
  });

  handle('task:get', async (_event: IpcMainInvokeEvent, taskId: string) => {
    return storage.getTask(taskId) || null;
  });

  handle('task:list', async (_event: IpcMainInvokeEvent) => {
    return storage.getTasks();
  });

  handle('task:delete', async (_event: IpcMainInvokeEvent, taskId: string) => {
    storage.deleteTask(taskId);
  });

  handle('task:clear-history', async (_event: IpcMainInvokeEvent) => {
    storage.clearHistory();
  });

  handle('task:get-todos', async (_event: IpcMainInvokeEvent, taskId: string) => {
    return storage.getTodosForTask(taskId);
  });

  handle('permission:respond', async (_event: IpcMainInvokeEvent, response: PermissionResponse) => {
    const parsedResponse = validate(permissionResponseSchema, response);
    const { taskId, decision, requestId } = parsedResponse;

    if (requestId && isFilePermissionRequest(requestId)) {
      const allowed = decision === 'allow';
      const resolved = resolvePermission(requestId, allowed);
      if (resolved) {
        return;
      }
      console.warn(`[IPC] File permission request ${requestId} not found in pending requests`);
    }

    if (requestId && isQuestionRequest(requestId)) {
      const denied = decision === 'deny';
      const resolved = resolveQuestion(requestId, {
        selectedOptions: parsedResponse.selectedOptions,
        customText: parsedResponse.customText,
        denied,
      });
      if (resolved) {
        return;
      }
      console.warn(`[IPC] Question request ${requestId} not found in pending requests`);
    }

    if (!taskManager.hasActiveTask(taskId)) {
      console.warn(`[IPC] Permission response for inactive task ${taskId}`);
      return;
    }

    if (decision === 'allow') {
      const message = parsedResponse.selectedOptions?.join(', ') || parsedResponse.message || 'yes';
      const sanitizedMessage = sanitizeString(message, 'permissionResponse', 1024);
      await taskManager.sendResponse(taskId, sanitizedMessage);
    } else {
      await taskManager.sendResponse(taskId, 'no');
    }
  });

  handle(
    'session:resume',
    async (
      event: IpcMainInvokeEvent,
      sessionId: string,
      prompt: string,
      existingTaskId?: string,
      options?: { taskMode?: TaskConfig['taskMode']; memoryContext?: string },
    ) => {
      const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
      const sender = event.sender;
      const validatedSessionId = sanitizeString(sessionId, 'sessionId', 128);
      const validatedPrompt = sanitizeString(prompt, 'prompt');
      const validatedExistingTaskId = existingTaskId
        ? sanitizeString(existingTaskId, 'taskId', 128)
        : undefined;
      const validatedOptions = options
        ? validateTaskConfig({ prompt: validatedPrompt, ...options })
        : undefined;

      if (!isMockTaskEventsEnabled() && !storage.hasReadyProvider()) {
        throw new Error(
          'No provider is ready. Please connect a provider and select a model in Settings.',
        );
      }

      const taskId = validatedExistingTaskId || createTaskId();

      if (validatedExistingTaskId && validatedPrompt.trim().length > 0) {
        const userMessage: TaskMessage = {
          id: createMessageId(),
          type: 'user',
          content: validatedPrompt,
          timestamp: new Date().toISOString(),
        };
        storage.addTaskMessage(validatedExistingTaskId, userMessage);
      }

      const activeModelForResume = storage.getActiveProviderModel();
      const selectedModelForResume = activeModelForResume || storage.getSelectedModel();

      const callbacks = createTaskCallbacks({
        taskId,
        window,
        sender,
      });

      const existingTask = validatedExistingTaskId
        ? storage.getTask(validatedExistingTaskId)
        : undefined;
      const resumeConfig = await appendTaskIntelligenceContext({
        prompt: validatedPrompt,
        sessionId: validatedSessionId,
        taskId,
        modelId: selectedModelForResume?.model,
        taskMode: validatedOptions?.taskMode || existingTask?.taskMode,
        memoryContext: validatedOptions?.memoryContext || existingTask?.memoryContext,
      });

      const task = await taskManager.startTask(taskId, resumeConfig, callbacks);
      task.taskMode = resumeConfig.taskMode;
      task.memoryContext = resumeConfig.memoryContext;

      if (validatedExistingTaskId) {
        storage.updateTaskStatus(validatedExistingTaskId, task.status, new Date().toISOString());
        storage.updateTaskSessionId(validatedExistingTaskId, validatedSessionId);
        const existingTask = storage.getTask(validatedExistingTaskId);
        if (existingTask) {
          return {
            ...existingTask,
            status: task.status,
            sessionId: validatedSessionId,
            updatedAt: new Date().toISOString(),
          };
        }
      }

      return task;
    },
  );

  handle('settings:api-keys', async (_event: IpcMainInvokeEvent) => {
    const storedKeys = await getAllApiKeys();

    const keys = Object.entries(storedKeys)
      .filter(([_provider, apiKey]) => apiKey !== null)
      .map(([provider, apiKey]) => {
        let keyPrefix = '';
        if (provider === 'bedrock') {
          const bedrockCreds = getBedrockCredentials();
          if (bedrockCreds) {
            if (bedrockCreds.authType === 'accessKeys') {
              keyPrefix = `${bedrockCreds.accessKeyId?.substring(0, 8) || 'AKIA'}...`;
            } else if (bedrockCreds.authType === 'profile') {
              keyPrefix = `Profile: ${bedrockCreds.profileName || 'default'}`;
            } else {
              keyPrefix = 'AWS Credentials';
            }
          } else {
            keyPrefix = 'AWS Credentials';
          }
        } else if (provider === 'vertex') {
          try {
            const vertexCreds = apiKey ? JSON.parse(apiKey) : null;
            if (vertexCreds?.projectId) {
              keyPrefix = `${vertexCreds.projectId} (${vertexCreds.location || 'unknown'})`;
            } else {
              keyPrefix = 'GCP Credentials';
            }
          } catch {
            keyPrefix = 'GCP Credentials';
          }
        } else {
          keyPrefix = apiKey && apiKey.length > 0 ? `${apiKey.substring(0, 8)}...` : '';
        }

        const labelMap: Record<string, string> = {
          bedrock: 'AWS Credentials',
          vertex: 'GCP Credentials',
        };

        return {
          id: `local-${provider}`,
          provider,
          label: labelMap[provider] || 'Local API Key',
          keyPrefix,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
      });

    const azureConfig = storage.getAzureFoundryConfig();
    const hasAzureKey = keys.some((k) => k.provider === 'azure-foundry');

    if (azureConfig && azureConfig.authType === 'entra-id' && !hasAzureKey) {
      keys.push({
        id: 'local-azure-foundry',
        provider: 'azure-foundry',
        label: 'Azure Foundry (Entra ID)',
        keyPrefix: 'Entra ID',
        isActive: azureConfig.enabled ?? true,
        createdAt: new Date().toISOString(),
      });
    }

    return keys;
  });

  handle(
    'settings:add-api-key',
    async (_event: IpcMainInvokeEvent, provider: string, key: string, label?: string) => {
      if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
        throw new Error('Unsupported API key provider');
      }
      const sanitizedKey = sanitizeString(key, 'apiKey', 256);
      const sanitizedLabel = label ? sanitizeString(label, 'label', 128) : undefined;

      await storeApiKey(provider, sanitizedKey);

      return {
        id: `local-${provider}`,
        provider,
        label: sanitizedLabel || 'Local API Key',
        keyPrefix: sanitizedKey.substring(0, 8) + '...',
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    },
  );

  handle('settings:remove-api-key', async (_event: IpcMainInvokeEvent, id: string) => {
    const sanitizedId = sanitizeString(id, 'id', 128);
    const provider = sanitizedId.replace('local-', '');
    await deleteApiKey(provider);
  });

  handle('api-key:exists', async (_event: IpcMainInvokeEvent) => {
    const apiKey = await getApiKey('anthropic');
    return Boolean(apiKey);
  });

  handle('api-key:set', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    await storeApiKey('anthropic', sanitizedKey);
  });

  handle('api-key:get', async (_event: IpcMainInvokeEvent) => {
    return getApiKey('anthropic');
  });

  handle('api-key:validate', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    console.log('[API Key] Validation requested for provider: anthropic');

    const result = await validateApiKey('anthropic', sanitizedKey, {
      timeout: API_KEY_VALIDATION_TIMEOUT_MS,
    });

    if (result.valid) {
      console.log('[API Key] Validation succeeded');
    } else {
      console.warn('[API Key] Validation failed', { error: result.error });
    }

    return result;
  });

  handle(
    'api-key:validate-provider',
    async (
      _event: IpcMainInvokeEvent,
      provider: string,
      key: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options?: Record<string, any>,
    ) => {
      if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
        return { valid: false, error: 'Unsupported provider' };
      }

      console.log(`[API Key] Validation requested for provider: ${provider}`);

      if (STANDARD_VALIDATION_PROVIDERS.has(provider)) {
        let sanitizedKey: string;
        try {
          sanitizedKey = sanitizeString(key, 'apiKey', 256);
        } catch (e) {
          return { valid: false, error: e instanceof Error ? e.message : 'Invalid API key' };
        }

        const result = await validateApiKey(
          provider as import('@accomplish_ai/agent-core').ProviderType,
          sanitizedKey,
          {
            timeout: API_KEY_VALIDATION_TIMEOUT_MS,
            baseUrl:
              provider === 'openai' ? storage.getOpenAiBaseUrl().trim() || undefined : undefined,
            zaiRegion:
              provider === 'zai'
                ? (options?.region as import('@accomplish_ai/agent-core').ZaiRegion) ||
                  'international'
                : undefined,
          },
        );

        if (result.valid) {
          console.log(`[API Key] Validation succeeded for ${provider}`);
        } else {
          console.warn(`[API Key] Validation failed for ${provider}`, { error: result.error });
        }

        return result;
      }

      if (provider === 'azure-foundry') {
        const config = storage.getAzureFoundryConfig();
        const result = await validateAzureFoundry(config, {
          apiKey: key,
          baseUrl: options?.baseUrl,
          deploymentName: options?.deploymentName,
          authType: options?.authType,
          timeout: API_KEY_VALIDATION_TIMEOUT_MS,
        });

        if (result.valid) {
          console.log(`[API Key] Validation succeeded for ${provider}`);
        } else {
          console.warn(`[API Key] Validation failed for ${provider}`, { error: result.error });
        }

        return result;
      }

      console.log(`[API Key] Skipping validation for ${provider} (local/custom provider)`);
      return { valid: true };
    },
  );

  handle('bedrock:validate', async (_event: IpcMainInvokeEvent, credentials: string) => {
    console.log('[Bedrock] Validation requested');
    return validateBedrockCredentials(credentials);
  });

  handle('bedrock:fetch-models', async (_event: IpcMainInvokeEvent, credentialsJson: string) => {
    try {
      const credentials = JSON.parse(credentialsJson) as BedrockCredentials;
      const result = await fetchBedrockModels(credentials);
      if (!result.success && result.error) {
        return { success: false, error: normalizeIpcError(result.error), models: [] };
      }
      return result;
    } catch (error) {
      console.error('[Bedrock] Failed to fetch models:', error);
      return { success: false, error: normalizeIpcError(error), models: [] };
    }
  });

  handle('bedrock:save', async (_event: IpcMainInvokeEvent, credentials: string) => {
    const parsed = JSON.parse(credentials);

    if (parsed.authType === 'apiKey') {
      if (!parsed.apiKey) {
        throw new Error('API Key is required');
      }
    } else if (parsed.authType === 'accessKeys') {
      if (!parsed.accessKeyId || !parsed.secretAccessKey) {
        throw new Error('Access Key ID and Secret Access Key are required');
      }
    } else if (parsed.authType === 'profile') {
      if (!parsed.profileName) {
        throw new Error('Profile name is required');
      }
    } else {
      throw new Error('Invalid authentication type');
    }

    storeApiKey('bedrock', credentials);

    let label: string;
    let keyPrefix: string;
    if (parsed.authType === 'apiKey') {
      label = 'Bedrock API Key';
      keyPrefix = `${parsed.apiKey.substring(0, 8)}...`;
    } else if (parsed.authType === 'accessKeys') {
      label = 'AWS Access Keys';
      keyPrefix = `${parsed.accessKeyId.substring(0, 8)}...`;
    } else {
      label = `AWS Profile: ${parsed.profileName}`;
      keyPrefix = parsed.profileName;
    }

    return {
      id: 'local-bedrock',
      provider: 'bedrock',
      label,
      keyPrefix,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  });

  handle('bedrock:get-credentials', async (_event: IpcMainInvokeEvent) => {
    const stored = getApiKey('bedrock');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });

  // Vertex AI handlers
  registerVertexHandlers(handle);

  handle('api-key:clear', async (_event: IpcMainInvokeEvent) => {
    await deleteApiKey('anthropic');
  });

  handle('opencode:check', async (_event: IpcMainInvokeEvent) => {
    if (isE2ESkipAuthEnabled()) {
      return {
        installed: true,
        version: '1.0.0-test',
        installCommand: 'npm install -g opencode-ai',
      };
    }

    const installed = await isOpenCodeCliInstalled();
    const version = installed ? await getOpenCodeCliVersion() : null;
    return {
      installed,
      version,
      installCommand: 'npm install -g opencode-ai',
    };
  });

  handle('opencode:version', async (_event: IpcMainInvokeEvent) => {
    return getOpenCodeCliVersion();
  });

  handle('model:get', async (_event: IpcMainInvokeEvent) => {
    return storage.getSelectedModel();
  });

  handle('model:set', async (_event: IpcMainInvokeEvent, model: SelectedModel) => {
    if (!model || typeof model.provider !== 'string' || typeof model.model !== 'string') {
      throw new Error('Invalid model configuration');
    }
    storage.setSelectedModel(model);
  });

  handle('ollama:test-connection', async (_event: IpcMainInvokeEvent, url: string) => {
    return testOllamaConnection(url);
  });

  handle('ollama:get-config', async (_event: IpcMainInvokeEvent) => {
    return storage.getOllamaConfig();
  });

  handle('ollama:set-config', async (_event: IpcMainInvokeEvent, config: OllamaConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid Ollama configuration');
      }
      validateHttpUrl(config.baseUrl, 'Ollama base URL');
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid Ollama configuration');
      }
      if (config.models !== undefined) {
        if (!Array.isArray(config.models)) {
          throw new Error('Invalid Ollama configuration: models must be an array');
        }
        for (const model of config.models) {
          if (
            typeof model.id !== 'string' ||
            typeof model.displayName !== 'string' ||
            typeof model.size !== 'number'
          ) {
            throw new Error('Invalid Ollama configuration: invalid model format');
          }
        }
      }
    }
    storage.setOllamaConfig(config);
  });

  handle('azure-foundry:get-config', async (_event: IpcMainInvokeEvent) => {
    return storage.getAzureFoundryConfig();
  });

  handle(
    'azure-foundry:set-config',
    async (_event: IpcMainInvokeEvent, config: AzureFoundryConfig | null) => {
      if (config !== null) {
        if (typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) {
          throw new Error('Invalid Azure Foundry configuration: baseUrl is required');
        }
        if (typeof config.deploymentName !== 'string' || !config.deploymentName.trim()) {
          throw new Error('Invalid Azure Foundry configuration: deploymentName is required');
        }
        if (config.authType !== 'api-key' && config.authType !== 'entra-id') {
          throw new Error(
            'Invalid Azure Foundry configuration: authType must be api-key or entra-id',
          );
        }
        if (typeof config.enabled !== 'boolean') {
          throw new Error('Invalid Azure Foundry configuration: enabled must be a boolean');
        }
        try {
          validateHttpUrl(config.baseUrl, 'Azure Foundry base URL');
        } catch {
          throw new Error('Invalid Azure Foundry configuration: Invalid base URL format');
        }
      }
      storage.setAzureFoundryConfig(config);
    },
  );

  handle(
    'azure-foundry:test-connection',
    async (
      _event: IpcMainInvokeEvent,
      config: {
        endpoint: string;
        deploymentName: string;
        authType: 'api-key' | 'entra-id';
        apiKey?: string;
      },
    ) => {
      return testAzureFoundryConnection({
        endpoint: config.endpoint,
        deploymentName: config.deploymentName,
        authType: config.authType,
        apiKey: config.apiKey,
        timeout: API_KEY_VALIDATION_TIMEOUT_MS,
      });
    },
  );

  handle(
    'azure-foundry:save-config',
    async (
      _event: IpcMainInvokeEvent,
      config: {
        endpoint: string;
        deploymentName: string;
        authType: 'api-key' | 'entra-id';
        apiKey?: string;
      },
    ) => {
      const { endpoint, deploymentName, authType, apiKey } = config;

      if (authType === 'api-key' && apiKey) {
        storeApiKey('azure-foundry', apiKey);
      }

      const azureConfig: AzureFoundryConfig = {
        baseUrl: endpoint,
        deploymentName,
        authType,
        enabled: true,
        lastValidated: Date.now(),
      };
      storage.setAzureFoundryConfig(azureConfig);

      console.log('[Azure Foundry] Config saved for new provider settings:', {
        endpoint,
        deploymentName,
        authType,
        hasApiKey: !!apiKey,
      });
    },
  );

  handle('openrouter:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('openrouter');
    return fetchOpenRouterModels(apiKey || '', API_KEY_VALIDATION_TIMEOUT_MS);
  });

  handle(
    'litellm:test-connection',
    async (_event: IpcMainInvokeEvent, url: string, apiKey?: string) => {
      return testLiteLLMConnection(url, apiKey);
    },
  );

  handle('litellm:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = storage.getLiteLLMConfig();
    const apiKey = getApiKey('litellm');
    return fetchLiteLLMModels({ config, apiKey: apiKey || undefined });
  });

  handle('litellm:get-config', async (_event: IpcMainInvokeEvent) => {
    return storage.getLiteLLMConfig();
  });

  handle('litellm:set-config', async (_event: IpcMainInvokeEvent, config: LiteLLMConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid LiteLLM configuration');
      }
      validateHttpUrl(config.baseUrl, 'LiteLLM base URL');
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid LiteLLM configuration');
      }
      if (config.models !== undefined) {
        if (!Array.isArray(config.models)) {
          throw new Error('Invalid LiteLLM configuration: models must be an array');
        }
        for (const model of config.models) {
          if (
            typeof model.id !== 'string' ||
            typeof model.name !== 'string' ||
            typeof model.provider !== 'string'
          ) {
            throw new Error('Invalid LiteLLM configuration: invalid model format');
          }
        }
      }
    }
    storage.setLiteLLMConfig(config);
  });

  handle('lmstudio:test-connection', async (_event: IpcMainInvokeEvent, url: string) => {
    return testLMStudioConnection({ url });
  });

  handle('lmstudio:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = storage.getLMStudioConfig();
    if (!config || !config.baseUrl) {
      return { success: false, error: 'No LM Studio configured' };
    }

    return fetchLMStudioModels({ baseUrl: config.baseUrl });
  });

  handle('lmstudio:get-config', async (_event: IpcMainInvokeEvent) => {
    return storage.getLMStudioConfig();
  });

  handle(
    'lmstudio:set-config',
    async (_event: IpcMainInvokeEvent, config: LMStudioConfig | null) => {
      if (config !== null) {
        validateLMStudioConfig(config);
      }
      storage.setLMStudioConfig(config);
    },
  );

  handle(
    'provider:fetch-models',
    async (
      _event: IpcMainInvokeEvent,
      providerId: string,
      options?: { baseUrl?: string; zaiRegion?: string },
    ) => {
      const providerConfig = DEFAULT_PROVIDERS.find((p) => p.id === providerId);
      if (!providerConfig?.modelsEndpoint) {
        return { success: false, error: 'No models endpoint configured for this provider' };
      }

      const apiKey = getApiKey(providerId);
      if (!apiKey) {
        return { success: false, error: 'No API key found for this provider' };
      }

      let urlOverride: string | undefined;
      if (providerId === 'openai' && options?.baseUrl) {
        urlOverride = `${options.baseUrl.replace(/\/+$/, '')}/models`;
      }
      if (providerId === 'zai' && options?.zaiRegion) {
        const region = options.zaiRegion as import('@accomplish_ai/agent-core').ZaiRegion;
        urlOverride = `${ZAI_ENDPOINTS[region]}/models`;
      }

      return fetchProviderModels({
        endpointConfig: providerConfig.modelsEndpoint,
        apiKey,
        urlOverride,
        timeout: API_KEY_VALIDATION_TIMEOUT_MS,
      });
    },
  );

  handle('api-keys:all', async (_event: IpcMainInvokeEvent) => {
    const keys = await getAllApiKeys();
    const masked: Record<string, { exists: boolean; prefix?: string }> = {};
    for (const [provider, key] of Object.entries(keys)) {
      masked[provider] = {
        exists: Boolean(key),
        prefix: key ? key.substring(0, 8) + '...' : undefined,
      };
    }
    return masked;
  });

  handle('api-keys:has-any', async (_event: IpcMainInvokeEvent) => {
    if (isMockTaskEventsEnabled()) {
      return true;
    }
    const hasKey = await hasAnyApiKey();
    if (hasKey) return true;
    return getOpenAiOauthStatus().connected;
  });

  handle('settings:debug-mode', async (_event: IpcMainInvokeEvent) => {
    return storage.getDebugMode();
  });

  handle('settings:set-debug-mode', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid debug mode flag');
    }
    storage.setDebugMode(enabled);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('settings:debug-mode-changed', { enabled });
    }
  });

  handle('settings:theme', async (_event: IpcMainInvokeEvent) => {
    return storage.getTheme();
  });

  handle('settings:set-theme', async (_event: IpcMainInvokeEvent, theme: string) => {
    if (!['system', 'light', 'dark'].includes(theme)) {
      throw new Error('Invalid theme value');
    }
    storage.setTheme(theme as 'system' | 'light' | 'dark');
    nativeTheme.themeSource = theme as 'system' | 'light' | 'dark';

    const resolved =
      theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme;

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('settings:theme-changed', { theme, resolved });
    }
  });

  handle('settings:file-access-mode', async (_event: IpcMainInvokeEvent) => {
    return storage.getFileAccessMode();
  });

  handle(
    'settings:set-file-access-mode',
    async (_event: IpcMainInvokeEvent, mode: FileAccessMode) => {
      if (!['limited', 'full'].includes(mode)) {
        throw new Error('Invalid file access mode');
      }

      storage.setFileAccessMode(mode);

      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('settings:file-access-mode-changed', { mode });
      }
    },
  );

  handle('settings:learning', async (_event: IpcMainInvokeEvent) => {
    return storage.getLearningSettings();
  });

  handle('settings:set-self-learning', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid self-learning flag');
    }
    storage.setSelfLearningEnabled(enabled);
  });

  handle(
    'settings:set-auto-apply-learning',
    async (_event: IpcMainInvokeEvent, enabled: boolean) => {
      if (typeof enabled !== 'boolean') {
        throw new Error('Invalid auto-apply learning flag');
      }
      storage.setAutoApplyLearning(enabled);
    },
  );

  handle('learning:list-insights', async (_event: IpcMainInvokeEvent) => {
    return storage.listLearningInsights();
  });

  handle('learning:delete-insight', async (_event: IpcMainInvokeEvent, insightId: string) => {
    const validatedInsightId = sanitizeString(insightId, 'insightId', 128);
    storage.deleteLearningInsight(validatedInsightId);
  });

  handle('learning:clear-insights', async (_event: IpcMainInvokeEvent) => {
    storage.clearLearningInsights();
  });

  handle('settings:app-settings', async (_event: IpcMainInvokeEvent) => {
    return storage.getAppSettings();
  });

  handle('settings:openai-base-url:get', async (_event: IpcMainInvokeEvent) => {
    return storage.getOpenAiBaseUrl();
  });

  handle('settings:openai-base-url:set', async (_event: IpcMainInvokeEvent, baseUrl: string) => {
    if (typeof baseUrl !== 'string') {
      throw new Error('Invalid base URL');
    }

    const trimmed = baseUrl.trim();
    if (!trimmed) {
      storage.setOpenAiBaseUrl('');
      return;
    }

    validateHttpUrl(trimmed, 'OpenAI base URL');
    storage.setOpenAiBaseUrl(trimmed.replace(/\/+$/, ''));
  });

  handle('opencode:auth:openai:status', async (_event: IpcMainInvokeEvent) => {
    return getOpenAiOauthStatus();
  });

  handle('opencode:auth:openai:login', async (_event: IpcMainInvokeEvent) => {
    const result = await loginOpenAiWithChatGpt();
    return { ok: true, ...result };
  });

  handle('onboarding:complete', async (_event: IpcMainInvokeEvent) => {
    if (isE2ESkipAuthEnabled()) {
      return true;
    }

    if (storage.getOnboardingComplete()) {
      return true;
    }

    const tasks = storage.getTasks();
    if (tasks.length > 0) {
      storage.setOnboardingComplete(true);
      return true;
    }

    return false;
  });

  handle('onboarding:set-complete', async (_event: IpcMainInvokeEvent, complete: boolean) => {
    storage.setOnboardingComplete(complete);
  });

  handle('shell:open-external', async (_event: IpcMainInvokeEvent, url: string) => {
    try {
      validateHttpUrl(url, 'External URL');
      await shell.openExternal(url);
    } catch (error) {
      console.error('Failed to open external URL:', error);
      throw error;
    }
  });

  handle(
    'log:event',
    async (
      _event: IpcMainInvokeEvent,
      _payload: { level?: string; message?: string; context?: Record<string, unknown> },
    ) => {
      return { ok: true };
    },
  );

  handle('speech:is-configured', async (_event: IpcMainInvokeEvent) => {
    return isElevenLabsConfigured();
  });

  handle('speech:get-config', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('elevenlabs');
    return {
      enabled: Boolean(apiKey && apiKey.trim()),
      hasApiKey: Boolean(apiKey),
      apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : undefined,
    };
  });

  handle('speech:validate', async (_event: IpcMainInvokeEvent, apiKey?: string) => {
    return validateElevenLabsApiKey(apiKey);
  });

  handle(
    'speech:transcribe',
    async (_event: IpcMainInvokeEvent, audioData: ArrayBuffer, mimeType?: string) => {
      console.log('[IPC] speech:transcribe received:', {
        audioDataType: typeof audioData,
        audioDataByteLength: audioData?.byteLength,
        mimeType,
      });
      const buffer = Buffer.from(audioData);
      console.log('[IPC] Converted to buffer:', { bufferLength: buffer.length });
      return transcribeAudio(buffer, mimeType);
    },
  );
  handle('provider-settings:get', async () => {
    return storage.getProviderSettings();
  });

  handle(
    'provider-settings:set-active',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId | null) => {
      storage.setActiveProvider(providerId);
    },
  );

  handle(
    'provider-settings:get-connected',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId) => {
      return storage.getConnectedProvider(providerId);
    },
  );

  handle(
    'provider-settings:set-connected',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId, provider: ConnectedProvider) => {
      storage.setConnectedProvider(providerId, provider);
    },
  );

  handle(
    'provider-settings:remove-connected',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId) => {
      storage.removeConnectedProvider(providerId);
      if (providerId === 'vertex') {
        cleanupVertexServiceAccountKey();
      }
    },
  );

  handle(
    'provider-settings:update-model',
    async (_event: IpcMainInvokeEvent, providerId: ProviderId, modelId: string | null) => {
      storage.updateProviderModel(providerId, modelId);
    },
  );

  handle('provider-settings:set-debug', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    storage.setProviderDebugMode(enabled);
  });

  handle('provider-settings:get-debug', async () => {
    return storage.getProviderDebugMode();
  });

  handle('logs:export', async (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('No window found');

    const collector = getLogCollector();
    collector.flush();

    const logPath = collector.getCurrentLogPath();
    const logDir = collector.getLogDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultFilename = `rodjerhelp-logs-${timestamp}.txt`;

    const result = await dialog.showSaveDialog(window, {
      title: 'Экспорт логов приложения',
      defaultPath: defaultFilename,
      filters: [
        { name: 'Текстовые файлы', extensions: ['txt'] },
        { name: 'Файлы логов', extensions: ['log'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, reason: 'cancelled' };
    }

    try {
      if (fs.existsSync(logPath)) {
        fs.copyFileSync(logPath, result.filePath);
      } else {
        const header = `Логи приложения RodjerHelp\nЭкспортировано: ${new Date().toISOString()}\nКаталог логов: ${logDir}\n\nПока логи отсутствуют.\n`;
        fs.writeFileSync(result.filePath, header);
      }

      return { success: true, path: result.filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      return { success: false, error: message };
    }
  });

  handle('skills:list', async () => {
    return skillsManager.getAll();
  });

  handle('skills:list-enabled', async () => {
    return skillsManager.getEnabled();
  });

  handle('skills:set-enabled', async (_event, id: string, enabled: boolean) => {
    await skillsManager.setEnabled(id, enabled);
  });

  handle('skills:get-content', async (_event, id: string) => {
    return skillsManager.getContent(id);
  });

  handle('skills:get-user-skills-path', async () => {
    return skillsManager.getUserSkillsPath();
  });

  handle('skills:pick-file', async () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите файл SKILL.md',
      filters: [
        { name: 'Файлы навыков', extensions: ['md'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Chat attachments: pick files for attaching to a task prompt.
  // Returns file metadata for display in the renderer (no file contents are read here).
  handle('chat:pick-files', async () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите файлы',
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }
    lastPickedChatFiles = result.filePaths.map((filePath) => {
      try {
        const stat = fs.statSync(filePath);
        return {
          path: filePath,
          name: path.basename(filePath),
          size: stat.size,
          lastModified: stat.mtimeMs,
        };
      } catch {
        return {
          path: filePath,
          name: path.basename(filePath),
          size: 0,
          lastModified: Date.now(),
        };
      }
    });
    return lastPickedChatFiles;
  });

  handle('chat:last-picked-files', async () => {
    return lastPickedChatFiles.map((file) => file.path).filter(Boolean);
  });

  handle('chat:read-files', async (_event, paths: string[]) => {
    const safePaths = Array.isArray(paths)
      ? paths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      : [];
    const files: Array<{
      path: string;
      name: string;
      size: number;
      text?: string;
      error?: string;
      truncated?: boolean;
    }> = [];

    for (const filePath of safePaths) {
      try {
        const stat = fs.statSync(filePath);
        const preview = await buildAttachmentPreview(filePath, MAX_ATTACHMENT_TEXT_BYTES);
        files.push({
          path: filePath,
          name: path.basename(filePath),
          size: stat.size,
          ...preview,
        });
      } catch (error) {
        files.push({
          path: filePath,
          name: path.basename(filePath),
          size: 0,
          error: error instanceof Error ? error.message : 'Failed to read file',
        });
      }
    }

    return files;
  });
  handle('skills:add-from-file', async (_event, filePath: string) => {
    return skillsManager.addFromFile(filePath);
  });

  handle('skills:add-from-github', async (_event, rawUrl: string) => {
    return skillsManager.addFromGitHub(rawUrl);
  });

  handle('skills:delete', async (_event, id: string) => {
    await skillsManager.delete(id);
  });

  handle('skills:resync', async () => {
    await skillsManager.resync();
    return skillsManager.getAll();
  });

  handle('skills:open-in-editor', async (_event, filePath: string) => {
    await shell.openPath(filePath);
  });

  handle('skills:show-in-folder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  // ── MCP Connectors ──────────────────────────────────────────────────

  handle('connectors:list', async () => {
    return storage.getAllConnectors();
  });

  handle('connectors:add', async (_event, name: string, url: string) => {
    const sanitizedName = sanitizeString(name, 'connectorName', 128);
    const sanitizedUrl = sanitizeString(url, 'connectorUrl', 512);

    // Validate URL scheme
    try {
      const parsed = new URL(sanitizedUrl);
      if (!parsed.protocol.startsWith('http')) {
        throw new Error('Connector URL must use http:// or https://');
      }
    } catch (err) {
      throw new Error(
        err instanceof Error && err.message.includes('http')
          ? err.message
          : `Invalid connector URL: ${sanitizedUrl}`,
      );
    }

    const id = `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const connector: McpConnector = {
      id,
      name: sanitizedName,
      url: sanitizedUrl,
      status: 'disconnected',
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    };

    storage.upsertConnector(connector);
    return connector;
  });

  handle('connectors:delete', async (_event, id: string) => {
    storage.deleteConnectorTokens(id);
    storage.deleteConnector(id);
  });

  handle('connectors:set-enabled', async (_event, id: string, enabled: boolean) => {
    storage.setConnectorEnabled(id, enabled);
  });

  handle('connectors:start-oauth', async (_event, connectorId: string) => {
    const connector = storage.getConnectorById(connectorId);
    if (!connector) throw new Error('Connector not found');

    // 1. Discover OAuth metadata
    const metadata = await discoverOAuthMetadata(connector.url);

    // 2. Register client dynamically
    let clientReg = connector.clientRegistration;
    if (!clientReg) {
      clientReg = await registerOAuthClient(
        metadata,
        'accomplish://callback/mcp',
        'RodjerHelp Desktop',
      );
    }

    // 3. Save metadata and client registration
    storage.upsertConnector({
      ...connector,
      oauthMetadata: metadata,
      clientRegistration: clientReg,
      status: 'connecting',
      updatedAt: new Date().toISOString(),
    });

    // 4. Generate PKCE
    const pkce = generatePkceChallenge();

    // 5. Store pending flow state
    const state = crypto.randomUUID();
    cleanupExpiredOAuthFlows();
    pendingOAuthFlows.set(state, {
      connectorId,
      codeVerifier: pkce.codeVerifier,
      metadata,
      clientRegistration: clientReg,
      createdAt: Date.now(),
    });

    // 6. Build authorization URL and open in browser
    const authUrl = buildAuthorizationUrl({
      authorizationEndpoint: metadata.authorizationEndpoint,
      clientId: clientReg.clientId,
      redirectUri: 'accomplish://callback/mcp',
      codeChallenge: pkce.codeChallenge,
      state,
      scope: metadata.scopesSupported?.join(' '),
    });

    await shell.openExternal(authUrl);

    return { state, authUrl };
  });

  handle('connectors:complete-oauth', async (_event, state: string, code: string) => {
    cleanupExpiredOAuthFlows();
    const flow = pendingOAuthFlows.get(state);
    if (!flow) throw new Error('No pending OAuth flow for this state');
    pendingOAuthFlows.delete(state);

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens({
      tokenEndpoint: flow.metadata.tokenEndpoint,
      code,
      codeVerifier: flow.codeVerifier,
      clientId: flow.clientRegistration.clientId,
      clientSecret: flow.clientRegistration.clientSecret,
      redirectUri: 'accomplish://callback/mcp',
    });

    // Store tokens securely
    storage.storeConnectorTokens(flow.connectorId, tokens);

    // Update connector status
    const connector = storage.getConnectorById(flow.connectorId);
    if (connector) {
      storage.upsertConnector({
        ...connector,
        status: 'connected',
        lastConnectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return storage.getConnectorById(flow.connectorId);
  });

  handle('connectors:disconnect', async (_event, connectorId: string) => {
    storage.deleteConnectorTokens(connectorId);
    storage.setConnectorStatus(connectorId, 'disconnected');
  });
}

// In-memory store for pending OAuth flows (keyed by state parameter)
const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000; // 10 minutes

const pendingOAuthFlows = new Map<
  string,
  {
    connectorId: string;
    codeVerifier: string;
    metadata: OAuthMetadata;
    clientRegistration: OAuthClientRegistration;
    createdAt: number;
  }
>();

function cleanupExpiredOAuthFlows(): void {
  const now = Date.now();
  for (const [state, flow] of pendingOAuthFlows) {
    if (now - flow.createdAt > OAUTH_FLOW_TTL_MS) {
      pendingOAuthFlows.delete(state);
    }
  }
}
