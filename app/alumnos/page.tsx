'use client';
import dynamic from 'next/dynamic';

const StudentsScreen = dynamic(() => import('@/components/students/StudentsScreen'), {ssr: false});

export default function Page() {
  return <StudentsScreen />;
}
