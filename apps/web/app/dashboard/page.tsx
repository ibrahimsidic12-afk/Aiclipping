import { VideoUpload } from '@/components/video/video-upload';
import { VideoList } from '@/components/video/video-list';
import { YouTubeImport } from '@/components/video/youtube-import';

export default function DashboardPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-surface-800 bg-surface-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="text-white font-semibold text-lg">ClipAI</span>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <a href="/dashboard" className="text-white text-sm font-medium">Dashboard</a>
            <a href="/dashboard" className="text-surface-400 text-sm hover:text-white transition-colors">My Clips</a>
            <a href="/dashboard" className="text-surface-400 text-sm hover:text-white transition-colors">Settings</a>
          </nav>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-brand-500/10 text-brand-400 text-xs font-medium">
              Pro Plan
            </div>
            <div className="w-8 h-8 rounded-full bg-surface-700" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* YouTube Import Section */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">Auto-Clip from YouTube</h1>
            <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 text-xs font-medium">NEW</span>
          </div>
          <p className="text-surface-400 mb-6">
            Paste a YouTube URL and our AI will automatically find viral moments, generate short clips, and add captions.
          </p>
          <YouTubeImport />
        </section>

        {/* Divider */}
        <div className="relative mb-12">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-surface-800" />
          </div>
          <div className="relative flex justify-center">
            <span className="px-4 bg-surface-950 text-surface-500 text-sm">or upload your own video</span>
          </div>
        </div>

        {/* Upload Section */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-2">Upload Video</h2>
          <p className="text-surface-400 mb-6">
            Upload a video and our AI will find the best moments, add captions, and create clips.
          </p>
          <VideoUpload />
        </section>

        {/* Recent Videos */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Recent Videos</h2>
            <button className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
              View All
            </button>
          </div>
          <VideoList />
        </section>
      </main>
    </div>
  );
}
