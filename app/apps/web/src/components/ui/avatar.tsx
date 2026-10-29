import React, { type HTMLAttributes } from 'react';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  readonly name?: string;
  readonly size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-8 h-8 text-xs',
  lg: 'w-10 h-10 text-sm',
};

function getInitials(name?: string): string {
  if (!name) return 'PS';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]?.slice(0, 2).toUpperCase() ?? 'PS';
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

export const Avatar: React.FC<AvatarProps> = ({ name, size = 'md', className = '', ...props }) => {
  const initials = getInitials(name);

  return (
    <div
      aria-label={name ? `Avatar for ${name}` : 'User avatar'}
      className={`rounded-full bg-[#EAD9BD] text-[#5F4A2C] font-semibold flex items-center justify-center select-none shadow-subtle shrink-0 border border-[#D5BF9F] ${sizeMap[size]} ${className}`}
      {...props}
    >
      <span>{initials}</span>
    </div>
  );
};
