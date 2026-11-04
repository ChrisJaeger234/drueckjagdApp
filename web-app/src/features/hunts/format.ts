const dayTime = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const shortDayTime = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** „Sa., 15.11.2026, 08:30 – 14:00 Uhr“ */
export function formatHuntTime(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  if (!endsAt) return `${dayTime.format(start)} Uhr`;
  const end = new Date(endsAt);
  const sameDay = start.toDateString() === end.toDateString();
  return `${dayTime.format(start)} – ${sameDay ? time.format(end) : dayTime.format(end)} Uhr`;
}

export const formatReportTime = (iso: string) => shortDayTime.format(new Date(iso));

/** ISO-Zeitpunkt → Wert für <input type="datetime-local"> in Ortszeit. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
