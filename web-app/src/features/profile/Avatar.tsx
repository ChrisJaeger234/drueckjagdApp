import { useAvatarUrl } from './useProfile';

export function Avatar({ path, name, size = 64 }: { path: string | null; name: string; size?: number }) {
  const { data: url } = useAvatarUrl(path);
  const initials = name
    .replace(/^@/, '')
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return url ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-forest-mid font-semibold text-white"
      style={{ width: size, height: size, fontSize: size / 2.6 }}
    >
      {initials || '?'}
    </span>
  );
}
