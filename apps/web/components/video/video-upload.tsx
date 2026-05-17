'use client';

import { useState, useCallback } from 'react';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
];

type SourceTab = 'file' | 'url';
type UploadState = 'idle' | 'selected' | 'uploading' | 'processing' | 'error';

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export function VideoUpload() {
  const [tab, setTab] = useState<SourceTab>('file');

  return (
    <div className="w-full">
      <div role="tablist" aria-label="Source" className="mb-4 inline-flex rounded-xl bg-surface-900/60 p-1 border border-surface-800">
        <TabButton active={tab === 'file'} onClick={() => setTab('file')}>
          Upload File
        </TabButton>
        <TabButton active={tab === 'url'} onClick={() => setTab('url')}>
          Paste YouTube URL
        </TabButton>
      </div>

      {tab === 'file' ? <FileUploadPanel /> : <YoutubeUrlPanel />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-surface-800 text-white shadow-sm'
          : 'text-surface-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────
// File upload (existing flow)
// ─────────────────────────────────────────────────────

function FileUploadPanel() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (f: File): string | null => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return `Unsupported format: ${f.type || 'unknown'}. Use MP4, MOV, AVI, MKV, or WebM.`;
    }
    if (f.size > MAX_FILE_SIZE) {
      return `File too large (${formatSize(f.size)}). Maximum is 500MB.`;
    }
    return null;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (!dropped) return;

    const validationError = validateFile(dropped);
    if (validationError) {
      setError(validationError);
      setState('error');
      return;
    }
    setFile(dropped);
    setState('selected');
    setError(null);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const validationError = validateFile(selected);
    if (validationError) {
      setError(validationError);
      setState('error');
      return;
    }
    setFile(selected);
    setState('selected');
    setError(null);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setState('uploading');
    setProgress(0);
    setError(null);

    try {
      // 1. Get presigned upload URL
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error?.message || 'Failed to get upload URL');
      }

      const { data } = await response.json();
      const { uploadUrl, videoId } = data;

      // 2. Upload to S3 with progress tracking
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 90));
        }
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.ontimeout = () => reject(new Error('Upload timed out'));
        xhr.timeout = 600000;
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      setProgress(92);
      setState('processing');

      // 3. Confirm upload landed in S3 and flip status to "uploaded"
      const completeRes = await fetch(`/api/videos/${videoId}/upload-complete`, {
        method: 'POST',
      });
      if (!completeRes.ok) {
        const errData = await completeRes.json().catch(() => null);
        throw new Error(errData?.error?.message || 'Failed to confirm upload');
      }

      // 4. Trigger AI pipeline
      const processRes = await fetch(`/api/videos/${videoId}/process`, { method: 'POST' });
      if (!processRes.ok) {
        const errData = await processRes.json().catch(() => null);
        throw new Error(errData?.error?.message || 'Failed to start processing');
      }

      setProgress(100);
      window.location.href = `/editor/${videoId}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setState('error');
      setProgress(0);
    }
  };

  const reset = () => {
    setFile(null);
    setState('idle');
    setProgress(0);
    setError(null);
  };

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={reset} />}

      {state === 'idle' || state === 'error' ? (
        <label
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-brand-500 bg-brand-500/5 scale-[1.01]'
              : 'border-surface-700 hover:border-surface-500 bg-surface-900/50 hover:bg-surface-900/80'
          }`}
        >
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
              isDragging ? 'bg-brand-500/20' : 'bg-brand-500/10'
            }`}>
              <svg className="w-7 h-7 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white font-medium">
                {isDragging ? 'Drop your video here' : 'Drop your video here or click to browse'}
              </p>
              <p className="text-surface-400 text-sm mt-1">MP4, MOV, AVI, MKV, WebM up to 500MB</p>
            </div>
          </div>
        </label>
      ) : (
        <div className="p-6 rounded-2xl bg-surface-900/50 border border-surface-800">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{file?.name}</p>
              <p className="text-surface-400 text-sm">{file ? formatSize(file.size) : ''}</p>
            </div>
            {state === 'selected' && (
              <button
                onClick={reset}
                className="text-surface-400 hover:text-white transition-colors p-1"
                aria-label="Remove file"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {state === 'uploading' || state === 'processing' ? (
            <ProgressBar progress={progress} state={state} />
          ) : (
            <button
              onClick={handleUpload}
              className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-brand-600/20 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              Upload & Process with AI
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// YouTube URL panel
// ─────────────────────────────────────────────────────

const YOUTUBE_REGEX =
  /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;

function YoutubeUrlPanel() {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = YOUTUBE_REGEX.test(url.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setError('Please paste a valid YouTube video URL.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/videos/from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message || 'Failed to start fetch');
      }

      window.location.href = `/editor/${json.data.videoId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start fetch');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="p-6 rounded-2xl bg-surface-900/50 border border-surface-800">
        <label htmlFor="yt-url" className="block text-sm font-medium text-white mb-2">
          YouTube video URL
        </label>
        <div className="flex gap-2">
          <input
            id="yt-url"
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            disabled={submitting}
            className="flex-1 px-3 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!isValid || submitting}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-surface-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors shadow-lg shadow-brand-600/20 flex items-center gap-2 whitespace-nowrap"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Starting...
              </>
            ) : (
              'Fetch & Process'
            )}
          </button>
        </div>
        <p className="text-xs text-surface-500 mt-2">
          Single videos only. Playlists, live streams, age-restricted, and private videos are not supported.
          You must have rights to use the source content.
        </p>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────
// Shared building blocks
// ─────────────────────────────────────────────────────

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
      <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <p className="text-red-300 text-sm flex-1">{message}</p>
      <button onClick={onDismiss} className="text-red-400 hover:text-white text-xs font-medium">
        Dismiss
      </button>
    </div>
  );
}

function ProgressBar({ progress, state }: { progress: number; state: UploadState }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-surface-300">
          {state === 'processing' ? 'Starting AI processing...' : 'Uploading...'}
        </span>
        <span className="text-brand-400 font-medium">{progress}%</span>
      </div>
      <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-surface-500 text-xs mt-2">
        {state === 'processing'
          ? 'Your video will be transcribed and analyzed by AI'
          : 'Do not close this page while uploading'}
      </p>
    </div>
  );
}
