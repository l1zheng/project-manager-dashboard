import type { FieldType } from '@project-manager/domain';
import type { ReportCellValue } from './report.js';

export type PresentationGridFieldInput = {
  id: string;
  name: string;
  type: FieldType;
  width?: number;
  sampleValues?: ReportCellValue[];
};

export type PresentationGridFieldLayout = {
  fieldId: string;
  startColumn: number;
  endColumn: number;
  span: number;
  preferredSpan: number;
};

export type PresentationGridLayout = {
  gridColumns: number;
  compressed: boolean;
  fields: PresentationGridFieldLayout[];
};

type FieldLayoutProfile = {
  base: number;
  preferredMin: number;
  preferredMax: number;
};

const fieldProfiles: Record<FieldType, FieldLayoutProfile> = {
  sequence: { base: 4, preferredMin: 3, preferredMax: 5 },
  checkbox: { base: 5, preferredMin: 4, preferredMax: 6 },
  number: { base: 7, preferredMin: 5, preferredMax: 9 },
  date: { base: 8, preferredMin: 6, preferredMax: 10 },
  single_select: { base: 8, preferredMin: 6, preferredMax: 10 },
  status: { base: 8, preferredMin: 6, preferredMax: 10 },
  person: { base: 8, preferredMin: 6, preferredMax: 11 },
  short_text: { base: 10, preferredMin: 7, preferredMax: 15 },
  url: { base: 11, preferredMin: 8, preferredMax: 16 },
  multi_select: { base: 11, preferredMin: 8, preferredMax: 16 },
  long_text: { base: 18, preferredMin: 12, preferredMax: 24 }
};

export function calculatePresentationGridLayout(
  fields: PresentationGridFieldInput[],
  gridColumns = 60
): PresentationGridLayout {
  if (!Number.isInteger(gridColumns) || gridColumns < 1) {
    throw new RangeError('The presentation grid width must be a positive integer.');
  }
  if (new Set(fields.map((field) => field.id)).size !== fields.length) {
    throw new Error('Presentation grid field IDs must be unique.');
  }
  if (fields.length === 0) {
    return { gridColumns, compressed: false, fields: [] };
  }
  if (fields.length > gridColumns) {
    throw new RangeError(
      `The presentation grid has ${gridColumns} columns but the view contains ${fields.length} visible fields.`
    );
  }

  const preferredSpans = fields.map(calculatePreferredSpan);
  const preferredMinimums = fields.map((field) => fieldProfiles[field.type].preferredMin);
  const compressed = sum(preferredMinimums) > gridColumns;
  const baselines = compressed ? fields.map(() => 1) : preferredMinimums;
  const remainingColumns = gridColumns - sum(baselines);
  const allocationWeights = preferredSpans.map((preferredSpan, index) =>
    Math.max(preferredSpan - baselines[index]!, 0.25)
  );
  const extras = allocateLargestRemainder(remainingColumns, allocationWeights);

  let nextColumn = 1;
  return {
    gridColumns,
    compressed,
    fields: fields.map((field, index) => {
      const span = baselines[index]! + extras[index]!;
      const startColumn = nextColumn;
      const endColumn = startColumn + span - 1;
      nextColumn = endColumn + 1;
      return {
        fieldId: field.id,
        startColumn,
        endColumn,
        span,
        preferredSpan: preferredSpans[index]!
      };
    })
  };
}

function calculatePreferredSpan(field: PresentationGridFieldInput): number {
  const profile = fieldProfiles[field.type];
  const contentUnits = representativeContentUnits(field.name, field.sampleValues ?? []);
  const naturalSpan = profile.base + Math.sqrt(contentUnits) * 0.8;
  const widthSpan =
    field.width === undefined || !Number.isFinite(field.width) || field.width <= 0
      ? undefined
      : field.width / 16;
  const blendedSpan = widthSpan === undefined ? naturalSpan : naturalSpan * 0.7 + widthSpan * 0.3;
  return clamp(blendedSpan, profile.preferredMin, profile.preferredMax);
}

function representativeContentUnits(name: string, values: ReportCellValue[]): number {
  const lengths = values
    .slice(0, 50)
    .map((value) => textUnitLength(displayValue(value)))
    .sort((left, right) => left - right);
  const representativeIndex = Math.floor(Math.max(0, lengths.length - 1) * 0.8);
  return Math.max(textUnitLength(name), lengths[representativeIndex] ?? 0, 1);
}

function displayValue(value: ReportCellValue): string {
  if (value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function textUnitLength(value: string): number {
  return Math.max(
    ...value
      .split(/\r?\n/)
      .map((line) =>
        Array.from(line).reduce(
          (length, character) => length + (isWideCharacter(character) ? 2 : 1),
          0
        )
      ),
    0
  );
}

function isWideCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff))
  );
}

function allocateLargestRemainder(total: number, weights: number[]): number[] {
  if (total === 0) return weights.map(() => 0);
  const totalWeight = sum(weights);
  const quotas = weights.map((weight) => (weight / totalWeight) * total);
  const allocation = quotas.map(Math.floor);
  let remaining = total - sum(allocation);
  const order = quotas
    .map((quota, index) => ({ index, remainder: quota - allocation[index]! }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (const candidate of order) {
    if (remaining === 0) break;
    allocation[candidate.index]! += 1;
    remaining -= 1;
  }
  return allocation;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
