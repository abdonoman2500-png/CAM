import { useState } from 'react';
import type { PresenceStatus } from '../types/crosscall';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  presence?: PresenceStatus;
}

const sizeClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
};

export function Avatar({ name, src, size = 'md', presence }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'CC';

  const presenceColor =
    presence === 'online'
      ? 'bg-emerald-500'
      : presence === 'busy'
        ? 'bg-amber-500'
        : 'bg-slate-400 dark:bg-slate-600';

  return (
    <div className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 font-semibold select-none ${sizeClasses[size]}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
      {presence && (
        <span
          title={presence}
          aria-label={`Status: ${presence}`}
          className={`absolute bottom-0 end-0 h-3 w-3 rounded-full ring-2 ring-white dark:ring-[#111827] ${presenceColor}`}
        />
      )}
    </div>
  );
}
