import { formatTimestamp } from './utils';
import type { CaptionLine } from './types';

/**
 * Generate SRT subtitle content from caption lines.
 * SRT is the most widely supported format.
 */
export function generateSRT(captions: CaptionLine[]): string {
  return captions
    .map((caption, index) => {
      const start = formatTimestamp(caption.startTime, 'srt');
      const end = formatTimestamp(caption.endTime, 'srt');
      return `${index + 1}\n${start} --> ${end}\n${caption.text}\n`;
    })
    .join('\n');
}

/**
 * Generate WebVTT subtitle content from caption lines.
 * VTT supports styling and positioning natively.
 */
export function generateVTT(captions: CaptionLine[], options?: { includeStyles?: boolean }): string {
  let output = 'WEBVTT\n\n';

  if (options?.includeStyles) {
    output += `STYLE\n::cue {\n  background-color: transparent;\n  color: white;\n  font-family: 'Inter', sans-serif;\n  text-shadow: 2px 2px 4px rgba(0,0,0,0.8);\n}\n\n`;
  }

  output += captions
    .map((caption, index) => {
      const start = formatTimestamp(caption.startTime, 'vtt');
      const end = formatTimestamp(caption.endTime, 'vtt');
      let cue = `${index + 1}\n${start} --> ${end}`;

      // Add position if specified
      if (caption.position) {
        cue += ` position:${caption.position.x}% line:${caption.position.y}%`;
      }

      cue += `\n${caption.text}\n`;
      return cue;
    })
    .join('\n');

  return output;
}

/**
 * Generate ASS (Advanced SubStation Alpha) subtitle content.
 * ASS supports advanced styling: colors, fonts, animations, per-word highlighting.
 * This is the format used for "karaoke-style" animated captions.
 */
export function generateASS(
  captions: CaptionLine[],
  options?: {
    fontName?: string;
    fontSize?: number;
    primaryColor?: string; // BGR format: &HBBGGRR&
    outlineColor?: string;
    backgroundColor?: string;
    outline?: number;
    shadow?: number;
    alignment?: number; // Numpad position (2=bottom center, 5=center, 8=top)
    marginV?: number;
    bold?: boolean;
    animateWords?: boolean;
  }
): string {
  const {
    fontName = 'Arial Black',
    fontSize = 20,
    primaryColor = '&H00FFFFFF&', // White
    outlineColor = '&H00000000&', // Black
    backgroundColor = '&H80000000&', // Semi-transparent black
    outline = 3,
    shadow = 0,
    alignment = 2, // Bottom center
    marginV = 40,
    bold = true,
    animateWords = false,
  } = options || {};

  const boldFlag = bold ? -1 : 0;

  let ass = `[Script Info]
Title: AI Clip Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},&H000000FF&,${outlineColor},${backgroundColor},${boldFlag},0,0,0,100,100,0,0,1,${outline},${shadow},${alignment},10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const caption of captions) {
    const start = formatTimestamp(caption.startTime, 'ass');
    const end = formatTimestamp(caption.endTime, 'ass');

    let text: string;

    if (animateWords && caption.words && caption.words.length > 0) {
      // Karaoke mode: highlight words as they're spoken
      text = caption.words
        .map(w => {
          const wordDuration = Math.round((w.endTime - w.startTime) * 100);
          return `{\\kf${wordDuration}}${w.word}`;
        })
        .join(' ');
    } else {
      text = caption.text.replace(/\n/g, '\\N');
    }

    ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
  }

  return ass;
}
