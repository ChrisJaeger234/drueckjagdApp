import { MessagesSquare } from 'lucide-react';
import { ComingSoon, Page } from '../../components/ui';

export function ChatPage() {
  return (
    <Page title="Chat">
      <ComingSoon icon={MessagesSquare} title="Gruppenchat" text="Nachrichten in Echtzeit, auch offline schreibbar, mit Push-Benachrichtigung." phase="Phase 9" />
    </Page>
  );
}
