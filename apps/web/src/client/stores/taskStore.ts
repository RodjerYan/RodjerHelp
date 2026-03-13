import { create } from 'zustand';
import {
  createMessageId,
  STARTUP_STAGES,
  type Task,
  type TaskConfig,
  type TaskStatus,
  type TaskUpdateEvent,
  type PermissionRequest,
  type PermissionResponse,
  type TaskMessage,
  type TodoItem,
} from '@accomplish_ai/agent-core/common';
import { getRodjerHelp } from '../lib/rodjerhelp';

// ATTACHMENTS_TASKSTORE_DIRECT_FIX
const MAX_ATTACHMENT_PREVIEW_CHARS_PER_FILE = 12000;
const MAX_ATTACHMENT_PREVIEW_CHARS_TOTAL = 32000;

const getPickedFilesForPrompt = async (preferEmpty = false): Promise<string[]> => {
  try {
    const w = window as any;
    const candidates = [
      w?.accomplish?.getLastPickedChatFiles,
      w?.rodjerhelpExtras?.getLastPickedChatFiles,
      w?.getLastPickedChatFiles,
    ];
    for (const getter of candidates) {
      if (typeof getter === 'function') {
        const val = await getter();
        const arr = Array.isArray(val) ? val.filter(Boolean).map(String) : [];
        if (arr.length) return arr;
      }
    }
  } catch (e) {
    console.warn('[ATTACHMENTS_TASKSTORE_DIRECT_FIX/getter] failed', e);
  }
  return [];
};

const augmentPromptWithPickedFiles = async (text: string, preferEmpty = false): Promise<string> => {
  try {
    if (typeof text !== 'string') return text as any;
    if (text.includes('📎 Вложения:')) return text;

    const paths = preferEmpty ? [] : await getPickedFilesForPrompt(preferEmpty);
    if (!paths.length) return text;

    const names = paths
      .map((p) => String(p).split(/[\\/]/).pop() || String(p))
      .slice(0, 10);
    const more = paths.length > 10 ? ` +${String(paths.length - 10)}` : '';
    const header = `📎 Вложения: ${names.join(', ')}${more}`;

    let fileBlock = `\n\n[Attached files]\n${names.map((name) => `- ${name}`).join('\n')}`;

    try {
      const api = getRodjerHelp() as any;
      if (api && typeof api.readChatFiles === 'function') {
        const files = await api.readChatFiles(paths);
        if (Array.isArray(files) && files.length) {
          let remaining = MAX_ATTACHMENT_PREVIEW_CHARS_TOTAL;
          const sections: string[] = [];

          for (const f of files) {
            const fp = typeof f?.path === 'string' ? f.path : '';
            const nm = f?.name || (String(fp).split(/[\\/]/).pop() || 'file');
            const rawText = typeof f?.text === 'string' ? f.text : '';
            const errorText =
              typeof f?.error === 'string' && f.error.trim()
                ? `Preview unavailable: ${f.error.trim()}`
                : '';

            let preview = rawText || errorText;
            if (!preview) {
              preview = 'Preview unavailable: file could not be read as text in desktop attachments.';
            }

            if (preview.length > MAX_ATTACHMENT_PREVIEW_CHARS_PER_FILE) {
              preview = `${preview.slice(0, MAX_ATTACHMENT_PREVIEW_CHARS_PER_FILE)}\n[Preview truncated]`;
            }

            if (remaining <= 0) {
              sections.push(`### ${nm}\n[Preview omitted: total attachment preview limit reached]`);
              continue;
            }

            if (preview.length > remaining) {
              preview = `${preview.slice(0, remaining)}\n[Preview truncated: total attachment preview limit reached]`;
            }

            remaining -= preview.length;
            sections.push(`### ${nm}\n${preview}`);
          }

          if (sections.length) {
            fileBlock += `\n\n[Attached file contents]\n${sections.join('\n\n')}`;
          }
        }
      }
    } catch (e) {
      console.warn('[ATTACHMENTS_TASKSTORE_DIRECT_FIX/readChatFiles] failed', e);
    }

    fileBlock +=
      '\n\nUse the attached file excerpts above as the source material. Do not try to open local file paths, do not launch a browser to find these files, and do not ask me again where the file is located.';
    return `${header}\n${text}${fileBlock}`;
  } catch (e) {
    console.warn('[ATTACHMENTS_TASKSTORE_DIRECT_FIX/augment] failed', e);
    return text;
  }
};


