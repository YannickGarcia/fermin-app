'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {CalendarDays, Mic, Search, Settings, Users} from 'lucide-react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {setUI} from '@/lib/ui/state';
import {CommandBar} from '@/components/command/CommandBar';
import css from './shell.module.css';

function Mark() {
  // A ball seam: two arcs on a disc. Built from primitives on purpose.
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r="10" fill="var(--color-accent)" />
      <path d="M3.5 4.5a10 10 0 0 1 0 13M18.5 4.5a10 10 0 0 0 0 13" fill="none" stroke="var(--color-on-accent)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function AppFrame({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  return (
    <AppShell
      variant="surface"
      contentPadding={0}
      topNav={
        <TopNav
          label="Principal"
          heading={<TopNavHeading logo={<Mark />} heading="Fermín" headingHref="/" as={Link} />}
          startContent={
            <>
              <TopNavItem as={Link} href="/" label="Calendario" icon={<CalendarDays size={16} />} isSelected={pathname === '/'} />
              <TopNavItem as={Link} href="/alumnos" label="Alumnos" icon={<Users size={16} />} isSelected={pathname.startsWith('/alumnos')} />
              <TopNavItem as={Link} href="/ajustes" label="Ajustes" icon={<Settings size={16} />} isSelected={pathname.startsWith('/ajustes')} />
            </>
          }
          endContent={
            <button type="button" className={css.trigger} onClick={() => setUI({commandOpen: true})}>
              <Search size={16} aria-hidden />
              <span className={css.triggerText}>Busca o di qué cambiar</span>
              <Mic size={14} aria-hidden />
              <kbd className={css.kbd}>⌘K</kbd>
            </button>
          }
        />
      }>
      {children}
      <CommandBar />
    </AppShell>
  );
}
