'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Video } from '@clip-ai/types';

export function VideoList() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch('/api/videos');
      if (!res.ok) throw new Error('Failed to fetch videos');
      const json = await res.json();
      setVideos(json.data?.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load videos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Poll for updates when videos are processing
  useEffect(() => {
    const hasProcessing = videos.some(v =>
      ['fetching', 'processing', 'transcribing', 'analyzing', 'uploading'].includes(v.status)
    );
    if (!hasProcessing) return;

    const interval = setInterval(fetchVideos, 5000);
    return () => clearInterval(interval);
  }, [videos, fetchVideos]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 rounded-xl bg-surface-900/50 border border-surface-800 animate-pulse">
            <div className="aspect-video rounded-lg bg-surface-800 mb-3" />
            <div className="h-4 bg-surface-800 rounded w-3/4 mb-2" />
            <div className="h-3 bg-surface-800 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={() => { setLoading(true); fetchVideos(); }}
          className="mt-2 text-xs text-red-300 hover:text-white transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="p-12 rounded-xl bg-surface-900/50 border border-dashed border-surface-700 text-center">
        <svg className="w-12 h-12 text-surface-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <p className="text-surface-300 font-medium">No videos yet</p>
        <p className="text-surface-500 text-sm mt-1">Upload your first video to get started with AI clipping.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}

function VideoCard({ video }: { video: Video }) {
  const defaultStatus = { color: 'bg-surface-500/10 text-surface-400', label: 'Uploaded', animate: false };
  const statusConfig: Record<string, { color: string; label: string; animate: boolean }> = {
    ready: { color: 'bg-green-500/10 text-green-400', label: 'Ready', animate: false },
    fetching: { color: 'bg-cyan-500/10 text-cyan-400', label: 'Fetching', animate: true },
    processing: { color: 'bg-yellow-500/10 text-yellow-400', label: 'Processing', animate: true },
    transcribing: { color: 'bg-blue-500/10 text-blue-400', label: 'Transcribing', animate: true },
    analyzing: { color: 'bg-purple-500/10 text-purple-400', label: 'Analyzing', animate: true },
    error: { color: 'bg-red-500/10 text-red-400', label: 'Error', animate: false },
    uploaded: { color: 'bg-surface-500/10 text-surface-400', label: 'Uploaded', animate: false },
    uploading: { color: 'bg-surface-500/10 text-surface-400', label: 'Uploading', animate: true },
  };

  const status = statusConfig[video.status] ?? defaultStatus;

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <a
      href={`/editor/${video.id}`}
      className="group p-4 rounded-xl bg-surface-900/50 border border-surface-800 hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5 transition-all duration-200"
    >
      {/* Thumbnail */}
      <div className="aspect-video rounded-lg bg-surface-800 mb-3 overflow-hidden relative">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.originalName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-800 to-surface-900">
            <svg className="w-10 h-10 text-surface-600 group-hover:text-brand-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
          </div>
        )}
        {video.metadata && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 backdrop-blur-sm rounded text-xs text-white font-mono">
            {formatDuration(video.metadata.duration)}
          </div>
        )}
        {status.animate && (
          <div className="absolute top-2 left-2">
            <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-medium truncate group-hover:text-brand-300 transition-colors">
            {video.originalName}
          </p>
          <p className="text-surface-500 text-xs mt-1">
            {formatDate(video.createdAt)}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1 ${status.color}`}>
          {status.animate && (
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          )}
          {status.label}
        </span>
      </div>

      {/* Tags */}
      {video.tags.length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {video.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-md bg-surface-800 text-surface-400 text-xs">
              {tag}
            </span>
          ))}
          {video.tags.length > 3 && (
            <span className="px-2 py-0.5 rounded-md bg-surface-800 text-surface-500 text-xs">
              +{video.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </a>
  );
}
