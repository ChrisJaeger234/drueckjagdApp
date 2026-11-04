import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Copy, Share2, UserMinus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Card, ConfirmButton, Page } from '../../components/ui';
import { Choice, Field, FormError, FormSuccess, TextArea, Toggle } from '../../components/form';
import { mapError } from '../../lib/errors';
import * as V from '../../lib/validators';
import { useUser } from '../auth/AuthContext';
import { Avatar } from '../profile/Avatar';
import {
  GROUP_ROLES,
  INVITE_STATUS_LABEL,
  inviteStatus,
  memberLabel,
  type CreatedInvite,
  type GroupPermissions,
  type GroupRole,
  type HuntingGroup,
} from './groupModel';
import { RoleBadge } from './RoleBadge';
import { useGroupActions, useInvites, useMembers, useMyGroup } from './useGroups';

const errorText = (e: unknown) => (e ? mapError(e).message : null);
const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

export function GroupDetailPage() {
  const { groupId } = useParams({ from: '/shell/gruppe/$groupId' });
  const { data: mine, isPending, error, permissions } = useMyGroup(groupId);

  return (
    <Page
      title={mine?.group.name ?? 'Gruppe'}
      actions={
        <Link to="/gruppe" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
          <ArrowLeft aria-hidden className="size-4" /> Alle Gruppen
        </Link>
      }
    >
      {isPending ? (
        <Card>
          <p className="text-sm text-muted">Gruppe wird geladen …</p>
        </Card>
      ) : error || !permissions ? (
        <FormError message={errorText(error) ?? 'Die Gruppe konnte nicht geladen werden.'} />
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Deine Rolle:</span>
              <RoleBadge role={mine.role} />
            </div>
            {mine.group.description && <p className="mt-2 whitespace-pre-line text-sm">{mine.group.description}</p>}
          </Card>
          <Members groupId={groupId} permissions={permissions} />
          {permissions.canInvite && <Invites groupId={groupId} />}
          {permissions.canEditGroup && <Settings group={mine.group} />}
          <Danger groupId={groupId} permissions={permissions} />
        </>
      )}
    </Page>
  );
}

