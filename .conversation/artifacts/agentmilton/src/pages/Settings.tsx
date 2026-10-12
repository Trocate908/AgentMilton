import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { getGetAuthSessionQueryKey, useChangeOwnerPassword } from '@workspace/api-client-react';

export default function Settings({ forced }: { forced: boolean }) {
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const changePassword = useChangeOwnerPassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (newPassword.length < 12) {
      setError('Use at least 12 characters for your new password.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('The new password and confirmation do not match.');
      return;
    }
    changePassword.mutate({ data: { currentPassword, newPassword } }, {
      onSuccess: async () => {
        setSuccess(true);
        await client.invalidateQueries({ queryKey: getGetAuthSessionQueryKey() });
        setLocation('/login?changed=1');
      },
      onError: () => setError('Password could not be changed. Confirm your current password and try again.'),
    });
  };

  return <div className="px-5 pb-12 pt-8 md:px-10 md:pt-10">
    <div className="mx-auto max-w-5xl">
      <div className="animate-appear">
        <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[.18em] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" /> Owner controls <span className="text-border">/</span> Security</div>
        <h1 className="mt-4 font-serif text-[clamp(34px,5vw,50px)] font-semibold tracking-[-.055em]">Account settings</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Manage access to your private workspace. Settings are kept deliberately small: one owner, one account.</p>
      </div>
      {forced && <div data-testid="notice-password-required" className="animate-appear mt-7 flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[.05] p-4"><KeyRound size={16} className="mt-0.5 shrink-0 text-amber-200" /><div><p className="text-sm font-medium text-amber-100">Password update required</p><p className="mt-1 text-xs leading-5 text-amber-100/60">Before opening your workspace, set a new password for this owner account.</p></div></div>}

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_310px]">
        <section className="animate-appear delay-1 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border px-5 py-5 md:px-6"><span className="grid size-9 place-items-center rounded-lg border border-primary/20 bg-primary/[.07] text-primary"><LockKeyhole size={16} /></span><div><h2 className="text-sm font-semibold">Change password</h2><p className="mt-1 text-[11px] text-muted-foreground">Choose a unique password for this workspace.</p></div></div>
          <form onSubmit={submit} className="space-y-5 p-5 md:p-6">
            <label className="block"><span className="mb-2 block text-xs font-medium">Current password</span><input required maxLength={256} autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} data-testid="input-current-password" className="h-11 w-full rounded-lg border border-input bg-background/50 px-3.5 text-sm focus:border-primary/60" placeholder="Enter current password" /></label>
            <label className="block"><span className="mb-2 block text-xs font-medium">New password</span><input required minLength={12} maxLength={256} autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} data-testid="input-new-password" className="h-11 w-full rounded-lg border border-input bg-background/50 px-3.5 text-sm focus:border-primary/60" placeholder="At least 12 characters" /><span className="mt-2 block text-[10px] text-muted-foreground">Use 12–256 characters. A passphrase is a good choice.</span></label>
            <label className="block"><span className="mb-2 block text-xs font-medium">Confirm new password</span><input required minLength={12} maxLength={256} autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} data-testid="input-confirm-password" className="h-11 w-full rounded-lg border border-input bg-background/50 px-3.5 text-sm focus:border-primary/60" placeholder="Enter it once more" /></label>
            {error && <div data-testid="status-password-error" role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[.06] px-3.5 py-3 text-xs text-red-200">{error}</div>}
            {success && <div data-testid="status-password-success" role="status" className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[.06] px-3.5 py-3 text-xs text-primary"><Check size={14} /> Password updated. Active sessions may need to sign in again.</div>}
            <button type="submit" disabled={changePassword.isPending || success || !currentPassword || !newPassword || !confirmation} data-testid="button-change-password" className="group flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">{changePassword.isPending ? 'Updating password…' : success ? 'Password changed' : 'Update password'}{!changePassword.isPending && !success && <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />}</button>
            {success && <button type="button" onClick={() => setLocation('/login?changed=1')} data-testid="button-return-to-login" className="ml-3 inline-flex h-11 items-center gap-2 px-2 text-xs text-muted-foreground hover:text-foreground">Sign in again <ArrowRight size={13} /></button>}
          </form>
        </section>
        <aside className="animate-appear delay-2 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-primary"><ShieldCheck size={15} /><span className="mono text-[9px] uppercase tracking-[.16em]">Account boundary</span></div>
            <h3 className="mt-4 font-serif text-lg font-semibold">Private means private.</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">This workspace is designed for a single owner. Authentication is handled by the server session; credentials are never stored in browser storage.</p>
            <div className="mono mt-5 border-t border-border pt-4 text-[9px] leading-5 text-muted-foreground">SESSION-BASED ACCESS<br />OWNER-ONLY CONTROL PLANE</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mono text-[9px] uppercase tracking-[.16em] text-muted-foreground">Integration status</div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">Repository, model, and task controls will appear when their real integrations are available. Nothing is shown as ready before it is configured.</p>
          </div>
        </aside>
      </div>
    </div>
  </div>;
}
