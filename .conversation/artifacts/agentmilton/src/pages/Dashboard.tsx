import { type ReactNode } from 'react';
import { useGetDashboardOverview, getGetDashboardOverviewQueryKey } from '@workspace/api-client-react';
import { ArrowUpRight, Braces, CircleCheck, CircleDashed, Clock3, Code2, GitBranch, Layers3, LockKeyhole, Sparkles, Workflow } from 'lucide-react';
import { Link } from 'wouter';
import { ErrorPanel } from '@/components/WorkspaceShell';

type Props = { username: string };

function ProviderRow({ label, configured, icon }: { label: string; configured: boolean; icon: ReactNode }) {
  return <div className="flex items-center gap-3 border-b border-border/70 py-3.5 last:border-b-0">
    <span className="grid size-8 place-items-center rounded-lg border border-border bg-background/60 text-muted-foreground">{icon}</span>
    <div className="min-w-0 flex-1"><div className="text-[13px] font-medium">{label}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{configured ? 'Connected and available' : 'Not available in this milestone'}</div></div>
    <span data-testid={`status-provider-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`} className={`mono flex items-center gap-1.5 text-[9px] uppercase tracking-[.1em] ${configured ? 'text-primary' : 'text-muted-foreground'}`}><span className={`size-1.5 rounded-full ${configured ? 'bg-primary' : 'bg-muted-foreground/50'}`} />{configured ? 'Ready' : 'Not set'}</span>
  </div>;
}