function Members({ groupId, permissions }: { groupId: string; permissions: GroupPermissions }) {
  const user = useUser();
  const { data: members, isPending, error } = useMembers(groupId);
  const { setRole, removeMember } = useGroupActions(groupId);
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Mitglieder{members ? ` (${members.length})` : ''}</h2>
      {isPending ? (
        <p className="text-sm text-muted">Mitglieder werden geladen …</p>
      ) : error ? (
        <FormError message={errorText(error)} />
      ) : (
        <ul className="grid gap-3" aria-label="Mitglieder">
          {members.map((m) => {
            const isSelf = m.userId === user.id;
            const label = memberLabel(m);
            return (
              <li key={m.id} className="grid gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <Avatar path={m.profile?.avatarPath ?? null} name={label} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {label}
                      {isSelf && <span className="text-muted"> (du)</span>}
                    </div>
                    {m.profile?.username && <div className="truncate text-sm text-muted">@{m.profile.username}</div>}
                  </div>
                  {!(permissions.canAssignRoles && !isSelf) && <RoleBadge role={m.role} />}
                </div>
                {permissions.canAssignRoles && !isSelf && (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted">Rolle</span>
                    <select
                      aria-label={`Rolle von ${label}`}
                      value={m.role}
                      disabled={setRole.isPending}
                      onChange={(e) => setRole.mutate({ userId: m.userId, role: e.target.value as GroupRole })}
                      className="min-h-10 rounded-xl border border-line bg-surface px-2"
                    >
                      {(Object.keys(GROUP_ROLES) as GroupRole[]).map((r) => (
                        <option key={r} value={r}>
                          {GROUP_ROLES[r].label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {permissions.canRemove(m.role, isSelf) && (
                  <ConfirmButton
                    label={
                      <>
                        <UserMinus aria-hidden className="size-4" /> Entfernen
                      </>
                    }
                    confirmText={`${label} aus der Gruppe entfernen?`}
                    confirmLabel="Ja, entfernen"
                    disabled={removeMember.isPending}
                    onConfirm={() => removeMember.mutate(m.userId)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <FormError message={errorText(setRole.error) ?? errorText(removeMember.error)} />
    </Card>
  );
}

const VALIDITY = [
  { value: 24, label: '24 Stunden' },
  { value: 168, label: '7 Tage' },
  { value: 720, label: '30 Tage' },
];
const USES = [
  { value: 1, label: '1×' },
  { value: 5, label: '5×' },
  { value: 20, label: '20×' },
  { value: null, label: 'Unbegrenzt' },
];

export function inviteLink(code: string): string {
  const url = new URL('gruppe/beitreten', new URL(import.meta.env.BASE_URL, window.location.origin));
  url.searchParams.set('code', code);
  return url.toString();
}

function Invites({ groupId }: { groupId: string }) {
  const { data: invites, error } = useInvites(groupId, true);
  const { createInvite, revokeInvite } = useGroupActions(groupId);
  const [validHours, setValidHours] = useState<number>(168);
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Einladungen</h2>
      <div className="grid gap-4">
        <Choice label="Gültig für" options={VALIDITY} value={validHours} onChange={setValidHours} />
        <Choice label="Nutzungen" options={USES} value={maxUses} onChange={setMaxUses} />
        <div>
          <Button disabled={createInvite.isPending} onClick={() => createInvite.mutate({ validHours, maxUses }, { onSuccess: setCreated })}>
            {createInvite.isPending ? 'Erzeugen …' : 'Einladungscode erzeugen'}
          </Button>
        </div>
        <FormError message={errorText(createInvite.error)} />
        {created && <NewInvite invite={created} />}
        {error ? (
          <FormError message={errorText(error)} />
        ) : invites && invites.length > 0 ? (
          <ul className="grid gap-2" aria-label="Bisherige Einladungen">
            {invites.map((inv) => {
              const status = inviteStatus(inv);
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3 text-sm">
                  <Badge tone={status === 'active' ? 'primary' : 'neutral'}>{INVITE_STATUS_LABEL[status]}</Badge>
                  <span className="text-muted">
                    {inv.useCount}
                    {inv.maxUses != null ? ` / ${inv.maxUses}` : ''} genutzt
                    {inv.expiresAt ? `, bis ${dateTime.format(new Date(inv.expiresAt))}` : ''}
                  </span>
                  {status === 'active' && (
                    <Button variant="secondary" className="ml-auto text-danger!" disabled={revokeInvite.isPending} onClick={() => revokeInvite.mutate(inv.id)}>
                      Widerrufen
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        <FormError message={errorText(revokeInvite.error)} />
      </div>
    </Card>
  );
}

function NewInvite({ invite }: { invite: CreatedInvite }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(invite.code);
  const canShare = typeof navigator.share === 'function';
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="grid gap-2 rounded-xl border border-primary/40 bg-sand-light/40 p-3">
      <p className="text-sm">Neuer Einladungscode. Er wird nur jetzt angezeigt:</p>
      <p className="select-all font-mono text-2xl font-semibold tracking-wider" aria-label="Einladungscode">
        {invite.code}
      </p>
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <Button onClick={() => navigator.share({ title: 'Einladung zur Jagdgruppe', text: `Einladungscode: ${invite.code}`, url: link }).catch(() => undefined)}>
            <Share2 aria-hidden className="size-4" /> Teilen
          </Button>
        )}
        <Button variant="secondary" onClick={copy}>
          <Copy aria-hidden className="size-4" /> Link kopieren
        </Button>
      </div>
      {copied && <FormSuccess>Link kopiert.</FormSuccess>}
    </div>
  );
}

function Settings({ group }: { group: HuntingGroup }) {
  const { update } = useGroupActions(group.id);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [adminsCanManage, setAdminsCanManage] = useState(group.adminsCanManageMembers);
  const [saved, setSaved] = useState(false);
  const errors = { name: V.groupName(name), description: V.maxLength(500)(description) };

  function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (errors.name || errors.description) return;
    update.mutate({ name, description, adminsCanManageMembers: adminsCanManage }, { onSuccess: () => setSaved(true) });
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Einstellungen</h2>
      <form noValidate onSubmit={submit} className="grid gap-4">
        <Field label="Name der Gruppe" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <TextArea label="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
        <Toggle
          label="Admins dürfen Mitglieder verwalten"
          description="Admins können dann einladen und Mitglieder entfernen."
          checked={adminsCanManage}
          onChange={setAdminsCanManage}
        />
        <FormError message={errorText(update.error)} />
        {saved && <FormSuccess>Gespeichert.</FormSuccess>}
        <div>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Speichern …' : 'Speichern'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Danger({ groupId, permissions }: { groupId: string; permissions: GroupPermissions }) {
  const { leave, remove } = useGroupActions(groupId);
  const navigate = useNavigate();
  const back = () => navigate({ to: '/gruppe' });
  return (
    <Card className="grid gap-3">
      <ConfirmButton
        label="Gruppe verlassen"
        confirmText="Willst du die Gruppe wirklich verlassen? Du brauchst danach einen neuen Einladungscode."
        confirmLabel="Ja, verlassen"
        disabled={leave.isPending}
        onConfirm={() => leave.mutate(undefined, { onSuccess: back })}
      />
      <FormError message={errorText(leave.error)} />
      {permissions.canDeleteGroup && (
        <>
          <ConfirmButton
            label="Gruppe löschen"
            confirmText="Die Gruppe mit allen Revieren, Jagden und Einladungen wird endgültig gelöscht. Das lässt sich nicht rückgängig machen."
            confirmLabel="Endgültig löschen"
            disabled={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: back })}
          />
          <FormError message={errorText(remove.error)} />
        </>
      )}
    </Card>
  );
}
