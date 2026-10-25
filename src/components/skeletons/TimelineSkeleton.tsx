import React from 'react';

export const TimelineSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Search & Filter Tabs Skeleton */}
      <div className="flex items-center justify-between gap-2">
        <div className="h-10 bg-slate-800/80 rounded-2xl flex-1 max-w-xs" />
        <div className="h-10 w-24 bg-slate-800/80 rounded-2xl" />
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <div className="h-8 w-24 bg-slate-800/80 rounded-xl shrink-0" />
        <div className="h-8 w-20 bg-slate-800/60 rounded-xl shrink-0" />
        <div className="h-8 w-24 bg-slate-800/60 rounded-xl shrink-0" />
        <div className="h-8 w-20 bg-slate-800/60 rounded-xl shrink-0" />
      </div>

      {/* Reminder Cards Skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/60 flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-800 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="h-4 bg-slate-800 rounded w-2/3" />
                <div className="h-4 bg-slate-800 rounded w-16" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 bg-slate-800/70 rounded w-24" />
                <div className="h-3 bg-slate-800/70 rounded w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
