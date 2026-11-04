import { Link } from '@tanstack/react-router';
import { ChevronRight, MessagesSquare } from 'lucide-react';
import { Card, Page } from '../../components/ui';
import { FormError } from '../../components/form';
import { mapError } from '../../lib/errors';
import { useMyGroups } from '../groups/useGroups';

/** Ein Chat je Gruppe. */
export function ChatPage() {
  const { data: groups, isPending, error } = useMyGroups();
  return (
    <Page title="Chat">
      {isPending ? (
        <Card>
          <p className="text-sm text-muted">Gruppen werden geladen …</p>
        </Card>
      ) : error ? (
        <FormError message={mapError(error).message} />
      ) : groups.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-8 text-center">
          <MessagesSquare aria-hidden className="size-10 text-moss" />
          <h2 className="font-semibold">Noch kein Chat</h2>
          <p className="max-w-sm text-sm text-muted">
            Jede Gruppe hat einen eigenen Chat. Tritt einer{' '}
            <Link to="/gruppe" className="font-medium text-primary">
              Gruppe
            </Link>{' '}
            bei oder erstelle eine.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-2" aria-label="Chats">
          {groups.map(({ group }) => (
            <li key={group.id}>
              <Link to="/chat/$groupId" params={{ groupId: group.id }} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4">
                <MessagesSquare aria-hidden className="size-5 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
                <ChevronRight aria-hidden className="size-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
