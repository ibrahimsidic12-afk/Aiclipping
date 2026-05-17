'use client';

import { useState, useCallback } from 'react';

type Platform = 'tiktok' | 'reels' | 'shorts' | 'all';
type ClipStyle = 'viral' | 'highlights' | 'educational' | 'funny';
type CaptionStyle = 'bold' | 'minimal' | 'karaoke' | 'outline';

interface ClipSettings {
  platform: Platform;
  maxClips: number;
  minDuration: number;
  maxDuration: number;
  style: ClipStyle;
  autoCaptions: boolean;
  captionStyle: CaptionStyle;
}

type ImportStatus = 'idle' | 'validating' | 'importing' | 'processing' | 'done' | 'error';

interface VideoInfo {
  title: string;
  duration: number;
  thumbnailUrl: string;
  channelName: string;
}

export function YouTubeImport() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ClipSettings>({
    platform: 'all',
    maxClips: 5,
    minDuration: 15,
    maxDuration: 60,
    style: 'viral',
    autoCaptions: true,
    captionStyle: 'bold',
  });

  const isValidYouTubeUrl = useCallback((input: string): boolean => {
    const patterns = [
      /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
      /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/,
      /^(https?:\/\/)?youtu\.be\/[\w-]+/,
      /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]+/,
    ];
    return patterns.some((p) => p.test(input.trim()));
  }, []);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    setError('');
    setVideoInfo(null);
    setStatus('idle');
  };

  const handleValidate = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    if (!isValidYouTubeUrl(url)) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    setStatus('validating');
    setError('');

    try {
      const response = await fetch('/api/youtube/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || 'Failed to validate video');
      }

      const { data } = await response.json();
      setVideoInfo(data);
      setStatus('idle');
      setShowSettings(true);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch video info');
      setStatus('error');
    }
  };

  const handleImport = async () => {
    if (!videoInfo) return;

    setStatus('importing');
    setProgress(0);
    setProgressText('Starting download...');
    setError('');

    try {
      const response = await fetch('/api/youtube/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          settings,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || 'Failed to start import');
      }

      const { data } = await response.json();
      const importId = data.importId;

      // Poll for progress
      setStatus('processing');
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/youtube/status/${importId}`);
          if (!statusRes.ok) {
            clearInterval(pollInterval);
            throw new Error('Failed to check status');
          }

          const { data: statusData } = await statusRes.json();

          setProgress(statusData.progress);
          setProgressText(statusData.message);

          if (statusData.status === 'completed') {
            clearInterval(pollInterval);
            setStatus('done');
            // Redirect to editor with first clip
            if (statusData.videoId) {
              window.location.href = `/editor/${statusData.videoId}`;
            }
          } else if (statusData.status === 'error') {
            clearInterval(pollInterval);
            setError(statusData.error || 'Processing failed');
            setStatus('error');
          }
        } catch {
          clearInterval(pollInterval);
          setError('Lost connection while processing');
          setStatus('error');
        }
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Import failed');
      setStatus('error');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const platforms: { value: Platform; label: string; icon: string }[] = [
    { value: 'tiktok', label: 'TikTok', icon: '♪' },
    { value: 'reels', label: 'Reels', icon: '◎' },
    { value: 'shorts', label: 'Shorts', icon: '▶' },
    { value: 'all', label: 'All', icon: '✦' },
  ];

  const styles: { value: ClipStyle; label: string; desc: string }[] = [
    { value: 'viral', label: 'Viral Moments', desc: 'High-energy, shareable clips' },
    { value: 'highlights', label: 'Highlights', desc: 'Key points & best moments' },
    { value: 'educational', label: 'Educational', desc: 'Informative takeaways' },
    { value: 'funny', label: 'Funny', desc: 'Comedy & entertaining bits' },
  ];

  return (
    <div className="w-full">
      {/* URL Input */}
      <div className="relative">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <svg className="w-5 h-5 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.07-9.07a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
            </div>
            <input
              type="url"
              value={url}
              onChange={handleUrlChange}
              placeholder="Paste YouTube URL here..."
              disabled={status === 'importing' || status === 'processing'}
              className="w-full pl-12 pr-4 py-4 bg-surface-900/50 border border-surface-700 rounded-xl text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 transition-all disabled:opacity-50"
            />
          </div>
          <button
            onClick={handleValidate}
            disabled={!url.trim() || status === 'validating' || status === 'importing' || status === 'processing'}
            className="px-6 py-4 bg-red-600 hover:bg-red-700 disabled:bg-surface-700 disabled:text-surface-500 text-white font-medium rounded-xl transition-colors flex items-center gap-2"
          >
            {status === 'validating' ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            )}
            <span className="hidden sm:inline">
              {status === 'validating' ? 'Checking...' : 'Fetch'}
            </span>
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="mt-3 text-sm text-red-400 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </p>
        )}
      </div>

      {/* Video Preview Card */}
      {videoInfo && (
        <div className="mt-6 p-4 rounded-2xl bg-surface-900/50 border border-surface-800 animate-fade-in">
          <div className="flex gap-4">
            <div className="w-40 h-24 rounded-xl bg-surface-800 overflow-hidden flex-shrink-0">
              {videoInfo.thumbnailUrl && (
                <img
                  src={videoInfo.thumbnailUrl}
                  alt={videoInfo.title}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-medium truncate">{videoInfo.title}</h3>
              <p className="text-surface-400 text-sm mt-1">{videoInfo.channelName}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-surface-500 text-xs flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatDuration(videoInfo.duration)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clip Settings */}
      {showSettings && videoInfo && status !== 'importing' && status !== 'processing' && status !== 'done' && (
        <div className="mt-6 space-y-6 animate-slide-up">
          {/* Platform Selection */}
          <div>
            <label className="text-sm font-medium text-surface-300 mb-3 block">Target Platform</label>
            <div className="grid grid-cols-4 gap-2">
              {platforms.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setSettings((s) => ({ ...s, platform: p.value }))}
                  className={`py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    settings.platform === p.value
                      ? 'bg-brand-600 text-white border border-brand-500'
                      : 'bg-surface-800/50 text-surface-400 border border-surface-700 hover:border-surface-600'
                  }`}
                >
                  <span className="text-lg block mb-1">{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clip Style */}
          <div>
            <label className="text-sm font-medium text-surface-300 mb-3 block">Clip Style</label>
            <div className="grid grid-cols-2 gap-2">
              {styles.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSettings((prev) => ({ ...prev, style: s.value }))}
                  className={`p-3 rounded-xl text-left transition-all ${
                    settings.style === s.value
                      ? 'bg-brand-600/20 border border-brand-500/50'
                      : 'bg-surface-800/50 border border-surface-700 hover:border-surface-600'
                  }`}
                >
                  <span className={`text-sm font-medium ${settings.style === s.value ? 'text-brand-300' : 'text-white'}`}>
                    {s.label}
                  </span>
                  <p className="text-xs text-surface-500 mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Clips count & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-surface-300 mb-2 block">Max Clips</label>
              <select
                value={settings.maxClips}
                onChange={(e) => setSettings((s) => ({ ...s, maxClips: Number(e.target.value) }))}
                className="w-full py-3 px-4 bg-surface-800/50 border border-surface-700 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500"
              >
                {[3, 5, 8, 10, 15].map((n) => (
                  <option key={n} value={n}>{n} clips</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-surface-300 mb-2 block">Clip Duration</label>
              <select
                value={settings.maxDuration}
                onChange={(e) => setSettings((s) => ({ ...s, maxDuration: Number(e.target.value) }))}
                className="w-full py-3 px-4 bg-surface-800/50 border border-surface-700 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500"
              >
                <option value={30}>15-30s</option>
                <option value={60}>15-60s</option>
                <option value={90}>30-90s</option>
              </select>
            </div>
          </div>

          {/* Auto Captions Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-surface-800/50 border border-surface-700">
            <div>
              <span className="text-white text-sm font-medium">Auto Captions</span>
              <p className="text-surface-500 text-xs mt-0.5">Add animated captions to all clips</p>
            </div>
            <button
              onClick={() => setSettings((s) => ({ ...s, autoCaptions: !s.autoCaptions }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.autoCaptions ? 'bg-brand-600' : 'bg-surface-700'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.autoCaptions ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleImport}
            className="w-full py-4 bg-gradient-to-r from-red-600 to-brand-600 hover:from-red-700 hover:to-brand-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            Auto-Clip This Video
          </button>
        </div>
      )}

      {/* Processing Progress */}
      {(status === 'importing' || status === 'processing') && (
        <div className="mt-6 p-6 rounded-2xl bg-surface-900/50 border border-surface-800 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium">Processing your video</p>
              <p className="text-surface-400 text-sm">{progressText}</p>
            </div>
          </div>
          <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-brand-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-right text-surface-500 text-xs mt-2">{progress}%</p>
        </div>
      )}

      {/* Done */}
      {status === 'done' && (
        <div className="mt-6 p-6 rounded-2xl bg-green-500/10 border border-green-500/30 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-green-300 font-medium">Clips generated successfully!</p>
              <p className="text-green-400/70 text-sm">Redirecting to editor...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
