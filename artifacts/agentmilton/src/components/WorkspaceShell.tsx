import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity,
  ArrowUpRight,
  Command,
  FolderGit2,
  LayoutDashboard,
  LogOut,
  Settings2,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { useHealthCheck, getHealthCheckQueryKey } from '@workspace/api-client-react';

type Props = { children: ReactNode; username: string };

export function WorkspaceShell({ children, username }: Props) {
  const [location, setLocation] = useLocation();
  const health = useHealthCheck({ query: { retry: 1, queryKey: getHealthCheckQueryKey() } });
  const nav = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/repositories', label: 'Repositories', icon: FolderGit2 },
    { href: '/tasks', label: 'Tasks', icon: Workflow },
    { href: '/settings', label: 'Settings', icon: Settings2 },
  ];

  const signOut = () => {
    sessionStorage.removeItem('agentmilton-owner-session');
    setLocation('/login');
  };

  const apiState = health.isLoading ? 'Checking' : health.isError ? 'Unavailable' : 'Operational';
  const isActive = (href: string) => location === href || location.startsWith(`${href}/`);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground md:flex">
      <aside className="relative z-20 flex w-full flex-col border-b border-sidebar-border/80 bg-sidebar/85 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-xl md:fixed md:inset-y-0 md:w-[264px] md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-5 py-5 md:px-6 md:py-6">
          <Link href="/dashboard" data-testid="link-brand-dashboard" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl border border-primary/30 bg-primary/12 text-primary shadow-[0_10px_30px_rgba(38,211,195,0.25)]">
              <Command size={18} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block font-serif text-[17px] font-bold tracking-tight text-foreground">AgentMilton</span>
              <span className="mono block text-[9px] uppercase tracking-[.19em] text-muted-foreground">Private workspace</span>
            </span>
          </Link>
          <span className="mono hidden rounded-full border border-sidebar-border bg-sidebar-accent/80 px-2 py-1 text-[9px] uppercase tracking-[.16em] text-muted-foreground md:block">
            v0.1.0
          </span>
        </div>

        <div className="px-4 pb-4 md:px-4">
          <div className="mb-3 hidden px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground md:block">
            Workspace
          </div>
          <nav className="flex gap-1.5 md:flex-col" aria-label="Main navigation">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                data-testid={`link-nav-${label.toLowerCase()}`}
                className={[
                  'group relative flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 md:justify-start',
                  isActive(href)
                    ? 'border border-primary/25 bg-primary/10 text-primary shadow-[0_10px_30px_rgba(38,211,195,0.12)]'
                    : 'border border-transparent bg-sidebar-accent/30 text-sidebar-foreground/90 hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-foreground',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex size-7 items-center justify-center rounded-lg border transition-colors',
                    isActive(href)
                      ? 'border-primary/30 bg-primary/12 text-primary'
                      : 'border-transparent bg-sidebar-accent text-sidebar-foreground group-hover:border-sidebar-border group-hover:text-foreground',
                  ].join(' ')}
                >
                  <Icon size={16} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1 text-left">{label}</span>
                {isActive(href) && <span className="hidden h-1.5 w-1.5 rounded-full bg-primary md:block" />}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden flex-1 md:block" />

        <div className="hidden px-4 pb-5 md:block">
          <div className="mb-4 rounded-2xl border border-sidebar-border bg-sidebar-accent/40 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[11px] font-medium text-sidebar-foreground">
                <Activity size={13} className="text-primary" /> API status
              </span>
              <span
                className={[
                  'size-2 rounded-full',
                  health.isError ? 'bg-amber-400' : health.isLoading ? 'bg-muted-foreground' : 'bg-primary',
                ].join(' ')}
              />
            </div>
            <div data-testid="status-api-health" className="mono mt-2 text-[11px] text-muted-foreground">
              {apiState}
            </div>
          </div>

          <div className="mb-4 h-px bg-sidebar-border/80" />

          <div className="flex items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/25 px-2.5 py-2.5">
            <span className="grid size-9 place-items-center rounded-full border border-sidebar-border bg-sidebar-accent font-serif text-xs font-bold uppercase text-primary">
              {username.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div data-testid="text-owner-username" className="truncate text-xs font-medium text-foreground">
                {username}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">Workspace owner</div>
            </div>
            <button
              type="button"
              aria-label="Sign out"
              data-testid="button-sign-out"
              onClick={signOut}
              disabled={false}
              className="rounded-lg border border-sidebar-border bg-sidebar/60 p-2 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 pb-4 text-[10px] text-muted-foreground md:hidden">
          <span className="mono flex items-center gap-2">
            <span className={['size-1.5 rounded-full', health.isError ? 'bg-amber-400' : 'bg-primary'].join(' ')} />
            API {apiState}
          </span>
          <button type="button" data-testid="button-sign-out-mobile" onClick={signOut} disabled={false} className="flex items-center gap-1.5 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-2 py-1.5 text-foreground">
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-h-[calc(100dvh-120px)] flex-1 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/.08),transparent_34rem)] md:ml-[264px]">
        <header className="hidden h-[69px] items-center justify-between border-b border-border/80 bg-card/30 px-8 backdrop-blur-sm md:flex">
          <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-muted-foreground">
            <ShieldCheck size={13} className="text-primary" /> Owner environment
            <span className="text-foreground/70">{location.startsWith('/settings') ? 'Settings' : location.startsWith('/repositories') ? 'Repositories' : location.startsWith('/tasks') ? 'Tasks' : 'Overview'}</span>
          </div>
          <div className="mono flex items-center gap-2 rounded-full border border-border bg-background/50 px-2.5 py-1 text-[10px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" /> SESSION PRIVATE
          </div>
        </header>

        <div className="px-4 pb-6 pt-4 md:px-8 md:pb-8 md:pt-6">{children}</div>

        <footer className="flex items-center justify-between border-t border-border/70 bg-card/30 px-6 py-5 text-[10px] text-muted-foreground backdrop-blur-sm md:px-10">
          <span className="mono tracking-[.14em]">BUILT FOR ONE OWNER. NOTHING SHARED.</span>
          <span className="hidden items-center gap-1 md:flex">
            System status <ArrowUpRight size={11} />
          </span>
        </footer>
      </main>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="min-h-[100dvh] bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl animate-pulse">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="mt-10 h-10 w-64 rounded-xl bg-muted/80" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="h-32 rounded-2xl bg-muted/80" />
          <div className="h-32 rounded-2xl bg-muted/80" />
          <div className="h-32 rounded-2xl bg-muted/80" />
        </div>
      </div>
    </div>
  );
}

export function ErrorPanel({ onRetry, title = 'Could not load workspace' }: { onRetry: () => void; title?: string }) {
  return (
    <section className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 shadow-[0_12px_32px_rgba(5,61,57,0.12)]" role="alert">
      <div className="font-serif text-lg font-semibold text-foreground">{title}</div>
      <p className="mt-2 text-sm text-muted-foreground">
        The service did not return a usable response. Your session and workspace data have not been changed.
      </p>
      <button
        data-testid="button-retry"
        onClick={onRetry}
        className="mt-5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary/35 hover:bg-primary/5"
      >
        Try again
      </button>
    </section>
  );
}
