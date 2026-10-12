import * as React from 'react';
import { cn } from '../cn';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-sm bg-bg-sunken motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
