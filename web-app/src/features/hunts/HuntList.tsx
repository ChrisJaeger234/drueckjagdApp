import { Link } from '@tanstack/react-router';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { Badge } from '../../components/ui';
import { formatHuntTime } from './format';
import { HUNT_STATUS, type Hunt } from './huntModel';

export function StatusBadge({ hunt }: { hunt: Hunt }) {
  return <Badge tone={hunt.status === 'laufend' ? 'signal' : hunt.status === 'geplant' ? 'primary' : 'neutral'}>{HUNT_STATUS[hunt.status]}</Badge>;
}

export function HuntList({ hunts, showGroup = false, label }: { hunts: Hunt[]; showGroup?: boolean; label: string }) {
  return (
    <ul className="grid gap-1" aria-label={label}>
      {hunts.map((h) => (
        <li key={h.id}>
          <Link to="/jagd/$huntId" params={{ huntId: h.id }} className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-1 hover:bg-sand-light/40">
            <CalendarDays aria-hidden className="size-5 shrink-0 text-moss" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{h.title}</span>
                <StatusBadge hunt={h} />
              </div>
              <div className="truncate text-sm text-muted">
                {formatHuntTime(h.startsAt, h.endsAt)}
                {showGroup && h.groupName ? ` · ${h.groupName}` : h.revierName ? ` · ${h.revierName}` : ''}
              </div>
            </div>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
