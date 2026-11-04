import { Badge } from '../../components/ui';
import { GROUP_ROLES, type GroupRole } from './groupModel';

export function RoleBadge({ role }: { role: GroupRole }) {
  return <Badge tone={role === 'owner' ? 'primary' : role === 'admin' ? 'signal' : 'neutral'}>{GROUP_ROLES[role].label}</Badge>;
}
