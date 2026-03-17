import type { TaskConfig } from '../common/types/task.js';
import { sanitizeString } from './sanitize.js';

const VALID_TASK_MODES = new Set(['default', 'code-review', 'analysis', 'sales', 'executive']);

/**
 * Validates and sanitizes a TaskConfig object.
 * Ensures all fields are properly typed, trimmed, and within length limits.
 *
 * @param config - The task configuration to validate
 * @returns A sanitized TaskConfig with all fields validated
 */
export function validateTaskConfig(config: TaskConfig): TaskConfig {
  const prompt = sanitizeString(config.prompt, 'prompt');
  const validated: TaskConfig = { prompt };

  if (config.taskId) {
    validated.taskId = sanitizeString(config.taskId, 'taskId', 128);
  }
  if (config.sessionId) {
    validated.sessionId = sanitizeString(config.sessionId, 'sessionId', 128);
  }
  if (config.workingDirectory) {
    validated.workingDirectory = sanitizeString(config.workingDirectory, 'workingDirectory', 1024);
  }
  if (Array.isArray(config.allowedTools)) {
    validated.allowedTools = config.allowedTools
      .filter((tool): tool is string => typeof tool === 'string')
      .map((tool) => sanitizeString(tool, 'allowedTools', 64))
      .slice(0, 20);
  }
  if (config.systemPromptAppend) {
    validated.systemPromptAppend = sanitizeString(config.systemPromptAppend, 'systemPromptAppend');
  }
  if (config.outputSchema && typeof config.outputSchema === 'object') {
    validated.outputSchema = config.outputSchema;
  }
  if (config.taskMode) {
    if (!VALID_TASK_MODES.has(config.taskMode)) {
      throw new Error('taskMode must be one of: default, code-review, analysis, sales, executive');
    }
    validated.taskMode = config.taskMode;
  }
  if (config.memoryContext) {
    validated.memoryContext = sanitizeString(config.memoryContext, 'memoryContext', 256);
  }

  return validated;
}
