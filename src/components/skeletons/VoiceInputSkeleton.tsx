import React from 'react';

export const VoiceInputSkeleton: React.FC = () => {
  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/80 border border-slate-800/80 shadow-lg animate-pulse space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-4 w-40 bg-slate-800 rounded-lg" />
        <div className="h-4 w-20 bg-slate-800 rounded-lg" />
      </div>
      <div className="h-14 bg-slate-950/70 rounded-2xl border border-slate-800/60" />
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="h-8 w-28 bg-slate-800 rounded-xl" />
        <div className="h-8 w-32 bg-slate-800 rounded-xl" />
      </div>
    </div>
  );
};
