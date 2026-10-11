'use client';
import {Theme} from '@astryxdesign/core';
import {themes, defaultThemeSlug} from '@/astryx-themes';

export function Providers({children}: {children: React.ReactNode}) {
  return <Theme theme={themes[defaultThemeSlug]}>{children}</Theme>;
}
