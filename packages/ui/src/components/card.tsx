import * as React from 'react';
import { cn } from '../cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-md border border-line bg-bg-raised p-4', className)} {...props} />
  );
}
