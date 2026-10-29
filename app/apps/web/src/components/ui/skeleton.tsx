import React, { type HTMLAttributes } from 'react';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', ...props }) => {
  return (
    <div
      className={`animate-pulse bg-app-surface-subtle/80 rounded-md ${className}`}
      aria-hidden="true"
      {...props}
    />
  );
};
