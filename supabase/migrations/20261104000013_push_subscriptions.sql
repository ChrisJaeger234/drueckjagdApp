-- =============================================================================
-- 0013 – Push-Benachrichtigungen (Phase 9, Teil 2)
--
-- Rein additiv: neue Tabelle push_subscriptions und zwei RPCs.
--   * Je Gerät (Push-Endpunkt) ein Abo, das genau einem Benutzer gehört.
--     Meldet sich auf dem Gerät ein anderer an, geht das Abo auf ihn über.
--   * Jeder sieht und ändert nur die eigenen Abos. Versendet wird von der
--     Edge Function „notify“ mit dem Service-Schlüssel (nur auf dem Server).
--   * Einstellungen je Gerät: Chat-Nachrichten, Nachsuchen (angeschossen).
-- =============================================================================

create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  user_agent      text not null default '',
  notify_chat     boolean not null default true,
  notify_reports  boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  constraint push_subscriptions_keys_length check (char_length(p256dh) <= 200 and char_length(auth) <= 100),
  constraint push_subscriptions_user_agent_length check (char_length(user_agent) <= 300)
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

comment on table public.push_subscriptions is
  'Web-Push-Abos je Gerät. Versand nur serverseitig (Edge Function notify).';

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant update (notify_chat, notify_reports) on public.push_subscriptions to authenticated;

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: eigene lesen"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "push_subscriptions: eigene ändern"
  on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "push_subscriptions: eigene löschen"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Gerät anmelden bzw. Einstellungen ändern. security definer, weil ein Endpunkt,
-- den vorher ein anderer Benutzer auf demselben Gerät hatte, übernommen wird.
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default '',
  p_notify_chat boolean default true,
  p_notify_reports boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, notify_chat, notify_reports)
  values (v_user, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300), p_notify_chat, p_notify_reports)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        notify_chat = excluded.notify_chat,
        notify_reports = excluded.notify_reports;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text, boolean, boolean) to authenticated;
