'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadState } from '../lib/storage';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const state = loadState();
    if (state.placementDone) {
      router.replace('/dashboard');
    } else {
      router.replace('/onboarding');
    }
  }, [router]);

  return (
    <div className="wrap">
      <div className="loading">
        <div className="spinner"></div>
        <div>...</div>
      </div>
    </div>
  );
}
