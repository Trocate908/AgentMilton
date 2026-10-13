import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Command, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';

const OWNER_USERNAME = 'Trocate9';
const OWNER_PASSWORD = '#trocate9';
const AUTH_KEY = 'agentmilton-owner-session';

export default function Login() {
  const [, setLocation] = useLocation();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const passwordUpdated = new URLSearchParams(window.location.search).get('changed') === '1';

  useEffect(() => {
    setIsSignedIn(sessionStorage.getItem(AUTH_KEY) === '1');
  }, []);

  useEffect(() => {
    if (isSignedIn) setLocation('/dashboard');
  }, [isSignedIn, setLocation]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (username.trim() !== OWNER_USERNAME || password !== OWNER_PASSWORD) {
      setFormError('Those credentials could not be verified. Check them and try again.');
      return;
    }
    sessionStorage.setItem(AUTH_KEY, '1');
    setIsSignedIn(true);
  };

  return (
    <main className="relative flex min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="grid-texture pointer-events-none absolute inset-0 opacity-35" />
      <div className="pointer-events-none absolute -left-40 top-1/3 size-[420px] rounded-full bg-primary/[.035] blur-[100px]" />
      <section className="relative hidden w-[52%] flex-col justify-between border-r border-border/70 px-12 py-10 lg:flex xl:px-[8vw]">
        <div className="flex w-fit items-center gap-3" data-testid="brand-login">
          <span className="grid size-10 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Command size={20} /></span>
          <span className="font-serif text-[18px] font-bold tracking-tight">AgentMilton</span>
        </div>
        <div className="relative max-w-xl animate-appear">
          <div className="mono mb-6 flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-primary"><span className="size-1.5 rounded-full bg-primary" /> Your private build environment</div>
          <h1 className="font-serif text-[clamp(48px,6.3vw,88px)] font-semibold leading-[.98] tracking-[-.065em]">Make room<br />for the <span className="text-primary">work.</span></h1>
          <p className="mt-7 max-w-md text-[15px] leading-7 text-muted-foreground">A focused cockpit for your software projects. One owner, one private workspace, and a clear view of what is ready.</p>
          <div className="mt-12 flex items-center gap-3 border-t border-border/70 pt-5">
            <ShieldCheck size={16} className="text-primary" /><span className="text-xs text-muted-foreground">Private by design</span>
            <span className="mx-1 h-3 w-px bg-border" /><span className="mono text-[10px] text-muted-foreground">OWNER ACCESS ONLY</span>
          </div>
        </div>
        <div className="mono flex items-center justify-between text-[10px] text-muted-foreground"><span>AGENTMILTON / 001</span><span>PERSONAL SOFTWARE WORKSPACE</span></div>
      </section>
      <section className="relative flex min-h-[100dvh] w-full items-center justify-center px-5 py-10 lg:w-[48%] lg:px-10">
        <div className="absolute left-6 top-6 flex items-center gap-2 lg:hidden"><span className="grid size-8 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><Command size={16} /></span><span className="font-serif font-bold">AgentMilton</span></div>
        <div className="w-full max-w-[390px] animate-appear">
          <div className="mb-8">
            <div className="mono mb-3 text-[10px] uppercase tracking-[.18em] text-muted-foreground">OWNER SIGN-IN <span className="text-primary">/</span> SECURE GATE</div>
            <h2 className="font-serif text-[34px] font-semibold tracking-[-.045em]">Welcome back.</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to continue to your workspace.</p>
          </div>
          {passwordUpdated && <div data-testid="status-password-updated" className="mb-5 rounded-lg border border-primary/25 bg-primary/[.07] px-4 py-3 text-sm text-primary">Password updated. Sign in with your new password.</div>}
          {session.isError && <div role="status" className="mb-5 rounded-lg border border-amber-400/20 bg-amber-400/[.05] px-4 py-3 text-xs leading-5 text-amber-200/80">Owner sign-in setup is unavailable. Check the server connection and bootstrap secret, then reload.</div>}
          <form onSubmit={submit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-foreground/80">Owner name</span>
              <span className="relative block"><KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input autoComplete="username" required maxLength={100} value={username} onChange={(event) => setUsername(event.target.value)} data-testid="input-username" className="h-12 w-full rounded-lg border border-input bg-card/70 pl-10 pr-3 text-sm transition placeholder:text-muted-foreground/60 focus:border-primary/60 focus:bg-card" placeholder="Your owner name" /></span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-foreground/80">Password</span>
              <span className="relative block"><LockKeyhole size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input autoComplete="current-password" required maxLength={256} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} data-testid="input-password" className="h-12 w-full rounded-lg border border-input bg-card/70 pl-10 pr-11 text-sm transition placeholder:text-muted-foreground/60 focus:border-primary/60 focus:bg-card" placeholder="Enter your password" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} data-testid="button-toggle-password" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
            </label>
            {formError && <p data-testid="status-login-error" role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[.06] px-3.5 py-3 text-xs text-red-200">{formError}</p>}
            <button type="submit" disabled={login.isPending || !username.trim() || !password} data-testid="button-login" className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55">
              {login.isPending ? 'Verifying access…' : 'Enter workspace'} {!login.isPending && <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />}
            </button>
          </form>
          <div className="mt-7 flex items-center justify-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck size={13} /> Credentials are never saved on this device</div>
        </div>
      </section>
    </main>
  );
}
