import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useParams, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAgentTaskQueryKey,
  getListAgentTasksQueryKey,
  useGetAgentTask,
  useSendAgentTaskMessage,
} from '@workspace/api-client-react';
import {
  ArrowLeft,
  Bot,
  Check,
  CircleDot,
  Clock3,
  CornerDownLeft,
  GitBranch,
  LockKeyhole,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  AlertCircle,
} from 'lucide-react';

const ACTIVE_STATUSES = ['queued', 'inspecting', 'planning', 'generating', 'pushing'];
const TERMINAL_LOCKED_STATUSES = ['pushed', 'pull_request'];

function isActive(status: string) {
  return ACTIVE_STATUSES.includes(status);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function getServerError(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string') {
      return (data as { error: string }).error;
    }
  }
  return 'The message could not be sent. Please try again.';
}

export default function TaskChat() {
  const { taskId = '' } = useParams<{ taskId: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [sendError, setSendError] = useState('');
  const timelineRef = useRef<HTMLDivElement>(null);
  const taskQuery = useGetAgentTask(taskId, {
    query: {
      queryKey: getGetAgentTaskQueryKey(taskId),
      enabled: Boolean(taskId),
      retry: 1,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status && isActive(status) ? 7000 : false;
      },
    },
  });
  const send = useSendAgentTaskMessage();
  const task = taskQuery.data;
  const status = task?.status ?? '';
  const active = isActive(status);
  const terminalLocked = TERMINAL_LOCKED_STATUSES.includes(status);
  const unavailableReason = active
    ? 'The agent is working on this task. You can send a revision request when the current run finishes.'
    : terminalLocked
      ? 'This task has already been pushed or opened as a pull request. Further revisions are unavailable.'
      : '';
  const canSend = Boolean(task && !unavailableReason && !send.isPending && message.trim().length >= 2);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [task?.messages.length, send.isPending]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = message.trim();
    if (!task || content.length < 2 || unavailableReason || send.isPending) return;
    setSendError('');
    send.mutate(
      { taskId, data: { content } },
      {
        onSuccess: async (updated) => {
          queryClient.setQueryData(getGetAgentTaskQueryKey(taskId), updated);
          await queryClient.invalidateQueries({ queryKey: getListAgentTasksQueryKey() });
          setMessage('');
        },
        onError: (error) => setSendError(getServerError(error)),
      },
    );
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-120px)] flex-col">
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-4 pb-5 pt-5 sm:px-6 md:px-9 md:pb-8 md:pt-7">
        <div className="flex shrink-0 items-center justify-between gap-4">
          <Link
            href={task ? `/tasks/${task.id}` : '/tasks'}
            data-testid="link-chat-task-detail"
            className="group inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <span className="grid size-8 place-items-center rounded-lg border border-border bg-card transition group-hover:border-primary/35 group-hover:text-primary">
              <ArrowLeft size={14} />
            </span>
            <span>Back to task</span>
          </Link>
          <div className="mono hidden items-center gap-2 text-[9px] uppercase tracking-[.16em] text-muted-foreground sm:flex">
            <LockKeyhole size={11} className="text-primary" />
            Private task conversation
          </div>
        </div>

        {taskQuery.isLoading && (
          <div aria-label="Loading task conversation" className="mx-auto mt-10 w-full max-w-4xl animate-pulse">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="mt-5 h-10 w-2/3 rounded-lg bg-muted" />
            <div className="mt-10 space-y-5">
              <div className="ml-auto h-24 w-[72%] rounded-2xl bg-card" />
              <div className="h-36 w-[82%] rounded-2xl bg-card" />
              <div className="ml-auto h-20 w-[58%] rounded-2xl bg-card" />
            </div>
            <div className="mt-10 h-28 rounded-2xl bg-card" />
          </div>
        )}

        {taskQuery.isError && (
          <section className="mx-auto mt-12 w-full max-w-xl rounded-2xl border border-destructive/25 bg-destructive/[.06] p-6" role="alert">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div>
                <h1 className="font-serif text-lg font-semibold">Task conversation unavailable</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">We could not load this task. Your conversation has not been changed.</p>
                <button
                  type="button"
                  data-testid="button-retry-task-chat"
                  onClick={() => void taskQuery.refetch()}
                  className="mt-5 inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold transition hover:border-primary/35 hover:text-primary"
                >
                  Try again
                </button>
              </div>
            </div>
          </section>
        )}

        {!taskQuery.isLoading && !taskQuery.isError && !task && (
          <section className="mx-auto mt-12 w-full max-w-xl rounded-2xl border border-border bg-card p-7 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-primary/20 bg-primary/[.07] text-primary"><Bot size={20} /></div>
            <h1 className="mt-4 font-serif text-xl font-semibold">No task found</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">This conversation belongs to a task that is unavailable in your workspace.</p>
            <Link href="/tasks" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline"><ArrowLeft size={13} /> Return to tasks</Link>
          </section>
        )}

        {task && (
          <>
            <header className="mx-auto mt-5 w-full max-w-4xl shrink-0 animate-appear">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                <span className="mono inline-flex min-w-0 items-center gap-1.5 truncate"><GitBranch size={12} className="shrink-0 text-primary" />{task.repositoryFullName}</span>
                <span className="text-border">/</span>
                <span className="mono truncate">{task.baseBranch}</span>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[.07] px-2.5 py-1 mono text-[9px] uppercase tracking-[.1em] text-primary" data-testid="status-task-chat">
                  {active ? <span className="size-1.5 animate-pulse rounded-full bg-primary" /> : <CircleDot size={11} />}
                  {status.replaceAll('_', ' ')}
                </span>
              </div>
              <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0">
                  <p className="mono text-[9px] uppercase tracking-[.2em] text-muted-foreground">Task conversation</p>
                  <h1 className="mt-1.5 break-words font-serif text-[clamp(25px,4vw,36px)] font-semibold leading-tight tracking-[-.045em]" data-testid="text-task-chat-title">{task.title}</h1>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                  <Clock3 size={12} />
                  Updated {formatTime(task.updatedAt)}
                </div>
              </div>
              <p className="mt-2 line-clamp-2 max-w-3xl text-xs leading-5 text-muted-foreground">{task.summary || task.prompt}</p>
            </header>

            <main className="mx-auto mt-5 flex min-h-[360px] w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card/70 shadow-[0_18px_60px_-38px_rgba(0,0,0,.7)] md:mt-7">
              <div className="flex shrink-0 items-center justify-between border-b border-border/80 px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-lg border border-primary/20 bg-primary/[.08] text-primary"><Sparkles size={13} /></span>
                  <div>
                    <h2 className="text-xs font-semibold">Refinement thread</h2>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Context stays attached to this task</p>
                  </div>
                </div>
                <span className="mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">{task.messages.length} {task.messages.length === 1 ? 'message' : 'messages'}</span>
              </div>

              <div ref={timelineRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7" aria-label="Task conversation" aria-live="polite" data-testid="list-task-chat-messages">
                {task.messages.length === 0 ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center px-4 text-center">
                    <div className="relative grid size-14 place-items-center rounded-2xl border border-primary/20 bg-primary/[.07] text-primary">
                      <Bot size={23} />
                      <span className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-card bg-primary" />
                    </div>
                    <h3 className="mt-5 font-serif text-lg font-semibold tracking-tight">A clear next step starts here</h3>
                    <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">Ask for a focused change, clarify the task, or refine the draft. Milton will keep the request in this task’s review history.</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <span className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-[10px] text-muted-foreground">“Tighten the error handling”</span>
                      <span className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-[10px] text-muted-foreground">“Add a loading state”</span>
                    </div>
                  </div>
                ) : task.messages.map((item, index) => {
                  const owner = item.role === 'owner';
                  return (
                    <article key={`${item.createdAt}-${index}`} className={`flex gap-3 animate-appear ${owner ? 'flex-row-reverse' : ''}`} data-testid={`message-task-chat-${index}`}>
                      <div className={`grid size-8 shrink-0 place-items-center rounded-xl border ${owner ? 'border-primary/20 bg-primary/[.09] text-primary' : 'border-border bg-background text-muted-foreground'}`} aria-hidden="true">
                        {owner ? <UserRound size={14} /> : <Bot size={15} />}
                      </div>
                      <div className={`min-w-0 max-w-[88%] sm:max-w-[78%] ${owner ? 'text-right' : ''}`}>
                        <div className={`mb-1.5 flex items-center gap-2 text-[10px] ${owner ? 'justify-end' : ''}`}>
                          <span className="font-semibold">{owner ? 'You' : 'Milton'}</span>
                          <time className="text-muted-foreground" dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
                        </div>
                        <div className={`rounded-2xl border px-4 py-3.5 text-left ${owner ? 'rounded-tr-md border-primary/20 bg-primary/[.075]' : 'rounded-tl-md border-border bg-background/70'}`}>
                          <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.75]">{item.content}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {send.isPending && (
                  <div className="flex gap-3" aria-live="polite" data-testid="status-message-sending">
                    <div className="grid size-8 place-items-center rounded-xl border border-border bg-background text-muted-foreground"><Bot size={15} /></div>
                    <div className="rounded-2xl rounded-tl-md border border-border bg-background/70 px-4 py-3.5">
                      <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex gap-1"><i className="size-1 animate-pulse rounded-full bg-primary" /><i className="size-1 animate-pulse rounded-full bg-primary [animation-delay:120ms]" /><i className="size-1 animate-pulse rounded-full bg-primary [animation-delay:240ms]" /></span>Adding your request…</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-border/80 bg-background/35 p-3 sm:p-4">
                {unavailableReason && (
                  <div role="status" data-testid="status-chat-input-disabled" className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-200/15 bg-amber-100/[.035] px-3.5 py-3 text-[11px] leading-5 text-muted-foreground">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-amber-200" />
                    <span>{unavailableReason}</span>
                  </div>
                )}
                {sendError && (
                  <div role="alert" data-testid="status-chat-send-error" className="mb-3 flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/[.06] px-3.5 py-3 text-xs leading-5 text-destructive">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{sendError}</span>
                  </div>
                )}
                <form onSubmit={submit}>
                  <label htmlFor="task-chat-composer" className="sr-only">Write a revision request for this task</label>
                  <div className={`rounded-xl border bg-card transition focus-within:border-primary/45 focus-within:ring-1 focus-within:ring-primary/20 ${unavailableReason ? 'border-border/70 opacity-75' : 'border-input'}`}>
                    <textarea
                      id="task-chat-composer"
                      value={message}
                      onChange={(event) => { setMessage(event.target.value); if (sendError) setSendError(''); }}
                      onKeyDown={handleComposerKeyDown}
                      minLength={2}
                      maxLength={12000}
                      rows={3}
                      disabled={Boolean(unavailableReason) || send.isPending}
                      placeholder={unavailableReason ? 'Revision requests are unavailable right now' : 'Describe the change you want…'}
                      data-testid="input-task-chat-message"
                      className="block max-h-52 min-h-[76px] w-full resize-y rounded-t-xl bg-transparent px-4 py-3 text-[13px] leading-6 placeholder:text-muted-foreground/55 focus:outline-none disabled:cursor-not-allowed"
                    />
                    <div className="flex items-center justify-between gap-3 border-t border-border/70 px-3 py-2">
                      <p className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                        <CornerDownLeft size={12} className="shrink-0" />
                        <span><kbd className="font-sans">Enter</kbd> to send <span className="px-0.5 text-border">·</span> <kbd className="font-sans">Shift + Enter</kbd> for a new line</span>
                      </p>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="mono hidden text-[9px] text-muted-foreground sm:inline">{message.length.toLocaleString()} / 12,000</span>
                        <button
                          type="submit"
                          disabled={!canSend}
                          data-testid="button-send-task-chat-message"
                          className="inline-flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {send.isPending ? <><span className="size-3 animate-spin rounded-full border-2 border-primary-foreground/35 border-t-primary-foreground" />Sending</> : <><Send size={12} />Send request</>}
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[9px] leading-4 text-muted-foreground sm:text-[10px]">
                    <Check size={11} className="shrink-0 text-primary" />
                    Drafts stay review-only. No repository commands, commits, pushes, or pull requests are run.
                  </p>
                </form>
              </div>
            </main>
          </>
        )}
      </div>
    </div>
  );
}
