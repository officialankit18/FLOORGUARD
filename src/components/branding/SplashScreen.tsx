import React from 'react';

export const SplashScreen: React.FC = () => (
  <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center overflow-hidden bg-white px-8 text-center">
    <div className="relative flex max-w-sm flex-col items-center">
      <p className="animate-fg-logo-in text-4xl font-black tracking-[-0.06em] text-fg-ink">FLOOR<span className="text-red-600">GUARD</span></p>
      <p className="mt-3 text-base font-semibold text-fg-muted"><span className="inline-block overflow-hidden whitespace-nowrap border-r-2 border-fg-amber pr-1 animate-fg-type">One Step Can Save Your Home.</span></p>
      <div className="mt-8 h-1.5 w-32 overflow-hidden rounded-full bg-fg-yellowSoft"><div className="h-full w-1/2 animate-fg-loader rounded-full bg-fg-yellow" /></div>
    </div>
  </div>
);
