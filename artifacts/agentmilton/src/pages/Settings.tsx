import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, KeyRound, LockKeyhole, ShieldCheck, Braces, Save, CircleAlert } from 'lucide-react';
import { getGetAuthSessionQueryKey, useChangeOwnerPassword, useGetAiSettings, getGetAiSettingsQueryKey, useListAiModels, getListAiModelsQueryKey, useUpdateAiSettings, type AiSettingsInput } from '@workspace/api-client-react';

export default function Settings({ forced }: { forced: boolean }) {
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const changePassword = useChangeOwnerPassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const settings = useGetAiSettings({ query: { queryKey: getGetAiSettingsQueryKey(), retry: 1 } });
  const models = useListAiModels({ provider: 'openrouter' }, { query: { queryKey: getListAiModelsQueryKey({ provider: 'openrouter' }), retry: 1 } });
  const saveSettings = useUpdateAiSettings();
  const [primaryModel, setPrimaryModel] = useState('');
  const [fallbackModel, setFallbackModel] = useState('');
  const [allowPaid, setAllowPaid] = useState(false);
  const [allowPaidFallback, setAllowPaidFallback] = useState(false);
  const [aiNotice, setAiNotice] = useState('');
  useEffect(() => {
    if (settings.data) {
      setPrimaryModel(settings.data.primaryModel ?? '');
      setFallbackModel(settings.data.fallbackModel ?? '');
      setAllowPaid(settings.data.allowPaidModels);
      setAllowPaidFallback(settings.data.allowPaidFallback);
    }
  }, [settings.data]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (newPassword.length < 12) { setError('Use at least 12 characters for your new password.'); return; }
    if (newPassword !== confirmation) { setError('The new password and confirmation do not match.'); return; }
    changePassword.mutate({ data: { currentPassword, newPassword } }, {
      onSuccess: async () => { setSuccess(true); await client.invalidateQueries({ queryKey: getGetAuthSessionQueryKey() }); setLocation('/login?changed=1'); },
      onError: () => setError('Password could not be changed. Confirm your current password and try again.'),
    });
  };
  const persistAi = () => {
    setAiNotice('');
    const input: AiSettingsInput = { primaryProvider: 'openrouter', primaryModel: primaryModel || null, fallbackProvider: 'openrouter', fallbackModel: fallbackModel || null, allowPaidModels: allowPaid, allowPaidFallback };
    saveSettings.mutate({ data: input }, { onSuccess: async () => { setAiNotice('OpenRouter preferences saved.'); await client.invalidateQueries({ queryKey: getGetAiSettingsQueryKey() }); }, onError: () => setAiNotice('Could not save model preferences. Verify the OpenRouter connection and try again.') });
  };
  const options = models.data?.models ?? [];
  const price = (id: string) => {
    const model = options.find((item) => item.id === id);
    if (!model) return '';
    if (model.priceStatus === 'free') return ' · Free';
    if (model.priceStatus === 'unknown') return ' · Price unknown';
    return ` · $${model.promptPricePerToken ?? '?'} in / $${model.completionPricePerToken ?? '?'} out per token`;
  };
  return <div className="px-5 pb-12 pt-8 md:px-10 md:pt-10"><div className="mx-auto max-w-5xl">
    <div className="animate-appear"><div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[.18em] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" /> Owner controls <span className="text-border">/</span> Security & AI</div><h1 className="mt-4 font-serif text-[clamp(34px,5vw,50px)] font-semibold tracking-[-.055em]">Account settings</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Manage access and the model that prepares reviewable drafts. One owner, one account.</p></div>
    {forced && <div data-testid="notice-password-required" className="animate-appear mt-7 flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[.05] p-4"><KeyRound size={16} className="mt-0.5 shrink-0 text-amber-200" /><div><p className="text-sm font-medium text-amber-100">Password update required</p><p className="mt-1 text-xs leading-5 text-amber-100/60">Before opening your workspace, set a new password for this owner account.</p></div></div>}
    <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_310px]"><div className="space-y-5">
      {!forced && <section className="animate-appear delay-1 rounded-2xl border border-border bg-card"><div className="flex items-center gap-3 border-b border-border px-5 py-5 md:px-6"><span className="grid size-9 place-items-center rounded-lg border border-primary/20 bg-primary/[.07] text-primary"><Braces size={16} /></span><div><h2 className="text-sm font-semibold">OpenRouter model policy</h2><p className="mt-1 text-[11px] text-muted-foreground">Models come from the connected OpenRouter catalog.</p></div><span className="mono ml-auto rounded border border-primary/20 px-2 py-1 text-[9px] text-primary">OPENROUTER</span></div>
        {settings.isLoading || models.isLoading ? <div className="space-y-3 p-6"><div className="h-10 animate-pulse rounded bg-muted" /><div className="h-10 animate-pulse rounded bg-muted" /></div> : settings.isError ? <div className="p-5 text-xs text-destructive">AI settings could not be loaded. <button className="underline" onClick={() => void settings.refetch()}>Retry</button></div> : <div className="space-y-5 p-5 md:p-6">
          {models.isError && <div className="flex items-start gap-2 rounded-lg border border-amber-200/20 bg-amber-100/[.04] p-3 text-[11px] leading-5 text-amber-100"><CircleAlert size={14} className="mt-0.5 shrink-0" />OpenRouter catalog unavailable. You can retain the saved model or retry the catalog request.</div>}
          {!models.isError && models.data && !models.data.configured && <div className="rounded-lg border border-amber-200/20 bg-amber-100/[.04] p-3 text-xs text-amber-100">OpenRouter is not configured. Add the server-side secret outside this browser to enable generation.</div>}
          {models.data?.error && <p className="text-xs text-muted-foreground">{models.data.error}</p>}
          <label className="block"><span className="mb-2 block text-xs font-medium">Primary model</span><select value={primaryModel} onChange={(e) => setPrimaryModel(e.target.value)} data-testid="select-primary-model" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-xs"><option value="">Use server default</option>{options.map((model) => <option key={model.id} value={model.id} disabled={model.priceStatus === 'paid' && !allowPaid}>{model.name} ({model.id}){price(model.id)}</option>)}</select><span className="mt-1.5 block text-[10px] text-muted-foreground">Paid models are disabled unless explicitly enabled below.</span></label>
          <label className="block"><span className="mb-2 block text-xs font-medium">Fallback model <span className="text-muted-foreground">(optional)</span></span><select value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value)} data-testid="select-fallback-model" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-xs"><option value="">No fallback</option>{options.map((model) => <option key={model.id} value={model.id} disabled={model.priceStatus === 'paid' && !allowPaidFallback}>{model.name} ({model.id}){price(model.id)}</option>)}</select></label>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3.5"><input type="checkbox" checked={allowPaid} onChange={(e) => setAllowPaid(e.target.checked)} data-testid="checkbox-allow-paid-models" className="mt-0.5 accent-[hsl(var(--primary))]" /><span><span className="block text-xs font-medium">Allow paid primary models</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">Opt in before selecting paid models. Cost is reported per task when available.</span></span></label>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3.5"><input type="checkbox" checked={allowPaidFallback} onChange={(e) => setAllowPaidFallback(e.target.checked)} data-testid="checkbox-allow-paid-fallback" className="mt-0.5 accent-[hsl(var(--primary))]" /><span><span className="block text-xs font-medium">Allow paid fallback models</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">Fallback has its own explicit paid-model safeguard.</span></span></label>
          <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={persistAi} disabled={saveSettings.isPending || (primaryModel !== '' && options.some((m) => m.id === primaryModel && m.priceStatus === 'paid') && !allowPaid) || (fallbackModel !== '' && options.some((m) => m.id === fallbackModel && m.priceStatus === 'paid') && !allowPaidFallback)} data-testid="button-save-ai-settings" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">{saveSettings.isPending ? 'Saving…' : <><Save size={13} /> Save model policy</>}</button>{aiNotice && <span role="status" className={`text-xs ${aiNotice.startsWith('Could') ? 'text-destructive' : 'text-primary'}`}>{aiNotice}</span>}</div>
        </div>}
      </section>}
      <section className="animate-appear delay-2 rounded-2xl border border-border bg-card"><div className="flex items-center gap-3 border-b border-border px-5 py-5 md:px-6"><span className="grid size-9 place-items-center rounded-lg border border-primary/20 bg-primary/[.07] text-primary"><LockKeyhole size={16} /></span><div><h2 className="text-sm font-semibold">Change password</h2><p className="mt-1 text-[11px] text-muted-foreground">Choose a unique password for this workspace.</p></div></div><form onSubmit={submit} className="space-y-5 p-5 md:p-6">
        <label className="block"><span className="mb-2 block text-xs font-medium">Current password</span><input required maxLength={256} autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} data-testid="input-current-password" className="h-11 w-full rounded-lg border border-input bg-background/50 px-3.5 text-sm focus:border-primary/60" placeholder="Enter current password" /></label>
        <label className="block"><span className="mb-2 block text-xs font-medium">New password</span><input required minLength={12} maxLength={256} autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} data-testid="input-new-password" className="h-11 w-full rounded-lg border border-input bg-background/50 px-3.5 text-sm focus:border-primary/60" placeholder="At least 12 characters" /><span className="mt-2 block text-[10px] text-muted-foreground">Use 12–256 characters. A passphrase is a good choice.</span></label>
        <label className="block"><span className="mb-2 block text-xs font-medium">Confirm new password</span><input required minLength={12} maxLength={256} autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} data-testid="input-confirm-password" className="h-11 w-full rounded-lg border border-input bg-background/50 px-3.5 text-sm focus:border-primary/60" placeholder="Enter it once more" /></label>
        {error && <div data-testid="status-password-error" role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[.06] px-3.5 py-3 text-xs text-red-200">{error}</div>}
        {success && <div data-testid="status-password-success" role="status" className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[.06] px-3.5 py-3 text-xs text-primary"><Check size={14} /> Password updated. Active sessions may need to sign in again.</div>}
        <button type="submit" disabled={changePassword.isPending || success || !currentPassword || !newPassword || !confirmation} data-testid="button-change-password" className="group flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">{changePassword.isPending ? 'Updating password…' : success ? 'Password changed' : 'Update password'}{!changePassword.isPending && !success && <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />}</button>{success && <button type="button" onClick={() => setLocation('/login?changed=1')} data-testid="button-return-to-login" className="ml-3 inline-flex h-11 items-center gap-2 px-2 text-xs text-muted-foreground hover:text-foreground">Sign in again <ArrowRight size={13} /></button>}
      </form></section>
    </div><aside className="animate-appear delay-3 space-y-4"><div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2 text-primary"><ShieldCheck size={15} /><span className="mono text-[9px] uppercase tracking-[.16em]">Account boundary</span></div><h3 className="mt-4 font-serif text-lg font-semibold">Private means private.</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Authentication uses the server session. Credentials and provider secrets are never stored in browser storage.</p><div className="mono mt-5 border-t border-border pt-4 text-[9px] leading-5 text-muted-foreground">SESSION-BASED ACCESS<br />OWNER-ONLY CONTROL PLANE</div></div><div className="rounded-2xl border border-border bg-card p-5"><div className="mono text-[9px] uppercase tracking-[.16em] text-muted-foreground">Data boundary</div><p className="mt-3 text-xs leading-5 text-muted-foreground">Repository text submitted in a task is sent to OpenRouter. Generated output is a reviewable draft; commands and tests do not run here.</p></div></aside></div>
  </div></div>;
}
