import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, ArrowUpRight, Command, LayoutDashboard, LogOut, Settings2, ShieldCheck, FolderGit2, Workflow } from 'lucide-react';
import { useLogoutOwner, getGetAuthSessionQueryKey, useHealthCheck, getHealthCheckQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

type Props = { children: ReactNode; username: string };

export function WorkspaceShell({ children, username }: Props) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const health = useHealthCheck({ query: { retry: 1, queryKey: getHealthCheckQueryKey() } });
  const logout = useLogoutOwner();
  const nav = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/repositories', label: 'Repositories', icon: FolderGit2 },
    { href: '/tasks', label: 'Tasks', icon: Workflow },
    { href: '/settings', label: 'Settings', icon: Settings2 },
  ];
  const signOut = () => logout.mutate(undefined, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getGetAuthSessionQueryKey() });
      setLocation('/login');
    },
  });
  const apiState = health.isLoading ? 'Checking' : health.isError ? 'Unavailable' : 'Operational';

  return (
    <div className="min-h-[100dvh] bg-background text-foreground md:flex">
      <aside className="relative z-10 flex w-full flex-col border-b border-sidebar-border bg-sidebar md:fixed md:inset-y-0 md:w-[248px] md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-5 py-5 md:px-6 md:py-7">
          <Link href="/dashboard" data-testid="link-brand-dashboard" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Command size={18} strokeWidth={2.2} /></span>
            <span><span className="block font-serif text-[17px] font-bold tracking-tight">AgentMilton</span><span className="mono block text-[9px] uppercase tracking-[.19em] text-muted-foreground">Private workspace</span></span>
          </Link>
          <span className="mono hidden text-[10px] text-muted-foreground md:block">v0.1.0</span>
        </div>
        <div className="px-4 pb-4 md:px-4">
          <div className="mb-3 hidden px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground md:block">Workspace</div>
          <nav className="flex gap-1 md:flex-col" aria-label="Main navigation">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase()}`} className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors md:flex-none ${location === href || (href !== '/dashboard' && location.startsWith(`${href}/`)) ? 'bg-sidebar-accent text-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}>
                <Icon size={16} strokeWidth={1.8} className={location === href || location.startsWith(`${href}/`) ? 'text-primary' : ''} />{label}
                {(location === href || location.startsWith(`${href}/`)) && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-primary md:block" />}
              </Link>
            ))}
          </nav>
        </div>
        <div className="hidden flex-1 md:block" />
        <div className="hidden px-4 pb-5 md:block">
          <div className="mb-4 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[11px] font-medium text-sidebar-foreground"><Activity size={13} /> API status</span>
              <span className={`size-1.5 rounded-full ${health.isError ? 'bg-amber-400' : health.isLoading ? 'bg-muted-foreground' : 'bg-primary'}`} />
            </div>
            <div data-testid="status-api-health" className="mono mt-2 text-[11px] text-muted-foreground">{apiState}</div>
          </div>
          <div className="mb-4 h-px bg-sidebar-border" />
          <div className="flex items-center gap-3 px-2">
            <span className="grid size-8 place-items-center rounded-full border border-sidebar-border bg-sidebar-accent font-serif text-xs font-bold uppercase text-primary">{username.slice(0, 1)}</span>
            <div className="min-w-0 flex-1"><div data-testid="text-owner-username" className="truncate text-xs font-medium">{username}</div><div className="mt-0.5 text-[10px] text-muted-foreground">Workspace owner</div></div>
            <button type="button" aria-label="Sign out" data-testid="button-sign-out" onClick={signOut} disabled={logout.isPending} className="rounded-md p-2 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground disabled:opacity-50"><LogOut size={15} /></button>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 pb-4 text-[10px] text-muted-foreground md:hidden">
          <span className="mono flex items-center gap-2"><span className={`size-1.5 rounded-full ${health.isError ? 'bg-amber-400' : 'bg-primary'}`} />API {apiState}</span>
          <button type="button" data-testid="button-sign-out-mobile" onClick={signOut} disabled={logout.isPending} className="flex items-center gap-1.5"><LogOut size={13} /> Sign out</button>
        </div>
      </aside>
      <main className="min-h-[calc(100dvh-120px)] flex-1 md:ml-[248px]">
        <header className="hidden h-[61px] items-center justify-between border-b border-border/80 px-8 md:flex">
          <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-muted-foreground"><ShieldCheck size={13} className="text-primary" /> Owner environment <span className="text-border">/</span> {location.startsWith('/settings') ? 'Settings' : location.startsWith('/repositories') ? 'Repositories' : location.startsWith('/tasks') ? 'Tasks' : 'Overview'}</div>
          <div className="mono flex items-center gap-2 text-[10px] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" /> SESSION PRIVATE</div>
        </header>
        {children}
        <footer className="flex items-center justify-between border-t border-border/70 px-6 py-5 text-[10px] text-muted-foreground md:px-10">
          <span className="mono">BUILT FOR ONE OWNER. NOTHING SHARED.</span>
          <span className="hidden items-center gap-1 md:flex">System status <ArrowUpRight size={11} /></span>
        </footer>
      </main>
    </div>
  );
}

export function LoadingScreen() {
  return <div className="min-h-[100dvh] bg-background p-6 md:p-10"><div className="mx-auto max-w-5xl animate-pulse"><div className="h-3 w-24 rounded bg-muted" /><div className="mt-10 h-10 w-64 rounded bg-muted" /><div className="mt-3 h-4 w-80 rounded bg-muted/70" /><div className="mt-10 grid gap-4 md:grid-cols-2"><div className="h-52 rounded-2xl bg-card" /><div className="h-52 rounded-2xl bg-card" /></div></div></div>;
}

export function ErrorPanel({ onRetry, title = 'Could not load workspace' }: { onRetry: () => void; title?: string }) {
  return <section className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6" role="alert"><div className="font-serif text-lg font-semibold">{title}</div><p className="mt-2 text-sm text-muted-foreground">The service did not return a usable response. Your session and workspace data have not been changed.</p><button data-testid="button-retry" onClick={onRetry} className="mt-5 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">Try again</button></section>;
}
