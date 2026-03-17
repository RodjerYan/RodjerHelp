/**
 * Integration tests for Execution page
 * Tests rendering with active task, message display, and permission dialog
 * @module __tests__/integration/renderer/pages/Execution.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import type { Task, TaskStatus, TaskMessage, PermissionRequest } from '@accomplish_ai/agent-core';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';

// Create mock functions
const mockLoadTaskById = vi.fn();
const mockAddTaskUpdate = vi.fn();
const mockAddTaskUpdateBatch = vi.fn();
const mockUpdateTaskStatus = vi.fn();
const mockSetPermissionRequest = vi.fn();
const mockRespondToPermission = vi.fn();
const mockSendFollowUp = vi.fn();
const mockCancelTask = vi.fn();
const mockInterruptTask = vi.fn();
const mockStartTask = vi.fn();
const mockSetTodos = vi.fn();
const mockClearStartupStage = vi.fn();
const mockOnTaskUpdate = vi.fn();
const mockOnTaskUpdateBatch = vi.fn();
const mockOnPermissionRequest = vi.fn();
const mockOnTaskStatusChange = vi.fn();
const mockGetEnabledSkills = vi.fn();
const mockGetConnectors = vi.fn();
const mockResyncSkills = vi.fn();

// Helper to create mock task
function createMockTask(
  id: string,
  prompt: string = 'Test task',
  status: TaskStatus = 'running',
  messages: TaskMessage[] = [],
): Task {
  return {
    id,
    prompt,
    status,
    messages,
    createdAt: new Date().toISOString(),
  };
}

// Helper to create mock message
function createMockMessage(
  id: string,
  type: 'assistant' | 'user' | 'tool' | 'system' = 'assistant',
  content: string = 'Test message',
): TaskMessage {
  return {
    id,
    type,
    content,
    timestamp: new Date().toISOString(),
  };
}

// Mock accomplish API
const mockAccomplish = {
  onTaskUpdate: mockOnTaskUpdate.mockReturnValue(() => {}),
  onTaskUpdateBatch: mockOnTaskUpdateBatch.mockReturnValue(() => {}),
  onPermissionRequest: mockOnPermissionRequest.mockReturnValue(() => {}),
  onTaskStatusChange: mockOnTaskStatusChange.mockReturnValue(() => {}),
  onDebugLog: vi.fn().mockReturnValue(() => {}),
  onDebugModeChange: vi.fn().mockReturnValue(() => {}),
  getSelectedModel: vi.fn().mockResolvedValue({ provider: 'anthropic', id: 'claude-3-opus' }),
  getOllamaConfig: vi.fn().mockResolvedValue(null),
  getDebugMode: vi.fn().mockResolvedValue(false),
  isE2EMode: vi.fn().mockResolvedValue(false),
  getProviderSettings: vi.fn().mockResolvedValue({
    activeProviderId: 'anthropic',
    connectedProviders: {
      anthropic: {
        providerId: 'anthropic',
        connectionStatus: 'connected',
        selectedModelId: 'claude-3-5-sonnet-20241022',
        credentials: { type: 'api-key', apiKey: 'test-key' },
      },
    },
    debugMode: false,
  }),
  // Provider settings methods
  setActiveProvider: vi.fn().mockResolvedValue(undefined),
  setConnectedProvider: vi.fn().mockResolvedValue(undefined),
  removeConnectedProvider: vi.fn().mockResolvedValue(undefined),
  setProviderDebugMode: vi.fn().mockResolvedValue(undefined),
  validateApiKeyForProvider: vi.fn().mockResolvedValue({ valid: true }),
  validateBedrockCredentials: vi.fn().mockResolvedValue({ valid: true }),
  saveBedrockCredentials: vi.fn().mockResolvedValue(undefined),
  speechIsConfigured: vi.fn().mockResolvedValue(true),
  getTodosForTask: vi.fn().mockResolvedValue([]),
  getEnabledSkills: mockGetEnabledSkills,
  getConnectors: mockGetConnectors,
  setConnectorEnabled: vi.fn().mockResolvedValue(undefined),
  resyncSkills: mockResyncSkills,
};

// Mock the active desktop bridge layer used by the page
vi.mock('@/lib/rodjerhelp', () => ({
  getRodjerHelp: () => mockAccomplish,
  getAccomplish: () => mockAccomplish,
  getLastPickedChatFiles: vi.fn().mockResolvedValue([]),
  setLastPickedChatFiles: vi.fn().mockResolvedValue(undefined),
  clearLastPickedChatFiles: vi.fn().mockResolvedValue(undefined),
}));

// Mock store state holder
let mockStoreState: {
  currentTask: Task | null;
  loadTaskById: typeof mockLoadTaskById;
  isLoading: boolean;
  error: string | null;
  addTaskUpdate: typeof mockAddTaskUpdate;
  addTaskUpdateBatch: typeof mockAddTaskUpdateBatch;
  updateTaskStatus: typeof mockUpdateTaskStatus;
  setPermissionRequest: typeof mockSetPermissionRequest;
  permissionRequest: PermissionRequest | null;
  respondToPermission: typeof mockRespondToPermission;
  sendFollowUp: typeof mockSendFollowUp;
  cancelTask: typeof mockCancelTask;
  interruptTask: typeof mockInterruptTask;
  setTodos: typeof mockSetTodos;
  todos: unknown[];
  todosTaskId: string | null;
  setupProgress: string | null;
  setupProgressTaskId: string | null;
  setupDownloadStep: number;
  startupStage: {
    message: string;
    startTime: number;
    isFirstTask?: boolean;
    stage?: string;
  } | null;
  startupStageTaskId: string | null;
  clearStartupStage: typeof mockClearStartupStage;
  startTask: typeof mockStartTask;
} = {
  currentTask: null,
  loadTaskById: mockLoadTaskById,
  isLoading: false,
  error: null,
  addTaskUpdate: mockAddTaskUpdate,
  addTaskUpdateBatch: mockAddTaskUpdateBatch,
  updateTaskStatus: mockUpdateTaskStatus,
  setPermissionRequest: mockSetPermissionRequest,
  permissionRequest: null,
  respondToPermission: mockRespondToPermission,
  sendFollowUp: mockSendFollowUp,
  cancelTask: mockCancelTask,
  interruptTask: mockInterruptTask,
  setTodos: mockSetTodos,
  todos: [],
  todosTaskId: null,
  setupProgress: null,
  setupProgressTaskId: null,
  setupDownloadStep: 1,
  startupStage: null,
  startupStageTaskId: null,
  clearStartupStage: mockClearStartupStage,
  startTask: mockStartTask,
};

// Mock the task store - needs both hook usage and .getState() for direct calls
vi.mock('@/stores/taskStore', () => {
  const useTaskStoreFn = <T,>(selector?: (state: typeof mockStoreState) => T) =>
    selector ? selector(mockStoreState) : mockStoreState;
  // Add getState method for direct store access (used by getTodosForTask callback)
  useTaskStoreFn.getState = () => mockStoreState;
  return { useTaskStore: useTaskStoreFn };
});

// Mock framer-motion for simpler testing
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      layout: _layout,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
    button: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      layout: _layout,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock Radix Tooltip to render content directly (portals don't work in jsdom)
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
    asChild: _asChild,
    ...props
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    [key: string]: unknown;
  }) => (
    <span data-slot="tooltip-trigger" {...props}>
      {children}
    </span>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span role="tooltip" data-slot="tooltip-content">
      {children}
    </span>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/layout/SettingsDialog', () => ({
  SettingsDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="execution-settings-dialog">Настройки</div> : null,
}));

vi.mock('@/components/ui/ModelIndicator', () => ({
  ModelIndicator: ({
    isRunning,
    onOpenSettings,
  }: {
    isRunning: boolean;
    onOpenSettings?: () => void;
  }) => (
    <button
      type="button"
      data-testid={isRunning ? 'execution-model-indicator-running' : 'execution-model-indicator'}
      onClick={onOpenSettings}
    >
      model
    </button>
  ),
}));

vi.mock('@/components/ui/SpeechInputButton', () => ({
  SpeechInputButton: ({
    disabled,
    onOpenSettings,
  }: {
    disabled?: boolean;
    onOpenSettings?: () => void;
  }) => (
    <button
      type="button"
      data-testid="speech-input-button"
      disabled={disabled}
      title="Голосовой ввод"
      onClick={onOpenSettings}
    >
      speech
    </button>
  ),
}));

vi.mock('@/components/landing/PlusMenu', () => ({
  PlusMenu: () => (
    <button type="button" title="Добавить контент" data-testid="execution-plus-menu-trigger">
      plus
    </button>
  ),
}));

// Mock StreamingText component
vi.mock('@/components/ui/streaming-text', () => ({
  StreamingText: ({
    text,
    children,
  }: {
    text: string;
    children: (text: string) => React.ReactNode;
  }) => <>{children(text)}</>,
}));

// Mock Accomplish icon
vi.mock('/assets/rodjerhelp-icon.png', () => ({ default: 'rodjerhelp-icon.png' }));

// Import after mocks
import ExecutionPage from '@/pages/Execution';

// Wrapper component for routing tests
function renderWithRouter(taskId: string = 'task-123') {
  return render(
    <MemoryRouter initialEntries={[`/execution/${taskId}`]}>
      <Routes>
        <Route path="/execution/:id" element={<ExecutionPage />} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Execution Page Integration', () => {
  beforeAll(() => {
    const originalConsoleError = console.error;
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const message = args[0];
      if (typeof message === 'string' && message.includes('not wrapped in act')) {
        return;
      }
      originalConsoleError(...args);
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnabledSkills.mockResolvedValue([
      {
        id: 'skill-git-helper',
        name: 'Git Helper',
        description: 'Helps with git tasks',
        command: '/git-helper',
        source: 'official',
        isHidden: false,
      },
      {
        id: 'skill-calendar-prep',
        name: 'Calendar Prep',
        description: 'Prepares calendar agenda',
        command: '/calendar-prep',
        source: 'custom',
        isHidden: false,
      },
    ]);
    mockGetConnectors.mockResolvedValue([]);
    mockResyncSkills.mockResolvedValue(undefined);
    (window as Window & { accomplish: typeof mockAccomplish }).accomplish = mockAccomplish;
    // Reset store state
    mockStoreState = {
      currentTask: null,
      loadTaskById: mockLoadTaskById,
      isLoading: false,
      error: null,
      addTaskUpdate: mockAddTaskUpdate,
      addTaskUpdateBatch: mockAddTaskUpdateBatch,
      updateTaskStatus: mockUpdateTaskStatus,
      setPermissionRequest: mockSetPermissionRequest,
      permissionRequest: null,
      respondToPermission: mockRespondToPermission,
      sendFollowUp: mockSendFollowUp,
      cancelTask: mockCancelTask,
      interruptTask: mockInterruptTask,
      setTodos: mockSetTodos,
      todos: [],
      todosTaskId: null,
      setupProgress: null,
      setupProgressTaskId: null,
      setupDownloadStep: 1,
      startupStage: null,
      startupStageTaskId: null,
      clearStartupStage: mockClearStartupStage,
      startTask: mockStartTask,
    };
  });

  describe('rendering with active task', () => {
    it('should call loadTaskById on mount', () => {
      mockStoreState.currentTask = createMockTask('task-123');

      renderWithRouter('task-123');

      expect(mockLoadTaskById).toHaveBeenCalledWith('task-123');
    });

    it('should display loading spinner when no task loaded yet', () => {
      renderWithRouter('task-123');

      const spinner = document.querySelector('.animate-spin-ccw');
      expect(spinner).toBeInTheDocument();
    });

    it('should display task prompt in header', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Review my email inbox');

      renderWithRouter('task-123');

      expect(screen.getByText('Review my email inbox')).toBeInTheDocument();
    });

    it('should display running status badge for running task', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Running task', 'running');

      renderWithRouter('task-123');

      expect(screen.getByText('Выполняется')).toBeInTheDocument();
    });

    it('should display completed status badge for completed task', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Done task', 'completed');

      renderWithRouter('task-123');

      expect(screen.getByText('Завершено')).toBeInTheDocument();
    });

    it('should display failed status badge for failed task', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Failed task', 'failed');

      renderWithRouter('task-123');

      expect(screen.getByText('Ошибка')).toBeInTheDocument();
    });

    it('should display cancelled status badge for cancelled task', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Cancelled task', 'cancelled');

      renderWithRouter('task-123');

      expect(screen.getByText('Отменено')).toBeInTheDocument();
    });

    it('should display queued status badge for queued task', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Queued task', 'queued');

      renderWithRouter('task-123');

      expect(screen.getByText('В очереди')).toBeInTheDocument();
    });

    it('should display stopped status badge for interrupted task', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Stopped task', 'interrupted');

      renderWithRouter('task-123');

      expect(screen.getByText('Остановлено')).toBeInTheDocument();
    });

    it('should render back button', () => {
      mockStoreState.currentTask = createMockTask('task-123');

      renderWithRouter('task-123');

      const buttons = screen.getAllByRole('button');
      const backButton = buttons.find((btn) => btn.querySelector('svg'));
      expect(backButton).toBeInTheDocument();
    });

    it('should not render cancel button (removed from UI)', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Running', 'running');

      renderWithRouter('task-123');

      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });
  });

  describe('message display', () => {
    it('should display user messages', () => {
      const messages = [createMockMessage('msg-1', 'user', 'Check my inbox')];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('Check my inbox')).toBeInTheDocument();
    });

    it('should display assistant messages', () => {
      const messages = [createMockMessage('msg-1', 'assistant', 'I will check your inbox now.')];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('I will check your inbox now.')).toBeInTheDocument();
    });

    it('should display tool messages with tool name', () => {
      const messages: TaskMessage[] = [
        {
          id: 'msg-1',
          type: 'tool',
          content: 'Reading files',
          toolName: 'Read',
          timestamp: new Date().toISOString(),
        },
      ];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('Чтение файлов')).toBeInTheDocument();
    });

    it('should display multiple messages in order', () => {
      const messages = [
        createMockMessage('msg-1', 'user', 'First message'),
        createMockMessage('msg-2', 'assistant', 'Second message'),
        createMockMessage('msg-3', 'user', 'Third message'),
      ];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('First message')).toBeInTheDocument();
      expect(screen.getByText('Second message')).toBeInTheDocument();
      expect(screen.getByText('Third message')).toBeInTheDocument();
    });

    it('should show thinking indicator when running without tool', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', []);

      renderWithRouter('task-123');

      expect(
        screen.getByText(/^(Делаю|Выполняю|Запускаю|Обрабатываю|Завершаю)\.\.\.$/),
      ).toBeInTheDocument();
    });

    it('should display message timestamps', () => {
      const timestamp = new Date().toISOString();
      const messages: TaskMessage[] = [
        {
          id: 'msg-1',
          type: 'assistant',
          content: 'Test message',
          timestamp,
        },
      ];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'completed', messages);

      renderWithRouter('task-123');

      const timeRegex = /\d{1,2}:\d{2}:\d{2}/;
      const timeElements = screen.getAllByText(timeRegex);
      expect(timeElements.length).toBeGreaterThan(0);
    });
  });

  describe('permission dialog', () => {
    it('should display permission dialog when permission request exists', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'tool',
        toolName: 'Bash',
        toolInput: { command: 'rm -rf /' },
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      expect(screen.getByText('Требуется разрешение')).toBeInTheDocument();
    });

    it('should display tool name in permission dialog', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'tool',
        toolName: 'Bash',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      expect(screen.getByText(/Инструмент:\s*Bash/i)).toBeInTheDocument();
    });

    it('should render Allow and Deny buttons in permission dialog', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'tool',
        toolName: 'Write',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      expect(screen.getByRole('button', { name: /разрешить/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /запретить/i })).toBeInTheDocument();
    });

    it('should call respondToPermission with allow when Разрешить is clicked', async () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'tool',
        toolName: 'Write',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      const allowButton = screen.getByRole('button', { name: /разрешить/i });
      fireEvent.click(allowButton);

      await waitFor(() => {
        expect(mockRespondToPermission).toHaveBeenCalledWith({
          requestId: 'perm-1',
          taskId: 'task-123',
          decision: 'allow',
        });
      });
    });

    it('should call respondToPermission with deny when Запретить is clicked', async () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'tool',
        toolName: 'Write',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      const denyButton = screen.getByRole('button', { name: /запретить/i });
      fireEvent.click(denyButton);

      await waitFor(() => {
        expect(mockRespondToPermission).toHaveBeenCalledWith({
          requestId: 'perm-1',
          taskId: 'task-123',
          decision: 'deny',
        });
      });
    });

    it('should display file permission specific UI for file type', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'file',
        fileOperation: 'create',
        filePath: '/path/to/file.txt',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      expect(screen.getByText('Нужно разрешение на доступ к файлу')).toBeInTheDocument();
      expect(screen.getByText('CREATE')).toBeInTheDocument();
      expect(screen.getByText('/path/to/file.txt')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should display error message when error exists', () => {
      mockStoreState.error = 'Task not found';

      renderWithRouter('task-123');

      expect(screen.getByText('Task not found')).toBeInTheDocument();
    });

    it('should display На главную button on error', () => {
      mockStoreState.error = 'Something went wrong';

      renderWithRouter('task-123');

      expect(screen.getByRole('button', { name: /на главную/i })).toBeInTheDocument();
    });
  });

  describe('task controls', () => {
    it('should call interruptTask when Stop button is clicked', async () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Running', 'running');

      renderWithRouter('task-123');

      const stopButton = screen.getByTestId('execution-stop-button');
      fireEvent.click(stopButton);

      await waitFor(() => {
        expect(mockInterruptTask).toHaveBeenCalled();
      });
    });
  });

  describe('follow-up input', () => {
    it('should show follow-up input for completed task with session', () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      expect(screen.getByTestId('execution-follow-up-input')).toBeInTheDocument();
    });

    it('should show follow-up input for interrupted task with session', () => {
      const task = createMockTask('task-123', 'Stopped', 'interrupted');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      expect(screen.getByTestId('execution-follow-up-input')).toBeInTheDocument();
    });

    it('should show "Новая задача" button for completed task without session', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Done', 'completed');

      renderWithRouter('task-123');

      expect(screen.getByRole('button', { name: /новая задача/i })).toBeInTheDocument();
    });

    it('should call sendFollowUp when follow-up is submitted', async () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      const input = screen.getByTestId('execution-follow-up-input');
      fireEvent.change(input, { target: { value: 'Continue with the next step' } });

      const sendButton = screen.getByRole('button', { name: /отправить/i });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockSendFollowUp).toHaveBeenCalledWith('Continue with the next step');
      });
    });

    it('should call sendFollowUp when Enter is pressed', async () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      const input = screen.getByTestId('execution-follow-up-input');
      fireEvent.change(input, { target: { value: 'Do more work' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(mockSendFollowUp).toHaveBeenCalledWith('Do more work');
      });
    });

    it('should disable follow-up input when loading', () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;
      mockStoreState.isLoading = true;

      renderWithRouter('task-123');

      const input = screen.getByTestId('execution-follow-up-input');
      expect(input).toBeDisabled();
    });

    it('should disable send button when follow-up is empty', () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      const sendButton = screen.getByRole('button', { name: /отправить/i });
      expect(sendButton).toBeDisabled();
    });

    it('should render plus menu trigger in follow-up composer', () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      expect(screen.getByTestId('execution-plus-menu-trigger')).toBeInTheDocument();
    });

    it('should render attach files button in follow-up composer', () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      expect(screen.getByRole('button', { name: /прикрепить файл/i })).toBeInTheDocument();
    });
  });

  describe('queued state', () => {
    it('should show waiting message for queued task without messages', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Queued task', 'queued');

      renderWithRouter('task-123');

      expect(screen.getByText('Ожидание')).toBeInTheDocument();
      expect(screen.getByText(/ваша задача в очереди/i)).toBeInTheDocument();
    });

    it('should show inline waiting indicator for queued task with messages', () => {
      const messages = [createMockMessage('msg-1', 'user', 'Previous message')];
      mockStoreState.currentTask = createMockTask('task-123', 'Queued', 'queued', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('Previous message')).toBeInTheDocument();
      expect(screen.getByText('Ожидание')).toBeInTheDocument();
      expect(screen.getByText(/продолжение задачи начнётся автоматически/i)).toBeInTheDocument();
    });
  });

  describe('event subscriptions', () => {
    it('should subscribe to task updates on mount', () => {
      mockStoreState.currentTask = createMockTask('task-123');

      renderWithRouter('task-123');

      expect(mockOnTaskUpdate).toHaveBeenCalled();
    });

    it('should subscribe to task update batches on mount', () => {
      mockStoreState.currentTask = createMockTask('task-123');

      renderWithRouter('task-123');

      expect(mockOnTaskUpdateBatch).toHaveBeenCalled();
    });

    it('should subscribe to permission requests on mount', () => {
      mockStoreState.currentTask = createMockTask('task-123');

      renderWithRouter('task-123');

      expect(mockOnPermissionRequest).toHaveBeenCalled();
    });

    it('should subscribe to task status changes on mount', () => {
      mockStoreState.currentTask = createMockTask('task-123');

      renderWithRouter('task-123');

      expect(mockOnTaskStatusChange).toHaveBeenCalled();
    });
  });

  describe('browser installation modal', () => {
    it('should show download modal when setupProgress contains "download"', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.setupProgress = 'Downloading Chromium 50%';
      mockStoreState.setupProgressTaskId = 'task-123';
      mockStoreState.setupDownloadStep = 1;

      renderWithRouter('task-123');

      expect(screen.getByText('Chrome не установлен')).toBeInTheDocument();
      expect(screen.getByText('Устанавливаю браузер для автоматизации...')).toBeInTheDocument();
      expect(screen.getByText('Загрузка...')).toBeInTheDocument();
    });

    it('should show download modal when setupProgress contains "% of"', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.setupProgress = '50% of 160 MB';
      mockStoreState.setupProgressTaskId = 'task-123';
      mockStoreState.setupDownloadStep = 1;

      renderWithRouter('task-123');

      expect(screen.getByText('Chrome не установлен')).toBeInTheDocument();
    });

    it('should calculate overall progress for step 1 (Chromium)', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.setupProgress = 'Downloading 50%';
      mockStoreState.setupProgressTaskId = 'task-123';
      mockStoreState.setupDownloadStep = 1;

      renderWithRouter('task-123');

      expect(screen.getByText('32%')).toBeInTheDocument();
    });

    it('should calculate overall progress for step 2 (FFMPEG)', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.setupProgress = 'Downloading 50%';
      mockStoreState.setupProgressTaskId = 'task-123';
      mockStoreState.setupDownloadStep = 2;

      renderWithRouter('task-123');

      expect(screen.getByText('65%')).toBeInTheDocument();
    });

    it('should calculate overall progress for step 3 (Headless)', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.setupProgress = 'Downloading 50%';
      mockStoreState.setupProgressTaskId = 'task-123';
      mockStoreState.setupDownloadStep = 3;

      renderWithRouter('task-123');

      expect(screen.getByText('83%')).toBeInTheDocument();
    });

    it('should not show download modal for different task', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.setupProgress = 'Downloading 50%';
      mockStoreState.setupProgressTaskId = 'different-task';
      mockStoreState.setupDownloadStep = 1;

      renderWithRouter('task-123');

      expect(screen.queryByText('Chrome не установлен')).not.toBeInTheDocument();
    });

    it('should not show download modal when setupProgress is null', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.setupProgress = null;
      mockStoreState.setupProgressTaskId = 'task-123';

      renderWithRouter('task-123');

      expect(screen.queryByText('Chrome не установлен')).not.toBeInTheDocument();
    });

    it('should show one-time setup message', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.setupProgress = 'Downloading 50%';
      mockStoreState.setupProgressTaskId = 'task-123';
      mockStoreState.setupDownloadStep = 1;

      renderWithRouter('task-123');

      expect(screen.getByText(/разовая установка/i)).toBeInTheDocument();
      expect(screen.getByText(/250 МБ/i)).toBeInTheDocument();
    });
  });

  describe('file permission dialog details', () => {
    it('should show target path for rename/move operations', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'file',
        fileOperation: 'rename',
        filePath: '/path/to/old.txt',
        targetPath: '/path/to/new.txt',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      expect(screen.getByText('/path/to/old.txt')).toBeInTheDocument();
      expect(screen.getByText(/new\.txt/)).toBeInTheDocument();
    });

    it('should show content preview for file operations', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'file',
        fileOperation: 'create',
        filePath: '/path/to/file.txt',
        contentPreview: 'This is the file content preview...',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      expect(screen.getByText('Предпросмотр содержимого')).toBeInTheDocument();
    });

    it('should show delete operation warning UI', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'file',
        fileOperation: 'delete',
        filePath: '/path/to/file.txt',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      expect(screen.getByText('Предупреждение об удалении файла')).toBeInTheDocument();
      expect(screen.getByText('Удалить')).toBeInTheDocument();
    });

    it('should show overwrite operation badge', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'file',
        fileOperation: 'overwrite',
        filePath: '/path/to/file.txt',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      expect(screen.getByText('OVERWRITE')).toBeInTheDocument();
    });

    it('should show modify operation badge', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'file',
        fileOperation: 'modify',
        filePath: '/path/to/file.txt',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      expect(screen.getByText('MODIFY')).toBeInTheDocument();
    });

    it('should show move operation badge', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'file',
        fileOperation: 'move',
        filePath: '/path/to/file.txt',
        targetPath: '/new/path/file.txt',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      expect(screen.getByText('MOVE')).toBeInTheDocument();
    });

    it('should show tool name in tool permission dialog', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running');
      mockStoreState.permissionRequest = {
        id: 'perm-1',
        taskId: 'task-123',
        type: 'tool',
        toolName: 'Bash',
        createdAt: new Date().toISOString(),
      };

      renderWithRouter('task-123');

      expect(screen.getByText('Разрешить: Bash?')).toBeInTheDocument();
    });
  });

  describe('task complete states', () => {
    it('should navigate home when clicking Новая задача for failed task without session', async () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Failed', 'failed');

      renderWithRouter('task-123');

      const startNewButton = screen.getByRole('button', { name: /новая задача/i });
      expect(startNewButton).toBeInTheDocument();

      // Click the button - it should navigate to home
      fireEvent.click(startNewButton);

      // Verify navigation happened by checking for Home Page text
      await waitFor(() => {
        expect(screen.getByText('Home Page')).toBeInTheDocument();
      });
    });

    it('should show follow-up input for interrupted task', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Stopped', 'interrupted');

      renderWithRouter('task-123');

      // Look for the retry placeholder text
      expect(
        screen.getByPlaceholderText(/отправьте инструкцию, чтобы повторить/i),
      ).toBeInTheDocument();
    });

    it('should show task cancelled message for cancelled task', () => {
      mockStoreState.currentTask = createMockTask('task-123', 'Cancelled', 'cancelled');

      renderWithRouter('task-123');

      expect(screen.getByText(/задача:\s*cancelled/i)).toBeInTheDocument();
    });

    it('should show Continue button for interrupted task with session and messages', () => {
      const messages = [createMockMessage('msg-1', 'assistant', 'I was working on something')];
      const task = createMockTask('task-123', 'Stopped', 'interrupted', messages);
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      expect(screen.getByRole('button', { name: /продолжить/i })).toBeInTheDocument();
    });

    it('should show Done Continue button for completed task with session when waiting for user', () => {
      const messages = [
        createMockMessage(
          'msg-1',
          'assistant',
          'Please log in to your account. Let me know when you are done.',
        ),
      ];
      const task = createMockTask('task-123', 'Done', 'completed', messages);
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      expect(screen.getByRole('button', { name: /готово, продолжить/i })).toBeInTheDocument();
    });

    it('should call sendFollowUp with continue when Continue button is clicked', async () => {
      const messages = [createMockMessage('msg-1', 'assistant', 'I was working on something')];
      const task = createMockTask('task-123', 'Stopped', 'interrupted', messages);
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      const continueButton = screen.getByRole('button', { name: /продолжить/i });
      fireEvent.click(continueButton);

      await waitFor(() => {
        expect(mockSendFollowUp).toHaveBeenCalledWith('continue');
      });
    });
  });

  describe('system messages', () => {
    it('should display system messages with Системное сообщение label', () => {
      const messages = [createMockMessage('msg-1', 'system', 'System initialization complete')];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('Системное сообщение')).toBeInTheDocument();
      expect(screen.getByText('System initialization complete')).toBeInTheDocument();
    });
  });

  describe('default status badge', () => {
    it('should display raw status for unknown status', () => {
      const task = createMockTask('task-123', 'Task', 'unknown' as TaskStatus);
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      expect(screen.getByText('unknown')).toBeInTheDocument();
    });
  });

  describe('tool message icons', () => {
    it('should display Glob tool with search icon label', () => {
      const messages: TaskMessage[] = [
        {
          id: 'msg-1',
          type: 'tool',
          content: 'Finding files',
          toolName: 'Glob',
          timestamp: new Date().toISOString(),
        },
      ];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('Поиск файлов')).toBeInTheDocument();
    });

    it('should display Grep tool with search label', () => {
      const messages: TaskMessage[] = [
        {
          id: 'msg-1',
          type: 'tool',
          content: 'Searching code',
          toolName: 'Grep',
          timestamp: new Date().toISOString(),
        },
      ];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('Поиск по коду')).toBeInTheDocument();
    });

    it('should display Write tool', () => {
      const messages: TaskMessage[] = [
        {
          id: 'msg-1',
          type: 'tool',
          content: 'Writing file',
          toolName: 'Write',
          timestamp: new Date().toISOString(),
        },
      ];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('Запись файла')).toBeInTheDocument();
    });

    it('should display Edit tool', () => {
      const messages: TaskMessage[] = [
        {
          id: 'msg-1',
          type: 'tool',
          content: 'Editing file',
          toolName: 'Edit',
          timestamp: new Date().toISOString(),
        },
      ];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('Редактирование файла')).toBeInTheDocument();
    });

    it('should display Task agent tool', () => {
      const messages: TaskMessage[] = [
        {
          id: 'msg-1',
          type: 'tool',
          content: 'Running agent',
          toolName: 'Task',
          timestamp: new Date().toISOString(),
        },
      ];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('Запуск агента')).toBeInTheDocument();
    });

    it('should display dev_browser_execute tool', () => {
      const messages: TaskMessage[] = [
        {
          id: 'msg-1',
          type: 'tool',
          content: 'Executing browser action',
          toolName: 'dev_browser_execute',
          timestamp: new Date().toISOString(),
        },
      ];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('Действие в браузере')).toBeInTheDocument();
    });

    it('should display unknown tool with fallback icon', () => {
      const messages: TaskMessage[] = [
        {
          id: 'msg-1',
          type: 'tool',
          content: 'Unknown operation',
          toolName: 'CustomTool',
          timestamp: new Date().toISOString(),
        },
      ];
      mockStoreState.currentTask = createMockTask('task-123', 'Task', 'running', messages);

      renderWithRouter('task-123');

      expect(screen.getByText('CustomTool')).toBeInTheDocument();
    });
  });

  describe('follow-up placeholder text variations', () => {
    it('should show follow-up input for interrupted task even without session', () => {
      const task = createMockTask('task-123', 'Stopped', 'interrupted');
      // No sessionId - but canFollowUp is true for interrupted status
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      // The placeholder says "Send a new instruction to retry..."
      const input = screen.getByPlaceholderText(/отправьте инструкцию, чтобы повторить/i);
      expect(input).toBeInTheDocument();
    });

    it('should show reply placeholder for interrupted task with session', () => {
      const task = createMockTask('task-123', 'Stopped', 'interrupted');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      const input = screen.getByTestId('execution-follow-up-input');
      expect(input).toBeInTheDocument();
    });
  });

  describe('error navigation', () => {
    it('should navigate home when На главную button is clicked', async () => {
      mockStoreState.error = 'Task not found';

      renderWithRouter('task-123');

      const goHomeButton = screen.getByRole('button', { name: /на главную/i });
      fireEvent.click(goHomeButton);

      await waitFor(() => {
        expect(screen.getByText('Home Page')).toBeInTheDocument();
      });
    });
  });

  describe('follow-up input empty check', () => {
    it('should not call sendFollowUp when follow-up is only whitespace', async () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      const input = screen.getByTestId('execution-follow-up-input');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(mockSendFollowUp).not.toHaveBeenCalled();
      });
    });
  });

  describe('follow-up send button behavior', () => {
    it('should keep send button enabled when follow-up exceeds previous max length', () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      const input = screen.getByTestId('execution-follow-up-input');
      const oversizedValue = 'a'.repeat(PROMPT_DEFAULT_MAX_LENGTH + 1);
      fireEvent.change(input, { target: { value: oversizedValue } });

      const sendButton = screen.getByRole('button', { name: /отправить/i });
      expect(sendButton).not.toBeDisabled();
    });

    it('should keep send button enabled when follow-up is at max length', () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      const input = screen.getByTestId('execution-follow-up-input');
      const exactLimitValue = 'a'.repeat(PROMPT_DEFAULT_MAX_LENGTH);
      fireEvent.change(input, { target: { value: exactLimitValue } });

      const sendButton = screen.getByRole('button', { name: /отправить/i });
      expect(sendButton).not.toBeDisabled();
    });

    it('should allow submitting oversized follow-up', async () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      const input = screen.getByTestId('execution-follow-up-input');
      const oversizedValue = 'a'.repeat(PROMPT_DEFAULT_MAX_LENGTH + 1);
      fireEvent.change(input, { target: { value: oversizedValue } });

      const sendButton = screen.getByRole('button', { name: /отправить/i });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockSendFollowUp).toHaveBeenCalledWith(oversizedValue);
      });
    });

    it('should use localized send button title', () => {
      const task = createMockTask('task-123', 'Done', 'completed');
      task.sessionId = 'session-abc';
      mockStoreState.currentTask = task;

      renderWithRouter('task-123');

      const sendButton = screen.getByRole('button', { name: /отправить/i });
      expect(sendButton).toHaveAttribute('title', 'Отправить');
    });
  });
});
