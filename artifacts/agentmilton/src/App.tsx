import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
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
import TaskChat from '@/pages/TaskChat';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
});

function LoginRoute() {
  return <Login />;
}

const AUTH_KEY = 'agentmilton-owner-session';

function ProtectedPage({ children }: { children: (username: string, forced: boolean) => ReactNode }) {
  const [, setLocation] = useLocation();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) === '1') setAuthenticated(true);
    else setLocation('/login');
  }, [setLocation]);

  if (!authenticated) return <LoadingScreen />;
  return <WorkspaceShell username="Trocate9">{children('Trocate9', false)}</WorkspaceShell>;
}

function DashboardRoute() {
  return <ProtectedPage>{(username) => <Dashboard username={username} />}</ProtectedPage>;
}

function SettingsRoute() {
  return <ProtectedPage>{(_username, forced) => <Settings forced={forced} />}</ProtectedPage>;
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
        <Route path="/tasks/:taskId/chat" component={() => <ProtectedPage>{() => <TaskChat />}</ProtectedPage>} />
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
