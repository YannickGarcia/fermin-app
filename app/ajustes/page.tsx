'use client';
import dynamic from 'next/dynamic';

const SettingsScreen = dynamic(() => import('@/components/settings/SettingsScreen'), {ssr: false});

export default function Page() {
  return <SettingsScreen />;
}