export default function Dashboard({ username }: Props) {
  const overview = useGetDashboardOverview({ query: { queryKey: getGetDashboardOverviewQueryKey(), retry: 1 } });
  if (overview.isLoading) return <div className="px-5 py-10 md:px-10"><div className="mx-auto max-w-6xl animate-pulse"><div className="h-3 w-24 rounded bg-muted" /><div className="mt-7 h-10 w-72 rounded bg-muted" /><div className="mt-3 h-4 w-80 rounded bg-muted/70" /><div className="mt-9 grid gap-5 lg:grid-cols-[1.35fr_.85fr]"><div className="h-72 rounded-2xl bg-card" /><div className="h-72 rounded-2xl bg-card" /></div></div></div>;
  if (overview.isError || !overview.data) return <div className="px-5 py-10 md:px-10"><div className="mx-auto max-w-6xl"><ErrorPanel title="Workspace overview unavailable" onRetry={() => void overview.refetch()} /></div></div>;
  const data = overview.data;
  const configuredCount = [data.github.configured, data.openRouter.configured, data.gemini.configured, data.deepseek.configured].filter(Boolean).length;

  return <div className="relative px-5 pb-12 pt-8 md:px-10 md:pt-10">
    <div className="pointer-events-none absolute right-0 top-0 hidden h-72 w-[50%] grid-texture opacity-25 md:block" />
    <div className="relative mx-auto max-w-6xl">
      <div className="animate-appear">
        <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[.18em] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" /> Private workspace <span className="text-border">/</span> Milestone 01</div>
        <div className="mt-4 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><h1 className="font-serif text-[clamp(34px,5vw,52px)] font-semibold leading-tight tracking-[-.055em]">Good to see you, <span className="text-primary">{username}.</span></h1><p className="mt-2 text-sm text-muted-foreground">Your personal software cockpit is ready when you are.</p></div>
          <div className="mono flex items-center gap-2 self-start rounded-lg border border-border bg-card/70 px-3 py-2 text-[10px] text-muted-foreground sm:self-auto"><LockKeyhole size={12} className="text-primary" /> SINGLE-OWNER MODE</div>
        </div>
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.85fr]">
        <section className="animate-appear delay-1 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 md:px-6">
            <div><div className="flex items-center gap-2"><Layers3 size={15} className="text-primary" /><h2 className="text-sm font-semibold">Workspace readiness</h2></div><p className="mt-1 text-[11px] text-muted-foreground">Live configuration from your owner workspace</p></div>
            <span data-testid="text-readiness-count" className="mono rounded-md border border-border bg-background/70 px-2 py-1 text-[10px] text-muted-foreground">{configuredCount} / 4 READY</span>
          </div>
          <div className="px-5 md:px-6">
            <ProviderRow label={data.github.label || 'GitHub'} configured={data.github.configured} icon={<GitBranch size={15} />} />
            <ProviderRow label={data.openRouter.label || 'OpenRouter'} configured={data.openRouter.configured} icon={<Braces size={15} />} />
            <ProviderRow label={data.gemini.label || 'Gemini'} configured={data.gemini.configured} icon={<Sparkles size={15} />} />
            <ProviderRow label={data.deepseek.label || 'DeepSeek'} configured={data.deepseek.configured} icon={<Code2 size={15} />} />
          </div>
          <div className="flex items-center gap-2 border-t border-border bg-background/35 px-5 py-3.5 text-[11px] text-muted-foreground md:px-6"><CircleDashed size={13} className="text-primary/80" /> Only end-to-end integrations are marked ready. Repository and model tools are still staged.</div>
        </section>
        <section className="animate-appear delay-2 flex flex-col rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4 md:px-6"><Workflow size={15} className="text-primary" /><h2 className="text-sm font-semibold">Task queue</h2><span className="mono ml-auto text-[10px] text-muted-foreground">FIRST RUN</span></div>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
            <div className="relative mb-5 grid size-[68px] place-items-center rounded-2xl border border-border bg-background/70 text-primary"><div className="absolute inset-2 rounded-xl border border-dashed border-primary/20" /><CircleCheck size={22} strokeWidth={1.4} /></div>
            <div data-testid="text-active-task-count" className="font-serif text-4xl font-semibold tracking-tight">{data.activeTaskCount}</div>
            <div className="mono mt-1 text-[9px] uppercase tracking-[.2em] text-muted-foreground">Active tasks</div>
            {data.recentTasks.length === 0 ? <p data-testid="empty-recent-tasks" className="mt-5 max-w-[260px] text-xs leading-5 text-muted-foreground">No task records yet. Your activity will appear here once work is started through an available integration.</p> : <p className="mt-5 text-xs text-muted-foreground">{data.recentTasks.length} recent task{data.recentTasks.length === 1 ? '' : 's'} on record.</p>}
          </div>
          <div className="border-t border-border p-4"><button disabled data-testid="button-new-task-unavailable" title="Task tooling will be available after a later integration milestone" className="flex h-10 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-border bg-background/60 text-xs font-medium text-muted-foreground/60"><span className="mono text-[10px]">+</span> Task tools not connected</button></div>
        </section>
      </div>
      <section className="animate-appear delay-3 mt-5 rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
          <div className="flex items-center gap-2"><Clock3 size={15} className="text-primary" /><h2 className="text-sm font-semibold">Recent work</h2></div>
          <span className="mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">REAL RECORDS ONLY</span>
        </div>
        {data.recentTasks.length > 0 ? <div className="divide-y divide-border/70">{data.recentTasks.map((task) => <div key={task.id} data-testid={`row-recent-task-${task.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 md:px-6"><span className="grid size-8 place-items-center rounded-lg bg-background text-primary"><Code2 size={14} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.title}</p><p className="mono mt-1 text-[10px] text-muted-foreground">{task.status} · {new Date(task.updatedAt).toLocaleString()}</p></div></div>)}</div> : <div data-testid="empty-work-history" className="flex flex-col items-center px-5 py-8 text-center"><div className="grid size-10 place-items-center rounded-xl border border-border bg-background text-muted-foreground"><GitBranch size={16} /></div><p className="mt-3 text-sm font-medium">A clean slate.</p><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">There are no saved tasks or repository records to show. Nothing is simulated here.</p></div>}
      </section>
      <div className="mt-5 flex flex-col gap-4 rounded-xl border border-primary/15 bg-primary/[.035] px-5 py-4 sm:flex-row sm:items-center">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ArrowUpRight size={15} /></span>
        <p className="flex-1 text-xs leading-5 text-muted-foreground">Connections can be reviewed in account settings. Repository, model, and execution tools are intentionally held back until their real integrations are available.</p>
        <Link href="/settings" data-testid="link-dashboard-settings" className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80">Account settings <ArrowUpRight size={13} /></Link>
      </div>
    </div>
  </div>;
}
