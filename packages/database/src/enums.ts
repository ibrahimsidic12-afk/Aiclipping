/**
 * Enum mapping utilities for converting between Prisma-generated enums
 * and TypeScript union types from @clip-ai/types.
 *
 * JobType requires explicit mapping (underscores in Prisma ↔ hyphens in TS).
 * All other enums use identical string values and only need type assertions.
 */

// ─── Prisma Enum Types ───────────────────────────────
// These are re-declared locally to avoid depending on a generated client
// that may not exist yet. Once `prisma generate` runs, these will match
// the actual generated enum types from @prisma/client.

export const PrismaJobType = {
  transcribe: 'transcribe',
  detect_highlights: 'detect_highlights',
  generate_captions: 'generate_captions',
  render_clip: 'render_clip',
  generate_preview: 'generate_preview',
  extract_keyframes: 'extract_keyframes',
  analyze_keyframes: 'analyze_keyframes',
  fetch_source: 'fetch_source',
} as const;

export type PrismaJobType = (typeof PrismaJobType)[keyof typeof PrismaJobType];

// ─── TypeScript Union Types (from @clip-ai/types) ────

export type TSJobType =
  | 'transcribe'
  | 'detect-highlights'
  | 'generate-captions'
  | 'render-clip'
  | 'generate-preview'
  | 'extract-keyframes'
  | 'analyze-keyframes'
  | 'fetch-source';

// ─── JobType Mapping ─────────────────────────────────

const JOB_TYPE_MAP: Record<PrismaJobType, TSJobType> = {
  transcribe: 'transcribe',
  detect_highlights: 'detect-highlights',
  generate_captions: 'generate-captions',
  render_clip: 'render-clip',
  generate_preview: 'generate-preview',
  extract_keyframes: 'extract-keyframes',
  analyze_keyframes: 'analyze-keyframes',
  fetch_source: 'fetch-source',
};

const REVERSE_JOB_TYPE_MAP: Record<TSJobType, PrismaJobType> = Object.fromEntries(
  Object.entries(JOB_TYPE_MAP).map(([k, v]) => [v, k])
) as Record<TSJobType, PrismaJobType>;

/**
 * Converts a Prisma JobType enum value (underscore format) to the
 * TypeScript union type (hyphen format) from @clip-ai/types.
 */
export function toTSJobType(prismaType: PrismaJobType): TSJobType {
  const result = JOB_TYPE_MAP[prismaType];
  if (!result) {
    throw new Error(`[database] Unknown Prisma JobType: "${prismaType}"`);
  }
  return result;
}

/**
 * Converts a TypeScript JobType union value (hyphen format) to the
 * Prisma enum value (underscore format).
 */
export function toPrismaJobType(tsType: TSJobType): PrismaJobType {
  const result = REVERSE_JOB_TYPE_MAP[tsType];
  if (!result) {
    throw new Error(`[database] Unknown TypeScript JobType: "${tsType}"`);
  }
  return result;
}

// ─── Generic Enum Alignment Assertion ────────────────

/**
 * Asserts that two sets of enum values are aligned (contain the same members).
 * Used at build time to verify Prisma enums match TypeScript union types.
 *
 * @param enumName - Name of the enum (for error messages)
 * @param prismaValues - Array of Prisma enum string values
 * @param tsValues - Array of TypeScript union string values
 * @throws Error if the sets differ in size or content
 */
export function assertEnumAlignment(
  enumName: string,
  prismaValues: readonly string[],
  tsValues: readonly string[]
): void {
  const prismaSet = new Set(prismaValues);
  const tsSet = new Set(tsValues);

  if (prismaSet.size !== tsSet.size) {
    throw new Error(
      `[database] Enum mismatch for ${enumName}: ` +
        `Prisma has ${prismaSet.size} values, TypeScript has ${tsSet.size} values. ` +
        `Prisma: [${[...prismaSet].join(', ')}], TS: [${[...tsSet].join(', ')}]`
    );
  }

  for (const value of prismaSet) {
    if (!tsSet.has(value)) {
      throw new Error(
        `[database] Enum mismatch for ${enumName}: ` +
          `Prisma value "${value}" not found in TypeScript type. ` +
          `Prisma: [${[...prismaSet].join(', ')}], TS: [${[...tsSet].join(', ')}]`
      );
    }
  }
}
