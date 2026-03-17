import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { springs } from '../../lib/animations';
import type { TaskMessage } from '@accomplish_ai/agent-core/common';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Wrench, Terminal, Check, Copy, Play, Paperclip, FileText } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StreamingText } from '../ui/streaming-text';
import { BrowserScriptCard } from '../BrowserScriptCard';
import { getToolDisplayInfo } from '../../constants/tool-mappings';
import { SpinningIcon } from './SpinningIcon';

export interface MessageBubbleProps {
  message: TaskMessage;
  shouldStream?: boolean;
  isLastMessage?: boolean;
  isRunning?: boolean;
  showContinueButton?: boolean;
  continueLabel?: string;
  onContinue?: () => void;
  isLoading?: boolean;
}

const COPIED_STATE_DURATION_MS = 1000;

const ATTACHMENTS_HEADER_RE = /^📎\s*Вложения:\s*(.+)$/m;
const ATTACHMENTS_PAYLOAD_RE =
  /\n\n\[(?:Attached file paths|Attached files|Attached file contents)\][\s\S]*$/m;

const whiteMarkdownComponents: Components = {
  p: ({ node: _node, ...props }) => (
    <p
      className="m-0 whitespace-pre-wrap break-words text-white"
      style={{ color: '#ffffff' }}
      {...props}
    />
  ),
  strong: ({ node: _node, ...props }) => (
    <strong className="font-semibold text-white" style={{ color: '#ffffff' }} {...props} />
  ),
  em: ({ node: _node, ...props }) => (
    <em className="text-white" style={{ color: '#ffffff' }} {...props} />
  ),
  li: ({ node: _node, ...props }) => (
    <li className="text-white" style={{ color: '#ffffff' }} {...props} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="my-0 pl-5 text-white" style={{ color: '#ffffff' }} {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="my-0 pl-5 text-white" style={{ color: '#ffffff' }} {...props} />
  ),
  code: ({ node: _node, className, children, ...props }) => (
    <code className={cn(className, 'text-white')} style={{ color: '#ffffff' }} {...props}>
      {children}
    </code>
  ),
  a: ({ node: _node, ...props }) => (
    <a
      className="text-white underline underline-offset-4"
      style={{ color: '#ffffff' }}
      {...props}
    />
  ),
};

function extractAttachmentMeta(content: string): { files: string[]; cleaned: string } {
  const match = content.match(ATTACHMENTS_HEADER_RE);
  if (!match) return { files: [], cleaned: content };

  const files = match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const cleaned = content
    .replace(ATTACHMENTS_HEADER_RE, '')
    .replace(/^\s+/, '')
    .replace(ATTACHMENTS_PAYLOAD_RE, '')
    .trim();

  return { files, cleaned };
}

export const MessageBubble = memo(
  function MessageBubble({
    message,
    shouldStream = false,
    isLastMessage = false,
    isRunning = false,
    showContinueButton = false,
    continueLabel,
    onContinue,
    isLoading = false,
  }: MessageBubbleProps) {
    const [streamComplete, setStreamComplete] = useState(!shouldStream);
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isUser = message.type === 'user';
    const isTool = message.type === 'tool';
    const isSystem = message.type === 'system';
    const isAssistant = message.type === 'assistant';

    const toolName = message.toolName || message.content?.match(/Using tool: (\w+)/)?.[1];
    const toolDisplayInfo = toolName ? getToolDisplayInfo(toolName) : undefined;
    const ToolIcon = toolDisplayInfo?.icon;

    useEffect(() => {
      if (!shouldStream) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync from prop
        setStreamComplete(true);
      }
    }, [shouldStream]);

    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const attachmentMeta = useMemo(
      () =>
        isUser
          ? extractAttachmentMeta(message.content || '')
          : { files: [], cleaned: message.content || '' },
      [isUser, message.content],
    );

    const visibleContent = attachmentMeta.cleaned || message.content;

    const handleCopy = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(visibleContent);
        setCopied(true);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          setCopied(false);
        }, COPIED_STATE_DURATION_MS);
      } catch {
        // clipboard write may fail in non-secure contexts
      }
    }, [visibleContent]);
    const showCopyButton = !isTool && !!visibleContent?.trim();

    if (isTool && message.toolName === 'todowrite') {
      return null;
    }

    if (isTool && message.toolName?.endsWith('complete_task')) {
      return null;
    }

    const proseClasses = cn(
      'text-sm prose prose-sm max-w-none',
      'prose-headings:mt-2 prose-headings:mb-2 prose-headings:font-semibold',
      'prose-headings:text-inherit',
      'prose-p:my-2 prose-p:text-inherit',
      'prose-strong:text-inherit',
      'prose-ul:my-2 prose-ol:my-2',
      'prose-li:my-1 prose-li:text-inherit',
      'prose-a:text-inherit prose-a:underline prose-a:underline-offset-4',
      'prose-hr:border-white/10',
      'prose-blockquote:border-white/15 prose-blockquote:text-white/80',
      'prose-code:text-inherit',
      'prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded-md',
      'prose-pre:bg-white/8 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl',
      'prose-pre:text-inherit',
    );
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.snappy}
        className={cn(
          'group flex w-full',
          isUser ? 'justify-end' : isSystem ? 'justify-center' : 'justify-start',
        )}
      >
        {isTool &&
        toolName?.endsWith('browser_script') &&
        (message.toolInput as { actions?: unknown[] })?.actions ? (
          <BrowserScriptCard
            actions={
              (
                message.toolInput as {
                  actions: Array<{
                    action: string;
                    url?: string;
                    selector?: string;
                    ref?: string;
                    text?: string;
                    key?: string;
                  }>;
                }
              ).actions
            }
            isRunning={isLastMessage && isRunning}
          />
        ) : (
          <div
            className={cn(
              'max-w-[85%] rounded-2xl px-4 py-3 transition-all duration-200 relative shadow-sm',
              isUser
                ? 'max-w-[78%] md:max-w-[70%] rounded-[26px] rounded-br-[10px] bg-[#0A84FF] text-white border border-white/10 shadow-[0_10px_30px_rgba(10,132,255,0.28)]'
                : isTool
                  ? 'bg-muted border border-border'
                  : isSystem
                    ? 'max-w-[88%] md:max-w-[72%] rounded-[22px] bg-[linear-gradient(180deg,rgba(56,56,61,0.98),rgba(28,28,32,0.98))] text-white border border-white/16 shadow-[0_14px_38px_rgba(0,0,0,0.52)] backdrop-blur-md text-left selection:bg-white/20 selection:text-white'
                    : 'max-w-[78%] md:max-w-[70%] rounded-[26px] rounded-bl-[10px] bg-[#f2f2f7] dark:bg-[linear-gradient(180deg,rgba(56,56,61,0.98),rgba(28,28,32,0.98))] text-slate-900 dark:text-white border border-black/5 dark:border-white/12 shadow-[0_10px_30px_rgba(15,23,42,0.10)] dark:shadow-[0_14px_38px_rgba(0,0,0,0.45)]',
            )}
          >
            {isTool ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                {ToolIcon ? <ToolIcon className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                <span>{toolDisplayInfo?.label || toolName || 'Обработка'}</span>
                {isLastMessage && isRunning && <SpinningIcon className="h-3.5 w-3.5 ml-1" />}
              </div>
            ) : (
              <>
                {isSystem && (
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/12 bg-white/8 shadow-inner shadow-black/10">
                      <Terminal className="h-3.5 w-3.5 text-white/90" />
                    </span>
                    <span>Системное сообщение</span>
                  </div>
                )}
                {isUser ? (
                  <div className="space-y-2">
                    {attachmentMeta.files.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {attachmentMeta.files.map((file, index) => (
                          <div
                            key={`${file}-${index}`}
                            className="inline-flex max-w-full items-center gap-2 rounded-[18px] border border-white/15 bg-white/15 px-3 py-1.5 text-xs text-white/95 shadow-sm backdrop-blur-sm"
                          >
                            <Paperclip className="h-3.5 w-3.5 shrink-0" />
                            <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            <span className="max-w-[260px] truncate font-medium tracking-[0.01em]">
                              {file}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {visibleContent && (
                      <p className="text-[15px] leading-6 whitespace-pre-wrap break-words text-white">
                        {visibleContent}
                      </p>
                    )}
                  </div>
                ) : isAssistant && shouldStream && !streamComplete ? (
                  <StreamingText
                    text={visibleContent}
                    speed={120}
                    isComplete={streamComplete}
                    onComplete={() => setStreamComplete(true)}
                  >
                    {(streamedText) => (
                      <div
                        className={cn(
                          proseClasses,
                          isSystem
                            ? 'text-[14px] leading-6 !text-white opacity-100 [&_p]:!m-0 [&_*]:!text-white'
                            : !isUser &&
                                (isAssistant
                                  ? 'text-[15px] leading-6 !text-white opacity-100 [&_p]:!text-white [&_span]:!text-white [&_li]:!text-white [&_code]:!text-white'
                                  : 'text-[15px] leading-6'),
                        )}
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={isSystem || isAssistant ? whiteMarkdownComponents : undefined}
                        >
                          {streamedText}
                        </ReactMarkdown>
                      </div>
                    )}
                  </StreamingText>
                ) : (
                  <div
                    className={cn(
                      proseClasses,
                      isSystem
                        ? 'text-[14px] leading-6 !text-white opacity-100 [&_p]:!m-0 [&_*]:!text-white'
                        : !isUser &&
                            (isAssistant
                              ? 'text-[15px] leading-6 !text-white opacity-100 [&_p]:!text-white [&_span]:!text-white [&_li]:!text-white [&_code]:!text-white'
                              : 'text-[15px] leading-6'),
                    )}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={isSystem || isAssistant ? whiteMarkdownComponents : undefined}
                    >
                      {visibleContent}
                    </ReactMarkdown>
                  </div>
                )}
                <p
                  className={cn(
                    'mt-1.5 text-[11px]',
                    isUser
                      ? 'text-white/72'
                      : isSystem
                        ? 'text-white/88'
                        : isAssistant
                          ? 'text-slate-500 dark:text-white/72'
                          : 'text-muted-foreground',
                  )}
                >
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
                {isAssistant && showContinueButton && onContinue && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onContinue}
                    disabled={isLoading}
                    className="mt-3 gap-1.5"
                  >
                    <Play className="h-3 w-3" />
                    {continueLabel || 'Продолжить'}
                  </Button>
                )}
              </>
            )}
            {showCopyButton && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleCopy}
                    data-testid="message-copy-button"
                    className={cn(
                      'absolute bottom-2 right-2',
                      'opacity-0 group-hover:opacity-100 transition-all duration-200',
                      'p-1 rounded',
                      isUser
                        ? 'hover:bg-white/18'
                        : isSystem
                          ? 'hover:bg-white/10'
                          : 'hover:bg-accent',
                      isUser
                        ? !copied
                          ? 'text-white/70 hover:text-white'
                          : '!bg-blue-500/20 !text-blue-200'
                        : isSystem
                          ? !copied
                            ? 'text-white/50 hover:text-white/85'
                            : '!bg-blue-500/15 !text-blue-200'
                          : !copied
                            ? 'text-muted-foreground hover:text-foreground'
                            : '!bg-blue-500/10 !text-blue-400',
                    )}
                    aria-label={'Скопировать в буфер'}
                  >
                    <Check className={cn('absolute h-4 w-4', !copied && 'hidden')} />
                    <Copy className={cn('absolute h-4 w-4', copied && 'hidden')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <span>Скопировать в буфер</span>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </motion.div>
    );
  },
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.shouldStream === next.shouldStream &&
    prev.isLastMessage === next.isLastMessage &&
    prev.isRunning === next.isRunning &&
    prev.showContinueButton === next.showContinueButton &&
    prev.isLoading === next.isLoading,
);
