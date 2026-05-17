import OpenAI from 'openai';
import { REGOLO_MODELS, getModelByCapability } from './models';
import type {
  RegoloConfig,
  TranscriptionOptions,
  TranscriptionResult,
  HighlightOptions,
  HighlightResult,
  ClipSuggestion,
  CaptionStyleOptions,
  CaptionResult,
  StyledCaption,
} from './types';

/**
 * RegoloClient - High-performance wrapper around Regolo's OpenAI-compatible API.
 * 
 * Handles:
 * - Audio transcription with word-level timestamps
 * - AI-powered highlight/clip detection
 * - Styled caption generation
 * - Automatic retries and error handling
 */
export class RegoloClient {
  private client: OpenAI;
  private config: Required<RegoloConfig>;

  constructor(config: RegoloConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.regolo.ai/v1',
      maxRetries: config.maxRetries ?? 3,
      timeout: config.timeout ?? 120_000, // 2 min default for large files
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
    });
  }

  // ═══════════════════════════════════════════════════════
  // 🎙️ TRANSCRIPTION
  // ═══════════════════════════════════════════════════════

  /**
   * Transcribe audio/video file with word-level timestamps.
   * Uses faster-whisper-large-v3 for optimal speed/accuracy balance.
   */
  async transcribe(
    file: File | Buffer | Blob,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const model = options.model || REGOLO_MODELS.WHISPER_LARGE_V3.id;

    const fileObj = file instanceof File
      ? file
      : new File([file as BlobPart], 'audio.mp3', { type: 'audio/mpeg' });

    const response = await this.client.audio.transcriptions.create({
      file: fileObj,
      model,
      language: options.language,
      prompt: options.prompt,
      response_format: options.responseFormat || 'verbose_json',
      timestamp_granularities: options.timestampGranularities || ['word', 'segment'],
    });

    // Parse verbose_json response into our typed format
    const result = response as unknown as {
      text: string;
      language: string;
      duration: number;
      segments?: Array<{
        id: number;
        start: number;
        end: number;
        text: string;
      }>;
      words?: Array<{
        word: string;
        start: number;
        end: number;
      }>;
    };

    return {
      text: result.text,
      language: result.language || 'en',
      duration: result.duration || 0,
      segments: (result.segments || []).map(seg => ({
        id: seg.id,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        words: result.words
          ?.filter(w => w.start >= seg.start && w.end <= seg.end)
          .map(w => ({ ...w, confidence: 1.0 })),
      })),
      words: result.words?.map(w => ({ ...w, confidence: 1.0 })),
    };
  }

  // ═══════════════════════════════════════════════════════
  // 🎯 HIGHLIGHT DETECTION
  // ═══════════════════════════════════════════════════════

  /**
   * Analyze transcript to find the most engaging clip moments.
   * Uses LLM reasoning to score segments by virality potential.
   */
  async detectHighlights(
    transcript: string,
    totalDuration: number,
    options: HighlightOptions = {}
  ): Promise<HighlightResult> {
    const startTime = Date.now();
    const model = options.model || getModelByCapability('reasoning').id;
    const maxClips = options.maxClips ?? 5;
    const minDuration = options.minDuration ?? 15;
    const maxDuration = options.maxDuration ?? 90;

    const platformGuidance = this.getPlatformGuidance(options.targetPlatform || 'all');

    const systemPrompt = `You are an expert short-form video editor and viral content strategist.
Your job is to identify the most engaging, shareable moments from a video transcript.

RULES:
- Find exactly ${maxClips} clip candidates
- Each clip must be ${minDuration}-${maxDuration} seconds long
- Clips should NOT overlap
- Score each clip 0-100 on viral potential
- Each clip needs a compelling "hook" (first 3 seconds text)
- Consider: emotional peaks, humor, surprising facts, clear takeaways, quotable moments

${platformGuidance}

OUTPUT FORMAT (strict JSON):
{
  "clips": [
    {
      "startTime": <seconds>,
      "endTime": <seconds>,
      "hookText": "<attention-grabbing first line>",
      "reason": "<why this segment is engaging>",
      "viralityScore": <0-100>,
      "tags": ["<relevant tags>"]
    }
  ]
}`;

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Video duration: ${totalDuration}s\n\nTranscript:\n${transcript}\n\n${options.criteria ? `Additional criteria: ${options.criteria}` : ''}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Low temp for consistent scoring
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from highlight detection model');
    }

    const parsed = JSON.parse(content) as { clips: ClipSuggestion[] };

    // Validate and clean up clips
    const validClips = parsed.clips
      .filter(clip => 
        clip.startTime >= 0 &&
        clip.endTime <= totalDuration &&
        clip.endTime - clip.startTime >= minDuration &&
        clip.endTime - clip.startTime <= maxDuration
      )
      .map(clip => ({
        ...clip,
        duration: clip.endTime - clip.startTime,
        viralityScore: Math.min(100, Math.max(0, clip.viralityScore)),
      }))
      .sort((a, b) => b.viralityScore - a.viralityScore)
      .slice(0, maxClips);

    return {
      clips: validClips,
      totalDuration,
      processingTime: Date.now() - startTime,
    };
  }

  // ═══════════════════════════════════════════════════════
  // 💬 CAPTION STYLING
  // ═══════════════════════════════════════════════════════

  /**
   * Generate styled captions with word-level animations.
   * Transforms raw transcript into visually engaging subtitle data.
   */
  async generateStyledCaptions(
    transcript: string,
    words: Array<{ word: string; start: number; end: number }>,
    options: CaptionStyleOptions
  ): Promise<CaptionResult> {
    const model = options.model || getModelByCapability('json-output', { preferSpeed: true }).id;
    const maxWordsPerLine = options.maxWordsPerLine ?? 4;

    const styleGuide = this.getStyleGuide(options);

    const systemPrompt = `You are a caption styling engine for short-form video.
Group words into display lines (max ${maxWordsPerLine} words per line).
Apply the "${options.style}" style to each line.

${styleGuide}

Input: Array of words with timestamps and full transcript for context
Output: Grouped caption lines with styling metadata

OUTPUT FORMAT (strict JSON):
{
  "captions": [
    {
      "startTime": <seconds>,
      "endTime": <seconds>,
      "text": "<full line text>",
      "words": [
        { "word": "<word>", "startTime": <s>, "endTime": <s>, "highlight": <bool> }
      ],
      "style": {
        "fontSize": <px>,
        "fontWeight": "<normal|bold|black>",
        "color": "<hex>",
        "backgroundColor": "<hex or null>",
        "position": { "x": <0-100>, "y": <0-100> },
        "animation": "<fade|pop|slide|none>"
      }
    }
  ]
}`;

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify({
            transcript: transcript.slice(0, 2000),
            words: words.slice(0, 500),
          }),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 8192,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from caption styling model');
    }

    const parsed = JSON.parse(content) as { captions: StyledCaption[] };

    return {
      captions: parsed.captions,
      totalWords: words.length,
      format: options.style,
    };
  }

  // ═══════════════════════════════════════════════════════
  // 🔍 MULTIMODAL ANALYSIS (Keyframe-based)
  // ═══════════════════════════════════════════════════════

  /**
   * Analyze video keyframes for visual engagement scoring.
   * Send extracted frames to a vision model for scene understanding.
   */
  async analyzeKeyframes(
    frames: Array<{ timestamp: number; base64: string }>,
    transcript: string,
    options?: { model?: string }
  ): Promise<Array<{ timestamp: number; description: string; engagementScore: number }>> {
    const model = options?.model || getModelByCapability('vision').id;

    const imageMessages = frames.map(frame => ({
      type: 'image_url' as const,
      image_url: { url: `data:image/jpeg;base64,${frame.base64}` },
    }));

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `Analyze these video keyframes. For each frame, describe what's happening and rate visual engagement (0-100). Consider: facial expressions, action, composition, text on screen, visual variety. Return JSON array.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Context transcript: ${transcript.slice(0, 2000)}` },
            ...imageMessages,
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content) as {
      frames: Array<{ timestamp: number; description: string; engagementScore: number }>;
    };

    return parsed.frames || [];
  }

  // ═══════════════════════════════════════════════════════
  // 🛠️ PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════

  private getPlatformGuidance(platform: string): string {
    const guides: Record<string, string> = {
      tiktok: 'PLATFORM: TikTok - Prefer fast-paced, hook-heavy clips. 15-60s ideal. Strong opening line critical.',
      reels: 'PLATFORM: Instagram Reels - Visual storytelling preferred. 15-90s. Aesthetic moments score higher.',
      shorts: 'PLATFORM: YouTube Shorts - Educational/informative clips perform well. Under 60s. Clear takeaways.',
      all: 'PLATFORM: General - Optimize for engagement across all short-form platforms.',
    };
    return guides[platform] || guides['all']!;
  }

  private getStyleGuide(options: CaptionStyleOptions): string {
    const guides: Record<string, string> = {
      bold: 'STYLE: Bold - Large white text, black outline, centered. Emphasize key words with yellow highlight. Animation: pop.',
      karaoke: 'STYLE: Karaoke - Words light up sequentially as spoken. Active word in bright color, others dimmed. Animation: none (word highlight is the animation).',
      minimal: 'STYLE: Minimal - Small, clean text at bottom. No background. Subtle fade in/out. Animation: fade.',
      gradient: 'STYLE: Gradient - Text with gradient color shift. Medium size, centered. Background blur box. Animation: slide.',
      outline: 'STYLE: Outline - Thick colored outline on white text. Bold and readable. Animation: pop.',
    };

    return `${guides[options.style] || guides['bold']!}
Font size: ${options.fontSize === 'small' ? 24 : options.fontSize === 'large' ? 48 : 36}px
Position: ${options.position || 'bottom'} of frame
${options.color ? `Primary color: ${options.color}` : ''}
${options.backgroundColor ? `Background: ${options.backgroundColor}` : ''}`;
  }
}
