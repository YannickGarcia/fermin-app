'use client';
import dynamic from 'next/dynamic';

// The calendar depends on today's date and on in-memory data, so it renders on the client only.
const CalendarScreen = dynamic(() => import('@/components/calendar/CalendarScreen'), {ssr: false});

export default function Page() {
  return <CalendarScreen />;
}
