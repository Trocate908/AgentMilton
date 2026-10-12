import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useGetAuthSession, getGetAuthSessionQueryKey } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorPanel, LoadingScreen, WorkspaceShell } from '@/components/WorkspaceShell';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import NotFound from '@/pages/not-found';
import Settings from '@/pages/Settings';
import Repositories from '@/pages/Repositories';
import RepositoryDetail from '@/pages/RepositoryDetail';
import Tasks from '@/pages/Tasks';
import TaskDetail from '@/pages/TaskDetail';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
});

function LoginRoute() {
  return <Login />;
}

function ProtectedPage({ children, allowPasswordReset = false }: { children: (username: string, forced: boolean) => ReactNode; allowPasswordReset?: boolean }) {
  const session = useGetAuthSession({ query: { queryKey: getGetAuthSessionQueryKey(), retry: 1 } });
  const [, setLocation] = useLocation();
  const mustChange = Boolean(session.data?.mustChangePassword);
  useEffect(() => {
    if (!session.isLoading && !session.isError && session.data && !session.data.authenticated) setLocation('/login');
    else if (!session.isLoading && !session.isError && session.data?.authenticated && mustChange && !allowPasswordReset) setLocation('/settings');
  }, [session.isLoading, session.isError, session.data, mustChange, allowPasswordReset, setLocation]);

  if (session.isLoading) return <LoadingScreen />;
  if (session.isError) return <div className="min-h-[100dvh] bg-background p-6 md:p-10"><div className="mx-auto max-w-xl pt-[12vh]"><ErrorPanel title="Could not verify your owner session" onRetry={() => void session.refetch()} /></div></div>;
  if (!session.data?.authenticated) return <LoadingScreen />;
  if (mustChange && !allowPasswordReset) return <LoadingScreen />;
  const username = session.data.username || 'Owner';
  return <WorkspaceShell username={username}>{children(username, mustChange)}</WorkspaceShell>;
}

function DashboardRoute() {
  return <ProtectedPage>{(username) => <Dashboard username={username} />}</ProtectedPage>;
}

function SettingsRoute() {
  return <ProtectedPage allowPasswordReset>{(_username, forced) => <Settings forced={forced} />}</ProtectedPage>;
}

function IndexRoute() {
  const [, setLocation] = useLocation();
  useEffect(() => setLocation('/login'), [setLocation]);
  return <LoadingScreen />;
}

function Router() {
  return (
    <RouteErrorBoundary>
      <Switch>
        <Route path="/" component={IndexRoute} />
        <Route path="/login" component={LoginRoute} />
        <Route path="/dashboard" component={DashboardRoute} />
        <Route path="/repositories" component={() => <ProtectedPage>{() => <Repositories />}</ProtectedPage>} />
        <Route path="/repositories/:owner/:repo" component={() => <ProtectedPage>{() => <RepositoryDetail />}</ProtectedPage>} />
        <Route path="/tasks" component={() => <ProtectedPage>{() => <Tasks />}</ProtectedPage>} />
        <Route path="/tasks/:taskId" component={() => <ProtectedPage>{() => <TaskDetail />}</ProtectedPage>} />
        <Route path="/settings" component={SettingsRoute} />
        <Route component={NotFound} />
      </Switch>
    </RouteErrorBoundary>
  );
}

function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