interface TaskUpdateBatchEvent {
  taskId: string;
  messages: TaskMessage[];
}

interface SetupProgressEvent {
  taskId: string;
  stage: string;
  message?: string;
  isFirstTask?: boolean;
  modelName?: string;
}

interface StartupStageInfo {
  stage: string;
  message: string;
  modelName?: string;
  isFirstTask: boolean;
  startTime: number;
}

interface TaskState {
  // Current task
  currentTask: Task | null;
  isLoading: boolean;
  error: string | null;

  // Task history
  tasks: Task[];

  // Permission handling
  permissionRequest: PermissionRequest | null;
  setupProgress: string | null;
  setupProgressTaskId: string | null;
  setupDownloadStep: number;
  startupStage: StartupStageInfo | null;
  startupStageTaskId: string | null;
  todos: TodoItem[];
  todosTaskId: string | null;
  authError: { providerId: string; message: string } | null;
  isLauncherOpen: boolean;
  launcherInitialPrompt: string | null;
  openLauncher: () => void;
  openLauncherWithPrompt: (prompt: string) => void;
  closeLauncher: () => void;
  startTask: (config: TaskConfig) => Promise<Task | null>;
  setSetupProgress: (taskId: string | null, message: string | null) => void;
  setStartupStage: (
    taskId: string | null,
    stage: string | null,
    message?: string,
    modelName?: string,
    isFirstTask?: boolean,
  ) => void;
  clearStartupStage: (taskId: string) => void;
  sendFollowUp: (message: string) => Promise<void>;
  cancelTask: () => Promise<void>;
  interruptTask: () => Promise<void>;
  setPermissionRequest: (request: PermissionRequest | null) => void;
  respondToPermission: (response: PermissionResponse) => Promise<void>;
  addTaskUpdate: (event: TaskUpdateEvent) => void;
  addTaskUpdateBatch: (event: TaskUpdateBatchEvent) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setTaskSummary: (taskId: string, summary: string) => void;
  loadTasks: () => Promise<void>;
  loadTaskById: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  reset: () => void;
  setTodos: (taskId: string, todos: TodoItem[]) => void;
  clearTodos: () => void;
  setAuthError: (error: { providerId: string; message: string }) => void;
  clearAuthError: () => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  currentTask: null,
  isLoading: false,
  error: null,
  tasks: [],
  permissionRequest: null,
  setupProgress: null,
  setupProgressTaskId: null,
  setupDownloadStep: 1,
  startupStage: null,
  startupStageTaskId: null,
  todos: [],
  todosTaskId: null,
  authError: null,
  isLauncherOpen: false,
  launcherInitialPrompt: null,

