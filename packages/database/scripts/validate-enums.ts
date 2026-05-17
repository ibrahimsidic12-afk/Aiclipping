/**
 * Build-time enum validation script.
 *
 * Compares Prisma-generated enum values against the expected values
 * from @clip-ai/types union types. Exits with code 1 on mismatch.
 *
 * This script runs AFTER `prisma generate` to ensure the generated
 * enums stay aligned with the TypeScript type definitions.
 *
 * Note: Prisma only exports runtime enum objects for enums used in model
 * fields. Enums only referenced in JSON columns (CaptionStyle, CaptionAnimation)
 * are parsed directly from the schema file.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import Prisma-generated enums (only those used in model fields are available)
import {
  VideoStatus,
  ClipStatus,
  JobStatus,
  JobType,
  Platform,
  UserRole,
  UserPlan,
  VideoSourceType,
} from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parses enum values from the Prisma schema file for enums that
 * aren't exported as runtime objects by the Prisma client.
 */
function parseEnumFromSchema(enumName: string): string[] {
  const schemaPath = resolve(__dirname, '..', 'prisma', 'schema.prisma');
  const schema = readFileSync(schemaPath, 'utf-8');

  const enumRegex = new RegExp(`enum\\s+${enumName}\\s*\\{([^}]+)\\}`, 's');
  const match = schema.match(enumRegex);

  if (!match) {
    throw new Error(`Could not find enum "${enumName}" in Prisma schema`);
  }

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));
}

/**
 * Expected enum values from @clip-ai/types union types.
 * These are hardcoded because TypeScript union types don't exist at runtime.
 */
const ENUM_PAIRS: Array<{ name: string; prisma: string[]; ts: string[] }> = [
  {
    name: 'VideoStatus',
    prisma: Object.values(VideoStatus),
    ts: ['uploading', 'uploaded', 'fetching', 'processing', 'transcribing', 'analyzing', 'ready', 'error'],
  },
  {
    name: 'ClipStatus',
    prisma: Object.values(ClipStatus),
    ts: ['suggested', 'queued', 'rendering', 'rendered', 'exported', 'error'],
  },
  {
    name: 'JobStatus',
    prisma: Object.values(JobStatus),
    ts: ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'],
  },
  {
    name: 'Platform',
    prisma: Object.values(Platform),
    ts: ['tiktok', 'reels', 'shorts', 'twitter', 'square', 'landscape'],
  },
  {
    name: 'CaptionStyle',
    prisma: parseEnumFromSchema('CaptionStyle'),
    ts: ['bold', 'karaoke', 'minimal', 'gradient', 'outline'],
  },
  {
    name: 'CaptionAnimation',
    prisma: parseEnumFromSchema('CaptionAnimation'),
    ts: ['fade', 'pop', 'slide', 'typewriter', 'none'],
  },
  {
    name: 'UserRole',
    prisma: Object.values(UserRole),
    ts: ['user', 'admin'],
  },
  {
    name: 'UserPlan',
    prisma: Object.values(UserPlan),
    ts: ['free', 'pro', 'enterprise'],
  },
  {
    name: 'VideoSourceType',
    prisma: Object.values(VideoSourceType),
    ts: ['upload', 'youtube'],
  },
];

/**
 * JobType uses underscores in Prisma but hyphens in TypeScript.
 * Validated separately with the underscore→hyphen mapping.
 */
const JOB_TYPE_TS_VALUES = [
  'transcribe',
  'detect-highlights',
  'generate-captions',
  'render-clip',
  'generate-preview',
  'extract-keyframes',
  'analyze-keyframes',
  'fetch-source',
];

const JOB_TYPE_PRISMA_TO_TS: Record<string, string> = {
  transcribe: 'transcribe',
  detect_highlights: 'detect-highlights',
  generate_captions: 'generate-captions',
  render_clip: 'render-clip',
  generate_preview: 'generate-preview',
  extract_keyframes: 'extract-keyframes',
  analyze_keyframes: 'analyze-keyframes',
  fetch_source: 'fetch-source',
};

let failed = false;

// Validate direct-match enums (identical string values)
for (const { name, prisma, ts } of ENUM_PAIRS) {
  const prismaSet = new Set(prisma);
  const tsSet = new Set(ts);

  if (prismaSet.size !== tsSet.size || ![...prismaSet].every((v) => tsSet.has(v))) {
    console.error(`❌ ENUM MISMATCH: ${name}`);
    console.error(`   Prisma values: [${[...prismaSet].join(', ')}]`);
    console.error(`   Types values:  [${[...tsSet].join(', ')}]`);

    const missingInPrisma = [...tsSet].filter((v) => !prismaSet.has(v));
    const extraInPrisma = [...prismaSet].filter((v) => !tsSet.has(v));

    if (missingInPrisma.length > 0) {
      console.error(`   Missing in Prisma: ${missingInPrisma.join(', ')}`);
    }
    if (extraInPrisma.length > 0) {
      console.error(`   Extra in Prisma: ${extraInPrisma.join(', ')}`);
    }

    failed = true;
  }
}

// Validate JobType with underscore→hyphen mapping
const prismaJobTypes = Object.values(JobType);
const mappedJobTypes = prismaJobTypes.map((v) => JOB_TYPE_PRISMA_TO_TS[v]);
const tsJobTypeSet = new Set(JOB_TYPE_TS_VALUES);

// Check all Prisma JobType values have a mapping
const unmappedPrisma = prismaJobTypes.filter((v) => !(v in JOB_TYPE_PRISMA_TO_TS));
if (unmappedPrisma.length > 0) {
  console.error(`❌ ENUM MISMATCH: JobType`);
  console.error(`   Prisma values without mapping: [${unmappedPrisma.join(', ')}]`);
  failed = true;
}

// Check all mapped values exist in TS types
const mappedSet = new Set(mappedJobTypes.filter(Boolean));
if (mappedSet.size !== tsJobTypeSet.size || ![...mappedSet].every((v) => tsJobTypeSet.has(v))) {
  console.error(`❌ ENUM MISMATCH: JobType (after mapping)`);
  console.error(`   Mapped Prisma values: [${[...mappedSet].join(', ')}]`);
  console.error(`   Types values:         [${[...tsJobTypeSet].join(', ')}]`);

  const missingInMapped = [...tsJobTypeSet].filter((v) => !mappedSet.has(v));
  const extraInMapped = [...mappedSet].filter((v) => !tsJobTypeSet.has(v));

  if (missingInMapped.length > 0) {
    console.error(`   Missing in Prisma (mapped): ${missingInMapped.join(', ')}`);
  }
  if (extraInMapped.length > 0) {
    console.error(`   Extra in Prisma (mapped): ${extraInMapped.join(', ')}`);
  }

  failed = true;
}

if (failed) {
  console.error('\n⛔ Enum validation failed. Prisma schema is out of sync with @clip-ai/types.');
  process.exit(1);
} else {
  console.log('✅ All enum alignments verified. Prisma schema matches @clip-ai/types.');
}
