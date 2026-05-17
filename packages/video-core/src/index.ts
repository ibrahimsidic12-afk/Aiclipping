// FFmpeg utilities
export { FFmpegBuilder } from './ffmpeg/builder';
export { extractAudio, extractKeyframes, getVideoInfo } from './ffmpeg/extract';
export { renderClip, burnCaptions } from './ffmpeg/render';

// Caption generation
export { generateSRT, generateVTT, generateASS } from './captions/generators';
export { formatTimestamp, splitIntoLines } from './captions/utils';

// Format presets
export { PRESETS, getPreset, type OutputPreset } from './formats';

// Reframing
export { calculateCrop, type CropRegion } from './reframing/crop';