  setSetupProgress: (taskId: string | null, message: string | null) => {
    let step = useTaskStore.getState().setupDownloadStep;
    if (message) {
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes('downloading chromium headless')) {
        step = 3;
      } else if (lowerMsg.includes('downloading ffmpeg')) {
        step = 2;
      } else if (lowerMsg.includes('downloading chromium')) {
        step = 1;
      }
    }
    set({ setupProgress: message, setupProgressTaskId: taskId, setupDownloadStep: step });
  },

  setStartupStage: (
    taskId: string | null,
    stage: string | null,
    message?: string,
    modelName?: string,
    isFirstTask?: boolean,
  ) => {
    if (!taskId || !stage) {
      set({ startupStage: null, startupStageTaskId: null });
      return;
    }

    const currentState = get();
    const startTime =
      currentState.startupStageTaskId === taskId && currentState.startupStage
        ? currentState.startupStage.startTime
        : Date.now();

    set({
      startupStage: {
        stage,
        message: message || stage,
        modelName,
        isFirstTask: isFirstTask ?? false,
        startTime,
      },
      startupStageTaskId: taskId,
    });
  },

  clearStartupStage: (taskId: string) => {
    const currentState = get();
    if (currentState.startupStageTaskId === taskId) {
      set({ startupStage: null, startupStageTaskId: null });
    }
  },

  startTask: async (config: TaskConfig) => {
    config = { ...config, prompt: await augmentPromptWithPickedFiles(config.prompt) };
    const accomplish = getRodjerHelp();
    set({ isLoading: true, error: null });
    try {
      void accomplish.logEvent({
        level: 'info',
        message: 'UI start task',
        context: {
          taskId: config.taskId,
          promptLength: config.prompt?.length ?? 0,
          hasAttachments: config.prompt?.includes('📎 Вложения:') ?? false,
        },
      });
      const task = await accomplish.startTask(config);
      const currentTasks = get().tasks;
      set({
        currentTask: task,
        tasks: [task, ...currentTasks.filter((t) => t.id !== task.id)],
        isLoading: task.status === 'queued',
      });
      void accomplish.logEvent({
        level: 'info',
        message: task.status === 'queued' ? 'UI: задача в очереди' : 'UI: задача запущена',
        context: { taskId: task.id, status: task.status },
      });
      return task;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Не удалось запустить задачу',
        isLoading: false,
      });
      void accomplish.logEvent({
        level: 'error',
        message: 'UI: запуск задачи не удался',
        context: { error: err instanceof Error ? err.message : String(err) },
      });
      return null;
    }
  },

  sendFollowUp: async (message: string) => {
    message = await augmentPromptWithPickedFiles(message);
    const accomplish = getRodjerHelp();
    const { currentTask, startTask } = get();
    if (!currentTask) {
      set({ error: 'Нет активной задачи для продолжения' });
      void accomplish.logEvent({
        level: 'warn',
        message: 'UI: продолжение не удалось — нет активной задачи',
      });
      return;
    }

    const sessionId = currentTask.result?.sessionId || currentTask.sessionId;

    if (!sessionId && currentTask.status === 'interrupted') {
      void accomplish.logEvent({
        level: 'info',
        message: 'UI: продолжение — запуск новой задачи (нет сессии от прерванной задачи)',
        context: { taskId: currentTask.id },
      });
      await startTask({ prompt: message });
      return;
    }

    if (!sessionId) {
      set({ error: 'Нет сессии для продолжения — начните новую задачу' });
      void accomplish.logEvent({
        level: 'warn',
        message: 'UI: продолжение не удалось — отсутствует сессия',
        context: { taskId: currentTask.id },
      });
      return;
    }

    const userMessage: TaskMessage = {
      id: createMessageId(),
      type: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    const taskId = currentTask.id;
    set((state) => ({
      isLoading: true,
      error: null,
      currentTask: state.currentTask
        ? {
            ...state.currentTask,
            status: 'running',
            result: undefined,
            messages: [...state.currentTask.messages, userMessage],
          }
        : null,
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, status: 'running' as TaskStatus } : t,
      ),
    }));

    try {
      void accomplish.logEvent({
        level: 'info',
        message: 'UI: продолжение отправлено',
        context: {
          taskId: currentTask.id,
          messageLength: message?.length ?? 0,
          hasAttachments: message?.includes('📎 Вложения:') ?? false,
        },
      });
      const task = await accomplish.resumeSession(sessionId, message, currentTask.id);

      set((state) => ({
        currentTask: state.currentTask ? { ...state.currentTask, status: task.status } : null,
        isLoading: task.status === 'queued',
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status: task.status } : t)),
      }));
    } catch (err) {
      set((state) => ({
        error: err instanceof Error ? err.message : 'Не удалось отправить сообщение',
        isLoading: false,
        currentTask: state.currentTask ? { ...state.currentTask, status: 'failed' } : null,
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, status: 'failed' as TaskStatus } : t,
        ),
      }));
      void accomplish.logEvent({
        level: 'error',
        message: 'UI: продолжение не удалось',
        context: {
          taskId: currentTask.id,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  cancelTask: async () => {
    const accomplish = getRodjerHelp();
    const { currentTask } = get();
    if (currentTask) {
      void accomplish.logEvent({
        level: 'info',
        message: 'UI: отмена задачи',
        context: { taskId: currentTask.id },
      });
      await accomplish.cancelTask(currentTask.id);
      set((state) => ({
        currentTask: state.currentTask ? { ...state.currentTask, status: 'cancelled' } : null,
        tasks: state.tasks.map((t) =>
          t.id === currentTask.id ? { ...t, status: 'cancelled' as TaskStatus } : t,
        ),
      }));
    }
  },

  interruptTask: async () => {
    const accomplish = getRodjerHelp();
    const { currentTask } = get();
    if (currentTask && currentTask.status === 'running') {
      void accomplish.logEvent({
        level: 'info',
        message: 'UI: прерывание задачи',
        context: { taskId: currentTask.id },
      });
      await accomplish.interruptTask(currentTask.id);
    }
  },

  setPermissionRequest: (request) => {
    set({ permissionRequest: request });
  },

  respondToPermission: async (response: PermissionResponse) => {
    const accomplish = getRodjerHelp();
    void accomplish.logEvent({
      level: 'info',
      message: 'UI: ответ на запрос разрешения',
      context: { ...response },
    });
    await accomplish.respondToPermission(response);
    set({ permissionRequest: null });
  },

  addTaskUpdate: (event: TaskUpdateEvent) => {
    const accomplish = getRodjerHelp();
    void accomplish.logEvent({
      level: 'debug',
      message: 'UI: получено обновление задачи',
      context: { ...event },
    });
    set((state) => {
      const isCurrentTask = state.currentTask?.id === event.taskId;

      let updatedCurrentTask = state.currentTask;
      let updatedTasks = state.tasks;
      let newStatus: TaskStatus | null = null;

      if (event.type === 'message' && event.message && isCurrentTask && state.currentTask) {
        updatedCurrentTask = {
          ...state.currentTask,
          messages: [...state.currentTask.messages, event.message],
        };
      }

      if (event.type === 'complete' && event.result) {
        if (event.result.status === 'success') {
          newStatus = 'completed';
        } else if (event.result.status === 'interrupted') {
          newStatus = 'interrupted';
        } else {
          newStatus = 'failed';
        }

        if (isCurrentTask && state.currentTask) {
          updatedCurrentTask = {
            ...state.currentTask,
            status: newStatus,
            result: event.result,
            completedAt: newStatus === 'interrupted' ? undefined : new Date().toISOString(),
            sessionId: event.result.sessionId || state.currentTask.sessionId,
          };
        }
      }

      if (event.type === 'error') {
        newStatus = 'failed';

        if (isCurrentTask && state.currentTask) {
          updatedCurrentTask = {
            ...state.currentTask,
            status: newStatus,
            sessionId: event.sessionId || state.currentTask.sessionId,
            result: {
              status: 'error',
              error: event.error,
              sessionId: event.sessionId || state.currentTask.result?.sessionId,
            },
          };
        }
      }

      if (newStatus) {
        const finalStatus = newStatus;
        updatedTasks = state.tasks.map((t) =>
          t.id === event.taskId
            ? {
                ...t,
                status: finalStatus,
                ...(event.type === 'complete' && event.result?.sessionId
                  ? { sessionId: event.result.sessionId }
                  : {}),
                ...(event.type === 'error' && event.sessionId ? { sessionId: event.sessionId } : {}),
                ...(isCurrentTask && updatedCurrentTask
                  ? {
                      messages: updatedCurrentTask.messages,
                      ...(updatedCurrentTask.sessionId ? { sessionId: updatedCurrentTask.sessionId } : {}),
                    }
                  : {}),
              }
            : t,
        );
      }

      // Очищать todo только если задача полностью завершена (не прервана — пользователь может продолжить)
      let shouldClearTodos = false;
      if (
        (event.type === 'complete' || event.type === 'error') &&
        state.todosTaskId === event.taskId
      ) {
        const isInterrupted = event.type === 'complete' && event.result?.status === 'interrupted';
        shouldClearTodos = !isInterrupted;
      }

      return {
        currentTask: updatedCurrentTask,
        tasks: updatedTasks,
        isLoading: false,
        ...(shouldClearTodos ? { todos: [], todosTaskId: null } : {}),
      };
    });
  },

  addTaskUpdateBatch: (event: TaskUpdateBatchEvent) => {
    const accomplish = getRodjerHelp();
    void accomplish.logEvent({
      level: 'debug',
      message: 'UI: получено пакетное обновление задачи',
      context: { taskId: event.taskId, messageCount: event.messages.length },
    });
    set((state) => {
      if (!state.currentTask || state.currentTask.id !== event.taskId) {
        return state;
      }

      const updatedTask = {
        ...state.currentTask,
        messages: [...state.currentTask.messages, ...event.messages],
      };

      return { currentTask: updatedTask, isLoading: false };
    });
  },

  updateTaskStatus: (taskId: string, status: TaskStatus) => {
    set((state) => {
      const updatedTasks = state.tasks.map((task) =>
        task.id === taskId ? { ...task, status, updatedAt: new Date().toISOString() } : task,
      );

      const updatedCurrentTask =
        state.currentTask?.id === taskId
          ? { ...state.currentTask, status, updatedAt: new Date().toISOString() }
          : state.currentTask;

      return {
        tasks: updatedTasks,
        currentTask: updatedCurrentTask,
      };
    });
  },

  setTaskSummary: (taskId: string, summary: string) => {
    set((state) => {
      const updatedTasks = state.tasks.map((task) =>
        task.id === taskId ? { ...task, summary } : task,
      );

      const updatedCurrentTask =
        state.currentTask?.id === taskId ? { ...state.currentTask, summary } : state.currentTask;

      return {
        tasks: updatedTasks,
        currentTask: updatedCurrentTask,
      };
    });
  },

  loadTasks: async () => {
    const accomplish = getRodjerHelp();
    const tasks = await accomplish.listTasks();
    set({ tasks });
  },

  loadTaskById: async (taskId: string) => {
    const accomplish = getRodjerHelp();
    const task = await accomplish.getTask(taskId);
    set({ currentTask: task, error: task ? null : 'Задача не найдена' });
  },

  deleteTask: async (taskId: string) => {
    const accomplish = getRodjerHelp();
    await accomplish.deleteTask(taskId);
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }));
  },

  clearHistory: async () => {
    const accomplish = getRodjerHelp();
    await accomplish.clearTaskHistory();
    set({ tasks: [] });
  },

  reset: () => {
    set({
      currentTask: null,
      isLoading: false,
      error: null,
      permissionRequest: null,
      setupProgress: null,
      setupProgressTaskId: null,
      setupDownloadStep: 1,
      startupStage: null,
      startupStageTaskId: null,
      todos: [],
      todosTaskId: null,
      authError: null,
      isLauncherOpen: false,
    });
  },

  setTodos: (taskId: string, todos: TodoItem[]) => {
    set({ todos, todosTaskId: taskId });
  },

  clearTodos: () => {
    set({ todos: [], todosTaskId: null });
  },

  setAuthError: (error: { providerId: string; message: string }) => {
    set({ authError: error });
  },

  clearAuthError: () => {
    set({ authError: null });
  },

  openLauncher: () => set({ isLauncherOpen: true, launcherInitialPrompt: null }),
  openLauncherWithPrompt: (prompt: string) =>
    set({ isLauncherOpen: true, launcherInitialPrompt: prompt }),
  closeLauncher: () => set({ isLauncherOpen: false, launcherInitialPrompt: null }),
}));

