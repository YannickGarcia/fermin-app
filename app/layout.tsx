import type {Metadata, Viewport} from 'next';
import './globals.css';
import {Providers} from './providers';
import {AppFrame} from '@/components/shell/AppFrame';

export const metadata: Metadata = {title: 'Fermín · Calendario', description: 'Gestión de academias de tenis'};
export const viewport: Viewport = {width: 'device-width', initialScale: 1};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}
