import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateAgentTask, useListAgentTasks, getListAgentTasksQueryKey, useListGitHubRepositories, getListGitHubRepositoriesQueryKey, useListGitHubBranches, getListGitHubBranchesQueryKey } from '@workspace/api-client-react';
import { ArrowUpRight, Code2, GitBranch, Plus, ShieldAlert, Sparkles } from 'lucide-react';
import { ErrorPanel } from '@/components/WorkspaceShell';

function StatusPill({ status }: { status: string }) {
  const tone = ['draft', 'tests_passed'].includes(status) ? 'text-primary border-primary/25 bg-primary/[.06]' : ['failed', 'tests_failed'].includes(status) ? 'text-destructive border-destructive/25 bg-destructive/[.06]' : 'text-amber-200 border-amber-200/20 bg-amber-200/[.04]';
  return <span className={`mono rounded-md border px-2 py-1 text-[9px] uppercase tracking-[.08em] ${tone}`}>{status.replaceAll('_', ' ')}</span>;
}

export default function Tasks() {
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const [repository, setRepository] = useState(params.get('repository') || '');
  const [branch, setBranch] = useState(params.get('branch') || '');
  const [prompt, setPrompt] = useState('');
  const [ownerInitiated, setOwnerInitiated] = useState(false);
  const [error, setError] = useState('');
  const tasks = useListAgentTasks({ query: { queryKey: getListAgentTasksQueryKey(), retry: 1 } });
  const repos = useListGitHubRepositories({ page: 1, per_page: 100 }, { query: { queryKey: getListGitHubRepositoriesQueryKey({ page: 1, per_page: 100 }), retry: 1 } });
  const [owner, repo] = repository.split('/');
  const branches = useListGitHubBranches(owner || '', repo || '', { per_page: 100 }, { query: { queryKey: getListGitHubBranchesQueryKey(owner || '', repo || '', { per_page: 100 }), enabled: Boolean(owner && repo), retry: 1 } });
  const create = useCreateAgentTask();
  useEffect(() => { if (branches.data?.branches.length && !branches.data.branches.some((item) => item.name === branch)) setBranch(branches.data.branches[0].name); }, [branches.data, branch]);
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!repository || !branch || prompt.trim().length < 3 || !ownerInitiated) { setError('Choose a repository and branch, describe the change, and confirm the remote branch creation.'); return; }
    create.mutate({ data: { repositoryFullName: repository, baseBranch: branch, prompt: prompt.trim() } }, {
      onSuccess: async (task) => { await client.invalidateQueries({ queryKey: getListAgentTasksQueryKey() }); setLocation(`/tasks/${task.id}`); },
      onError: () => setError('The draft request could not be created. Check the connection and try again.'),
    });
  };
  return <div className="px-5 pb-12 pt-8 md:px-10 md:pt-10"><div className="mx-auto max-w-6xl">
    <div className="animate-appear"><div className="mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Agent workspace <span className="text-border">/</span> Tasks</div><div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="font-serif text-[clamp(34px,5vw,52px)] font-semibold tracking-[-.055em]">Task desk</h1><p className="mt-2 text-sm text-muted-foreground">Ask for a reviewable code draft. Nothing is committed or executed.</p></div><span className="mono inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3 py-2 text-[10px] text-muted-foreground"><Code2 size={13} className="text-primary" /> DRAFTS ONLY</span></div></div>
    <div className="mt-8 grid gap-5 xl:grid-cols-[.92fr_1.08fr]">
      <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><div className="flex items-center gap-2"><Plus size={15} className="text-primary" /><h2 className="text-sm font-semibold">Prepare a code draft</h2></div><p className="mt-1 text-[11px] text-muted-foreground">Repository and branch context are required.</p></div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <label className="block"><span className="mb-2 block text-xs font-medium">Repository</span><select required value={repository} onChange={(e) => { setRepository(e.target.value); setBranch(''); }} data-testid="select-task-repository" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="">Select a connected repository</option>{(repos.data?.repositories ?? []).map((r) => <option key={r.id} value={r.fullName}>{r.fullName}</option>)}</select>{repos.isLoading && <span className="mt-1 block text-[10px] text-muted-foreground">Loading connected repositories…</span>}{repos.isError && <span className="mt-1 block text-[10px] text-destructive">Repository list could not be loaded.</span>}</label>
          <label className="block"><span className="mb-2 block text-xs font-medium">Base branch</span><span className="relative block"><GitBranch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><select required disabled={!repository || branches.isLoading} value={branch} onChange={(e) => setBranch(e.target.value)} data-testid="select-task-branch" className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm disabled:opacity-50"><option value="">{branches.isLoading ? 'Loading branches…' : 'Select a branch'}</option>{(branches.data?.branches ?? []).map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}</select></span></label>
          <label className="block"><span className="mb-2 block text-xs font-medium">What should change?</span><textarea required minLength={3} maxLength={12000} rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} data-testid="input-task-prompt" placeholder="Describe the outcome and any constraints…" className="w-full resize-y rounded-lg border border-input bg-background/70 px-3.5 py-3 text-sm leading-6 placeholder:text-muted-foreground/60" /></label>
          <div className="rounded-lg border border-amber-200/20 bg-amber-100/[.04] p-3.5"><div className="flex gap-2 text-amber-100"><ShieldAlert size={14} className="mt-0.5 shrink-0" /><p className="text-[11px] font-semibold">Context leaves this workspace</p></div><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">Repository text and your prompt are sent to OpenRouter to generate the task draft. Review sensitive content before continuing.</p></div>
          <label className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/[.035] p-3.5"><input type="checkbox" checked={ownerInitiated} onChange={(e) => setOwnerInitiated(e.target.checked)} data-testid="checkbox-owner-initiated-task" className="mt-0.5 accent-[hsl(var(--primary))]" /><span><span className="block text-xs font-semibold">I am initiating this task</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">Submitting immediately creates a remote isolated GitHub branch named <span className="mono text-foreground">agentmilton/&lt;task-id&gt;</span>, before drafting. No commit or push is made.</span></span></label>
          {error && <p role="alert" data-testid="status-create-task-error" className="rounded-lg border border-destructive/25 bg-destructive/[.06] p-3 text-xs text-destructive">{error}</p>}
          <button type="submit" disabled={create.isPending || !repository || !branch || prompt.trim().length < 3 || !ownerInitiated} data-testid="button-create-task" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{create.isPending ? 'Creating remote branch…' : <><Sparkles size={14} /> Start task & create branch</>}</button>
        </form>
      </section>
      <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">Task history</h2><p className="mt-1 text-[11px] text-muted-foreground">Server records only</p></div><span className="mono text-[10px] text-muted-foreground">{tasks.data?.length ?? '—'} RECORDS</span></div>
        {tasks.isLoading && <div className="space-y-3 p-5"><div className="h-14 animate-pulse rounded-lg bg-muted" /><div className="h-14 animate-pulse rounded-lg bg-muted" /></div>}
        {tasks.isError && <div className="p-5"><ErrorPanel title="Task history unavailable" onRetry={() => void tasks.refetch()} /></div>}
        {tasks.data && (tasks.data.length ? <div className="divide-y divide-border/70">{tasks.data.map((task) => <button key={task.id} onClick={() => setLocation(`/tasks/${task.id}`)} data-testid={`button-open-task-${task.id}`} className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/35"><span className="mt-0.5 grid size-8 place-items-center rounded-lg border border-border bg-background text-primary"><Code2 size={14} /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-xs font-semibold">{task.title}</span><StatusPill status={task.status} /></span><span className="mono mt-1.5 block truncate text-[10px] text-muted-foreground">{task.repositoryFullName} · {task.baseBranch}</span><span className="mt-1 block text-[10px] text-muted-foreground">{new Date(task.updatedAt).toLocaleString()}</span></span><ArrowUpRight size={14} className="shrink-0 text-muted-foreground" /></button>)}</div> : <div className="px-6 py-14 text-center"><Code2 size={23} className="mx-auto text-muted-foreground" /><p className="mt-3 text-sm font-medium">No tasks yet</p><p className="mt-1 text-xs text-muted-foreground">Your real draft requests will appear here.</p></div>)}
      </section>
    </div>
  </div></div>;
}