if (typeof window !== 'undefined' && window.accomplish) {
  window.accomplish.onTaskProgress((progress: unknown) => {
    const event = progress as SetupProgressEvent;
    const state = useTaskStore.getState();

    if (STARTUP_STAGES.includes(event.stage)) {
      state.setStartupStage(
        event.taskId,
        event.stage,
        event.message,
        event.modelName,
        event.isFirstTask,
      );
      return;
    }

    if (event.stage === 'tool-use') {
      state.clearStartupStage(event.taskId);
      return;
    }

    if (event.stage === 'setup' && event.message) {
      if (event.message.toLowerCase().includes('installed successfully')) {
        state.setSetupProgress(null, null);
      } else {
        state.setSetupProgress(event.taskId, event.message);
      }
      return;
    }

    if (event.message) {
      if (event.message.toLowerCase().includes('installed successfully')) {
        state.setSetupProgress(null, null);
      } else if (event.message.toLowerCase().includes('download')) {
        state.setSetupProgress(event.taskId, event.message);
      }
    }
  });

  window.accomplish.onTaskUpdate((event: unknown) => {
    const updateEvent = event as TaskUpdateEvent;
    if (updateEvent.type === 'complete' || updateEvent.type === 'error') {
      const state = useTaskStore.getState();
      if (state.setupProgressTaskId === updateEvent.taskId) {
        state.setSetupProgress(null, null);
      }
      state.clearStartupStage(updateEvent.taskId);
    }
  });

  window.accomplish.onTaskSummary?.((data: { taskId: string; summary: string }) => {
    useTaskStore.getState().setTaskSummary(data.taskId, data.summary);
  });

  window.accomplish.onTodoUpdate?.((data: { taskId: string; todos: TodoItem[] }) => {
    const state = useTaskStore.getState();
    if (state.currentTask?.id === data.taskId) {
      state.setTodos(data.taskId, data.todos);
    }
  });

  window.accomplish.onAuthError?.((data: { providerId: string; message: string }) => {
    useTaskStore.getState().setAuthError(data);
  });
}
