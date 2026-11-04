import { Link } from '@tanstack/react-router';
import { Card, Page } from '../components/ui';

export function NotFound() {
  return (
    <Page title="Nicht gefunden">
      <Card>
        <p className="text-sm text-muted">Diese Seite gibt es nicht.</p>
        <Link to="/" className="mt-3 inline-block text-sm font-medium text-primary underline">
          Zur Übersicht
        </Link>
      </Card>
    </Page>
  );
}
