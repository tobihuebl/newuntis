'use client';
import type { NavSection, Role } from '@sp/shared';
import { useShell } from './app-shell';
import { MoreContent } from './more-content';

/** "Mehr" als eigene Seite (/mehr), gleicher Inhalt wie das Mehr-Sheet. */
export function MoreScreen(props: {
  sections: NavSection[];
  views: { role: Role; label: string; home: string }[];
  view: Role | null;
  userName: string;
  roleLabel: string;
  schoolName: string;
}) {
  const { logout } = useShell();
  return <MoreContent {...props} onLogout={logout} />;
}
