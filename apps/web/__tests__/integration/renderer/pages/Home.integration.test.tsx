/**
 * Integration tests for Home page
 * Tests initial render, task input integration, and loading state
 * @module __tests__/integration/renderer/pages/Home.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Task, TaskStatus } from '@accomplish_ai/agent-core';

// Create mock functions
const mockStartTask = vi.fn();
const mockInterruptTask = vi.fn();
const mockAddTaskUpdate = vi.fn();
const mockSetPermissionRequest = vi.fn();
const mockHasAnyApiKey = vi.fn();
const mockOnTaskUpdate = vi.fn();
const mockOnPermissionRequest = vi.fn();
const mockLogEvent = vi.fn();

// Helper to create a mock task
function createMockTask(
  id: string,
  prompt: string = 'Test task',
  status: TaskStatus = 'running',
): Task {
  return {
    id,
    prompt,
    status,
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

// Mock accomplish API
const mockAccomplish = {
  hasAnyApiKey: mockHasAnyApiKey,
  getSelectedModel: vi.fn().mockResolvedValue({ provider: 'anthropic', id: 'claude-3-opus' }),
  getOllamaConfig: vi.fn().mockResolvedValue(null),
  onTaskUpdate: mockOnTaskUpdate.mockReturnValue(() => {}),
  onPermissionRequest: mockOnPermissionRequest.mockReturnValue(() => {}),
  logEvent: mockLogEvent.mockResolvedValue(undefined),
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
let mockStoreState = {
  startTask: mockStartTask,
  interruptTask: mockInterruptTask,
  currentTask: createMockTask('current-task', 'Current task', 'running'),
  isLoading: false,
  addTaskUpdate: mockAddTaskUpdate,
  setPermissionRequest: mockSetPermissionRequest,
};

// Mock the task store
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => mockStoreState,
}));

vi.mock('@/components/landing/TaskInputBar', () => ({
  TaskInputBar: ({
    value,
    onChange,
    onSubmit,
    isLoading,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    isLoading?: boolean;
  }) => (
    <div>
      <textarea
        data-testid="task-input-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!!isLoading}
      />
      <button
        data-testid="task-input-submit"
        title={isLoading ? 'Остановить' : 'Отправить'}
        onClick={onSubmit}
      >
        {isLoading ? 'Остановить' : 'Отправить'}
      </button>
    </div>
  ),
}));

vi.mock('@/components/landing/PlusMenu', () => ({
  PlusMenu: () => <div data-testid="plus-menu" />,
}));

vi.mock('@/components/landing/IntegrationIcons', () => ({
  IntegrationIcon: ({ domain }: { domain: string }) => <span>{domain}</span>,
}));

// Mock framer-motion for simpler testing
vi.mock('framer-motion', () => ({
  motion: {
    h1: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => {
      const {
        initial: _initial,
        animate: _animate,
        exit: _exit,
        transition: _transition,
        ...domProps
      } = props;
      return <h1 {...domProps}>{children}</h1>;
    },
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => {
      const {
        initial: _initial,
        animate: _animate,
        exit: _exit,
        transition: _transition,
        ...domProps
      } = props;
      return <div {...domProps}>{children}</div>;
    },
    button: ({
      children,
      onClick,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      [key: string]: unknown;
    }) => {
      const {
        initial: _initial,
        animate: _animate,
        exit: _exit,
        transition: _transition,
        whileTap: _whileTap,
        ...domProps
      } = props;
      return (
        <button onClick={onClick} {...domProps}>
          {children}
        </button>
      );
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock SettingsDialog
vi.mock('@/components/layout/SettingsDialog', () => ({
  SettingsDialog: ({
    open,
    onOpenChange,
    onApiKeySaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApiKeySaved?: () => void;
  }) =>
    open ? (
      <div data-testid="settings-dialog" role="dialog">
        <button onClick={() => onOpenChange(false)}>Закрыть</button>
        {onApiKeySaved && <button onClick={onApiKeySaved}>Сохранить API-ключ</button>}
      </div>
    ) : null,
  default: ({
    open,
    onOpenChange,
    onApiKeySaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApiKeySaved?: () => void;
  }) =>
    open ? (
      <div data-testid="settings-dialog" role="dialog">
        <button onClick={() => onOpenChange(false)}>Закрыть</button>
        {onApiKeySaved && <button onClick={onApiKeySaved}>Сохранить API-ключ</button>}
      </div>
    ) : null,
}));

// Import after mocks
import { HomePage } from '@/pages/Home';

// Mock images
vi.mock('/assets/usecases/calendar-prep-notes.png', () => ({ default: 'calendar.png' }));
vi.mock('/assets/usecases/inbox-promo-cleanup.png', () => ({ default: 'inbox.png' }));
vi.mock('/assets/usecases/competitor-pricing-deck.png', () => ({ default: 'competitor.png' }));
vi.mock('/assets/usecases/notion-api-audit.png', () => ({ default: 'notion.png' }));
vi.mock('/assets/usecases/staging-vs-prod-visual.png', () => ({ default: 'staging.png' }));
vi.mock('/assets/usecases/prod-broken-links.png', () => ({ default: 'broken-links.png' }));
vi.mock('/assets/usecases/stock-portfolio-alerts.png', () => ({ default: 'stock.png' }));
vi.mock('/assets/usecases/job-application-automation.png', () => ({ default: 'job.png' }));
vi.mock('/assets/usecases/event-calendar-builder.png', () => ({ default: 'event.png' }));

describe('Home Page Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    mockStoreState = {
      startTask: mockStartTask,
      interruptTask: mockInterruptTask,
      currentTask: createMockTask('current-task', 'Current task', 'running'),
      isLoading: false,
      addTaskUpdate: mockAddTaskUpdate,
      setPermissionRequest: mockSetPermissionRequest,
    };
    // Default to having API key (legacy)
    mockHasAnyApiKey.mockResolvedValue(true);
    // Default to having a ready provider (new provider settings)
    mockAccomplish.getProviderSettings.mockResolvedValue({
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
    });
  });

  describe('initial render', () => {
    it('should render the main heading', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Assert
      expect(
        screen.getByRole('heading', { name: /что нужно сделать сегодня/i }),
      ).toBeInTheDocument();
    });

    it('should render the task input bar', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Assert
      const textarea = screen.getByTestId('task-input-textarea');
      expect(textarea).toBeInTheDocument();
    });

    it('should render submit button', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Assert
      const submitButton = screen.getByTestId('task-input-submit');
      expect(submitButton).toBeInTheDocument();
    });

    it('should render example prompts section', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Assert
      expect(screen.getByText(/примеры запросов/i)).toBeInTheDocument();
    });

    it('should render use case example cards', async () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Assert - example cards are rendered with stable test ids
      await waitFor(() => {
        expect(screen.getByTestId('home-example-0')).toBeInTheDocument();
        expect(screen.getByTestId('home-example-1')).toBeInTheDocument();
      });
    });

    it('should subscribe to task events on mount', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Assert
      expect(mockOnTaskUpdate).toHaveBeenCalled();
      expect(mockOnPermissionRequest).toHaveBeenCalled();
    });
  });

  describe('task input integration', () => {
    it('should update input value when user types', () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Act
      const textarea = screen.getByTestId('task-input-textarea');
      fireEvent.change(textarea, { target: { value: 'Check my calendar' } });

      // Assert
      expect(textarea).toHaveValue('Check my calendar');
    });

    it('should check for provider settings before submitting task', async () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Act
      const textarea = screen.getByTestId('task-input-textarea');
      fireEvent.change(textarea, { target: { value: 'Submit this task' } });

      const submitButton = screen.getByTestId('task-input-submit');
      fireEvent.click(submitButton);

      // Assert - should check provider settings (via isE2EMode and getProviderSettings)
      await waitFor(() => {
        expect(mockAccomplish.isE2EMode).toHaveBeenCalled();
      });
    });

    it('should open settings dialog when no provider is ready', async () => {
      // Arrange - Set up mock to return no ready providers
      mockAccomplish.getProviderSettings.mockResolvedValue({
        activeProviderId: null,
        connectedProviders: {},
        debugMode: false,
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Act
      const textarea = screen.getByTestId('task-input-textarea');
      fireEvent.change(textarea, { target: { value: 'Submit without provider' } });

      const submitButton = screen.getByTestId('task-input-submit');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
      });
    });

    it('should start task when API key exists', async () => {
      // Arrange
      const mockTask = createMockTask('task-123', 'My task', 'running');
      mockStartTask.mockResolvedValue(mockTask);
      mockHasAnyApiKey.mockResolvedValue(true);

      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Act
      const textarea = screen.getByTestId('task-input-textarea');
      fireEvent.change(textarea, { target: { value: 'My task' } });

      const submitButton = screen.getByTestId('task-input-submit');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(mockStartTask).toHaveBeenCalled();
      });
    });

    it('should not submit empty task', async () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Act
      const submitButton = screen.getByTestId('task-input-submit');
      fireEvent.click(submitButton);

      // Assert - empty tasks return early, no provider check or task start
      await waitFor(() => {
        expect(mockAccomplish.isE2EMode).not.toHaveBeenCalled();
        expect(mockStartTask).not.toHaveBeenCalled();
      });
    });

    it('should not submit whitespace-only task', async () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Act
      const textarea = screen.getByTestId('task-input-textarea');
      fireEvent.change(textarea, { target: { value: '   ' } });

      const submitButton = screen.getByTestId('task-input-submit');
      fireEvent.click(submitButton);

      // Assert - whitespace-only input should not trigger any API calls
      await waitFor(() => {
        expect(mockAccomplish.isE2EMode).not.toHaveBeenCalled();
        expect(mockStartTask).not.toHaveBeenCalled();
      });
    });

    it('should execute task after configuring provider in settings', async () => {
      // Arrange - No ready provider initially
      mockAccomplish.getProviderSettings.mockResolvedValue({
        activeProviderId: null,
        connectedProviders: {},
        debugMode: false,
      });
      const mockTask = createMockTask('task-123', 'My task', 'running');
      mockStartTask.mockResolvedValue(mockTask);

      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Act - Submit to open settings
      const textarea = screen.getByTestId('task-input-textarea');
      fireEvent.change(textarea, { target: { value: 'My task' } });

      const submitButton = screen.getByTestId('task-input-submit');
      fireEvent.click(submitButton);

      // Wait for dialog
      await waitFor(() => {
        expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
      });

      // Simulate saving API key (which triggers onApiKeySaved callback)
      const saveButton = screen.getByRole('button', { name: /сохранить api-ключ/i });
      fireEvent.click(saveButton);

      // Assert - Task should be started after provider is configured
      await waitFor(() => {
        expect(mockStartTask).toHaveBeenCalled();
      });
    });
  });

  describe('loading state', () => {
    it('should disable input when loading', () => {
      // Arrange
      mockStoreState.isLoading = true;

      // Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Assert
      const textarea = screen.getByTestId('task-input-textarea');
      expect(textarea).toBeDisabled();
    });

    it('should keep stop button enabled when loading', () => {
      // Arrange
      mockStoreState.isLoading = true;

      // Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Assert
      const submitButton = screen.getByTitle('Остановить');
      expect(submitButton).not.toBeDisabled();
    });

    it('should interrupt instead of submitting when already loading', async () => {
      // Arrange
      mockStoreState.isLoading = true;

      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // The textarea is disabled, so we can't really type, but test submit
      const submitButton = screen.getByTitle('Остановить');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(mockStartTask).not.toHaveBeenCalled();
        expect(mockInterruptTask).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('example prompts', () => {
    it('should populate input when example is clicked', async () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Act - Click on Calendar Prep Notes example (expanded by default)
      await waitFor(() => {
        expect(screen.getByText('Подготовка к встречам')).toBeInTheDocument();
      });
      const exampleButton = screen.getByText('Подготовка к встречам').closest('button');
      expect(exampleButton).toBeInTheDocument();
      fireEvent.click(exampleButton!);

      // Assert - The textarea should now contain text related to the example
      await waitFor(() => {
        const textarea = screen.getByTestId('task-input-textarea') as HTMLTextAreaElement;
        expect(textarea.value.length).toBeGreaterThan(0);
        expect(textarea.value.toLowerCase()).toContain('calendar');
      });
    });

    it('should always show example prompts section', async () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Assert - Examples section heading and cards are always visible
      await waitFor(() => {
        expect(screen.getByText('Примеры запросов')).toBeInTheDocument();
        expect(screen.getByText('Подготовка к встречам')).toBeInTheDocument();
      });
    });

    it('should render all nine example use cases', async () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Assert - examples are expanded by default
      await waitFor(() => {
        expect(screen.getAllByTestId(/home-example-/)).toHaveLength(9);
      });
    });
  });

  describe('settings dialog interaction', () => {
    it('should close settings dialog without executing when cancelled', async () => {
      // Arrange - No ready provider
      mockAccomplish.getProviderSettings.mockResolvedValue({
        activeProviderId: null,
        connectedProviders: {},
        debugMode: false,
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>,
      );

      // Act - Open settings via submit
      const textarea = screen.getByTestId('task-input-textarea');
      fireEvent.change(textarea, { target: { value: 'My task' } });

      const submitButton = screen.getByTestId('task-input-submit');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
      });

      // Close without saving
      const closeButton = screen.getByRole('button', { name: /закрыть/i });
      fireEvent.click(closeButton);

      // Assert
      await waitFor(() => {
        expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument();
        expect(mockStartTask).not.toHaveBeenCalled();
      });
    });
  });
});
