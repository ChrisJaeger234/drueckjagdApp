import { Link } from '@tanstack/react-router';
import { ChevronRight, KeyRound, Plus, Users } from 'lucide-react';
import { Card, Page } from '../../components/ui';
import { FormError } from '../../components/form';
import { mapError } from '../../lib/errors';
import { RoleBadge } from './RoleBadge';
import { useMyGroups } from './useGroups';

const actionLink = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium';

export function GroupsPage() {
  const { data: groups, isPending, error } = useMyGroups();
  return (
    <Page title="Gruppe">
      <div className="grid grid-cols-2 gap-2">
        <Link to="/gruppe/beitreten" className={`${actionLink} border-primary bg-primary text-on-primary`}>
          <KeyRound aria-hidden className="size-4" /> Mit Code beitreten
        </Link>
        <Link to="/gruppe/neu" className={`${actionLink} border-line bg-surface`}>
          <Plus aria-hidden className="size-4" /> Gruppe erstellen
        </Link>
      </div>
      {isPending ? (
        <Card>
          <p className="text-sm text-muted">Gruppen werden geladen …</p>
        </Card>
      ) : error ? (
        <FormError message={mapError(error).message} />
      ) : groups.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-8 text-center">
          <Users aria-hidden className="size-10 text-moss" />
          <h2 className="font-semibold">Noch in keiner Gruppe</h2>
          <p className="max-w-sm text-sm text-muted">
            Tritt mit dem Einladungscode deiner Jagdleitung bei oder erstelle selbst eine Gruppe für dein Revier.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-2" aria-label="Meine Gruppen">
          {groups.map(({ group, role }) => (
            <li key={group.id}>
              <Link
                to="/gruppe/$groupId"
                params={{ groupId: group.id }}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{group.name}</span>
                    <RoleBadge role={role} />
                  </div>
                  {group.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{group.description}</p>}
                </div>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
