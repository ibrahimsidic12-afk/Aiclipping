'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ClipEditorProps {
  videoId: string;
}

interface ClipSuggestion {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  hookText: string;
  viralityScore: number;
  tags: string[];
}

interface VideoData {
  id: string;
  originalName: string;
  status: string;
  url?: string;
  metadata?: { duration: number; width: number; height: number };
}

type EditorTab = 'clips' | 'captions' | 'export';

export function ClipEditor({ videoId }: ClipEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [clips, setClips] = useState<ClipSuggestion[]>([]);
  const [selectedClip, setSelectedClip] = useState<ClipSuggestion | null>(null);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [captionStyle, setCaptionStyle] = useState<string>('bold');
  const [platform, setPlatform] = useState<string>('tiktok');
  const [activeTab, setActiveTab] = useState<EditorTab>('clips');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [volume, setVolume] = useState(1);

  // Fetch video data and clips
  useEffect(() => {
    async function loadVideoData() {
      try {
        const res = await fetch(`/api/videos/${videoId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setVideoData(json.data.video);
            setClips(json.data.clips || []);
            if (json.data.video?.metadata?.duration) {
              setDuration(json.data.video.metadata.duration);
              setClipEnd(Math.min(30, json.data.video.metadata.duration));
            }
          }
        }
      } catch {
        // Video data not available yet
      } finally {
        setLoading(false);
      }
    }
    loadVideoData();
  }, [videoId]);

  // Sync video time with state
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      // Loop within clip bounds
      if (time >= clipEnd) {
        videoRef.current.currentTime = clipStart;
      }
    }
  }, [clipStart, clipEnd]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.currentTime = clipStart;
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, clipStart]);

  const selectClip = useCallback((clip: ClipSuggestion) => {
    setSelectedClip(clip);
    setClipStart(clip.startTime);
    setClipEnd(clip.endTime);
    if (videoRef.current) {
      videoRef.current.currentTime = clip.startTime;
    }
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      await fetch(`/api/videos/${videoId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: selectedClip?.id,
          startTime: clipStart,
          endTime: clipEnd,
          platform,
          captionStyle,
        }),
      });
    } catch {
      // Handle error
    } finally {
      setExporting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${ms}`;
  };

  const progressPercent = duration > 0
    ? ((currentTime - clipStart) / (clipEnd - clipStart)) * 100
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-57px)]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-surface-400 text-sm">Loading editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-57px)]">
      {/* Left: Video Preview */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-surface-950">
        {/* Video Container (9:16 aspect for short-form) */}
        <div className="relative w-full max-w-[360px] aspect-[9/16] bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-surface-800">
          {videoData?.url ? (
            <video
              ref={videoRef}
              src={videoData.url}
              className="absolute inset-0 w-full h-full object-cover"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onEnded={() => setIsPlaying(false)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-surface-900 to-black">
              <div className="text-center">
                <svg className="w-16 h-16 text-surface-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <p className="text-surface-500 text-sm">
                {videoData?.status === 'fetching'
                  ? 'Fetching from YouTube...'
                  : videoData?.status === 'processing' ? 'Processing video...' : 'Video Preview'}
                </p>
                <p className="text-surface-600 text-xs mt-1 font-mono">
                  {videoData?.originalName || videoId.slice(0, 8)}
                </p>
              </div>
            </div>
          )}

          {/* Caption Preview Overlay */}
          <div className="absolute bottom-8 left-4 right-4 text-center pointer-events-none">
            <p className={`text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
              captionStyle === 'bold' ? 'text-lg font-black' :
              captionStyle === 'minimal' ? 'text-sm font-medium' :
              captionStyle === 'karaoke' ? 'text-lg font-bold' :
              'text-lg font-black bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent'
            }`}>
              {selectedClip?.hookText || 'AI-generated captions appear here'}
            </p>
          </div>

          {/* Play/Pause Overlay */}
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors group"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {!isPlaying && (
              <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                </svg>
              </div>
            )}
          </button>
        </div>

        {/* Playback Controls */}
        <div className="w-full max-w-[360px] mt-4 space-y-3">
          {/* Progress Bar */}
          <div className="relative h-1.5 bg-surface-800 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-brand-500 rounded-full transition-all duration-100"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>

          {/* Time & Controls */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-surface-400 font-mono">
              {formatTime(currentTime)}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="w-8 h-8 rounded-full bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-colors"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                  </svg>
                )}
              </button>
              {/* Volume */}
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (videoRef.current) videoRef.current.volume = v;
                }}
                className="w-16 h-1 accent-brand-500"
                aria-label="Volume"
              />
            </div>
            <span className="text-xs text-surface-400 font-mono">
              {formatTime(clipEnd - clipStart)}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Controls Panel */}
      <div className="w-full lg:w-[420px] border-l border-surface-800 bg-surface-900/50 flex flex-col">
        {/* Tab Navigation */}
        <div className="flex border-b border-surface-800">
          {([
            { id: 'clips' as const, label: 'Clips', icon: 'M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z' },
            { id: 'captions' as const, label: 'Captions', icon: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z' },
            { id: 'export' as const, label: 'Export', icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5' },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-brand-400 border-b-2 border-brand-500 -mb-px'
                  : 'text-surface-400 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'clips' && (
            <>
              {/* Platform Selector */}
              <section>
                <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-3">Platform</h3>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'tiktok', label: 'TikTok', ratio: '9:16' },
                    { id: 'reels', label: 'Reels', ratio: '9:16' },
                    { id: 'shorts', label: 'Shorts', ratio: '9:16' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPlatform(p.id)}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        platform === p.id
                          ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20'
                          : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
                      }`}
                    >
                      <div>{p.label}</div>
                      <div className="text-[10px] opacity-60 mt-0.5">{p.ratio}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Clip Range */}
              <section>
                <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-3">Clip Range</h3>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-surface-400 block mb-1">Start</label>
                      <input
                        type="number"
                        value={clipStart}
                        onChange={(e) => setClipStart(Math.max(0, Number(e.target.value)))}
                        min={0}
                        max={clipEnd - 1}
                        step={0.1}
                        className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-surface-400 block mb-1">End</label>
                      <input
                        type="number"
                        value={clipEnd}
                        onChange={(e) => setClipEnd(Math.min(duration || 9999, Number(e.target.value)))}
                        min={clipStart + 1}
                        max={duration || undefined}
                        step={0.1}
                        className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-surface-400">
                    <span>Duration: {(clipEnd - clipStart).toFixed(1)}s</span>
                    {(clipEnd - clipStart) > 60 && (
                      <span className="text-yellow-400">⚠ Over 60s</span>
                    )}
                  </div>
                </div>
              </section>

              {/* AI Clip Suggestions */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider">
                    AI Suggestions
                  </h3>
                  {clips.length > 0 && (
                    <span className="text-xs text-surface-500">{clips.length} found</span>
                  )}
                </div>
                {clips.length > 0 ? (
                  <div className="space-y-2">
                    {clips.map((clip) => (
                      <button
                        key={clip.id}
                        onClick={() => selectClip(clip)}
                        className={`w-full p-3 rounded-xl border text-left transition-all group ${
                          selectedClip?.id === clip.id
                            ? 'border-brand-500 bg-brand-500/10'
                            : 'border-surface-700 bg-surface-800/50 hover:border-brand-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-mono text-surface-400">
                            {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                          </span>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            clip.viralityScore >= 90 ? 'bg-green-500/20 text-green-400' :
                            clip.viralityScore >= 75 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-surface-700 text-surface-300'
                          }`}>
                            {clip.viralityScore}%
                          </span>
                        </div>
                        <p className="text-sm text-white group-hover:text-brand-300 transition-colors line-clamp-2">
                          &ldquo;{clip.hookText}&rdquo;
                        </p>
                        {clip.tags.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {clip.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-surface-700 text-surface-400">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-surface-800/50 border border-surface-700 text-center">
                    <p className="text-surface-400 text-sm">
                      {videoData?.status === 'fetching'
                        ? 'Fetching video from YouTube...'
                        : videoData?.status === 'processing' || videoData?.status === 'transcribing'
                        ? 'AI is analyzing your video...'
                        : videoData?.status === 'analyzing'
                        ? 'Detecting highlights...'
                        : 'No clips detected yet'}
                    </p>
                    {(videoData?.status === 'fetching' || videoData?.status === 'processing' || videoData?.status === 'transcribing' || videoData?.status === 'analyzing') && (
                      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mt-3" />
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === 'captions' && (
            <>
              {/* Caption Style */}
              <section>
                <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-3">Caption Style</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'bold', label: 'Bold', preview: 'Aa', desc: 'Large, impactful' },
                    { id: 'karaoke', label: 'Karaoke', preview: 'Aa', desc: 'Word-by-word' },
                    { id: 'minimal', label: 'Minimal', preview: 'Aa', desc: 'Clean, subtle' },
                    { id: 'gradient', label: 'Gradient', preview: 'Aa', desc: 'Colorful pop' },
                  ].map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setCaptionStyle(style.id)}
                      className={`p-3 rounded-xl border transition-all ${
                        captionStyle === style.id
                          ? 'border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/10'
                          : 'border-surface-700 bg-surface-800 hover:border-surface-600'
                      }`}
                    >
                      <div className={`text-2xl font-black mb-1 ${
                        captionStyle === style.id ? 'text-brand-400' : 'text-white'
                      }`}>
                        {style.preview}
                      </div>
                      <div className="text-xs text-surface-300 font-medium">{style.label}</div>
                      <div className="text-[10px] text-surface-500 mt-0.5">{style.desc}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Caption Position */}
              <section>
                <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-3">Position</h3>
                <div className="grid grid-cols-3 gap-2">
                  {['top', 'center', 'bottom'].map((pos) => (
                    <button
                      key={pos}
                      className="px-3 py-2 rounded-lg text-sm bg-surface-800 text-surface-300 hover:bg-surface-700 border border-surface-700 capitalize transition-colors"
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </section>

              {/* Caption Preview */}
              <section>
                <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-3">Preview</h3>
                <div className="p-4 rounded-xl bg-black border border-surface-800 min-h-[80px] flex items-center justify-center">
                  <p className={`text-center ${
                    captionStyle === 'bold' ? 'text-white text-lg font-black' :
                    captionStyle === 'minimal' ? 'text-white/80 text-sm font-medium' :
                    captionStyle === 'karaoke' ? 'text-white text-lg font-bold' :
                    'text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-purple-400 text-lg font-black'
                  }`}>
                    This is how your captions look
                  </p>
                </div>
              </section>
            </>
          )}

          {activeTab === 'export' && (
            <>
              {/* Export Settings */}
              <section>
                <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-3">Export Settings</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-surface-400 block mb-1">Quality</label>
                    <select className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="high">High (1080p)</option>
                      <option value="medium">Medium (720p)</option>
                      <option value="low">Low (480p)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-surface-400 block mb-1">Format</label>
                    <select className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="mp4">MP4 (H.264)</option>
                      <option value="webm">WebM (VP9)</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Export Summary */}
              <section>
                <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-3">Summary</h3>
                <div className="p-4 rounded-xl bg-surface-800/50 border border-surface-700 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-400">Platform</span>
                    <span className="text-white capitalize">{platform}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-400">Duration</span>
                    <span className="text-white">{(clipEnd - clipStart).toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-400">Captions</span>
                    <span className="text-white capitalize">{captionStyle}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-400">Aspect Ratio</span>
                    <span className="text-white">9:16</span>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Bottom Action */}
        <div className="p-4 border-t border-surface-800">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-surface-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors shadow-lg shadow-brand-600/20 flex items-center justify-center gap-2"
          >
            {exporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Export Clip
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
