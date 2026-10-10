// lib/validate.ts
// Small hand-written validators (no schema library). Every failure throws an
// ApiError(422), so handlers just let it bubble up to withAuth.
import { ApiError } from '@/lib/api';
import {
  PROJECT_STATUSES,
  SKILL_LEVELS,
  type Json,
  type ProjectCreate,
  type ProjectPatch,
  type RequiredSkill,
  type ScheduleBlock,
  type Weights,
} from '@/types/compass';

type Raw = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function bad(field: string, message: string): never {
  throw new ApiError(422, 'validation_error', `${field}: ${message}`);
}

export function asObject(input: unknown, label = 'body'): Raw {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return bad(label, 'must be a JSON object');
  }
  return input as Raw;
}

/** Rejects typos and read-only fields such as score_composite. */
export function allowOnly(o: Raw, allowed: readonly string[]): void {
  for (const key of Object.keys(o)) {
    if (!allowed.includes(key)) bad(key, 'unknown or read-only field');
  }
}

// ---------- scalars ----------

export function uuidParam(value: string): string {
  if (!UUID_RE.test(value)) throw new ApiError(400, 'invalid_id', 'Id must be a UUID');
  return value;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function requireDate(value: unknown, key: string): string {
  if (typeof value !== 'string' || !isValidDate(value)) {
    return bad(key, 'must be a valid date (YYYY-MM-DD)');
  }
  return value;
}

export function optText(o: Raw, key: string, max: number, min = 0): string | undefined {
  const v = o[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') return bad(key, 'must be a string');
  const s = v.trim();
  if (s.length < min || s.length > max) return bad(key, `length must be ${min}-${max}`);
  return s;
}

/** null or an empty string clears the value. */
export function optNullableText(o: Raw, key: string, max: number): string | null | undefined {
  if (o[key] === null) return null;
  const s = optText(o, key, max);
  return s === '' ? null : s;
}

export function optInt(o: Raw, key: string, min: number, max: number): number | undefined {
  const v = o[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    return bad(key, `must be an integer ${min}-${max}`);
  }
  return v;
}

export function optNullableInt(
  o: Raw,
  key: string,
  min: number,
  max: number,
): number | null | undefined {
  return o[key] === null ? null : optInt(o, key, min, max);
}

export function optEnum<T extends string>(
  o: Raw,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const v = o[key];
  if (v === undefined) return undefined;
  return allowed.find((a) => a === v) ?? bad(key, `must be one of: ${allowed.join(', ')}`);
}

function optUuid(o: Raw, key: string): string | undefined {
  const v = optText(o, key, 36);
  if (v !== undefined && !UUID_RE.test(v)) return bad(key, 'must be a UUID');
  return v;
}

function isJson(v: unknown): v is Json {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return (v as unknown[]).every(isJson);
  if (typeof v === 'object') return Object.values(v as Raw).every(isJson);
  return false;
}

function optJson(o: Raw, key: string, maxChars: number): Json | null | undefined {
  const v = o[key];
  if (v === undefined || v === null) return v;
  if (!isJson(v) || JSON.stringify(v).length > maxChars) {
    return bad(key, `must be JSON up to ${maxChars} chars`);
  }
  return v;
}

// ---------- query string ----------

export function intParam(
  sp: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = sp.get(key);
  if (raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return bad(key, `must be an integer ${min}-${max}`);
  return n;
}

export function enumParam<T extends string>(
  sp: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = sp.get(key);
  if (raw === null || raw === '') return fallback;
  return allowed.find((a) => a === raw) ?? bad(key, `must be one of: ${allowed.join(', ')}`);
}

/** Comma-separated list, e.g. ?status=next,in_progress */
export function listParam<T extends string>(
  sp: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T[] {
  const raw = sp.get(key);
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => allowed.find((a) => a === part.trim()) ?? bad(key, `allowed: ${allowed.join(', ')}`));
}

/** Escapes LIKE wildcards so user input is matched literally. */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

// ---------- projects ----------

const PROJECT_FIELDS = [
  'name', 'description', 'category', 'status',
  'score_monetisasi', 'score_engineering', 'score_infrastruktur', 'score_skill_fit',
  'score_strategic', 'tech_stack', 'deploy_location', 'estimated_time_hours',
  'required_skills', 'manfaat', 'risk_analysis', 'success_metric',
] as const;

function optRequiredSkills(o: Raw, key: string): RequiredSkill[] | undefined {
  const v = o[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 50) return bad(key, 'must be an array (max 50 items)');
  const items = v as unknown[];
  const seen = new Set<string>();
  const out: RequiredSkill[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const s = asObject(items[i], `${key}[${i}]`);
    allowOnly(s, ['name', 'level']);
    const name = optText(s, 'name', 80, 1);
    if (name === undefined) return bad(`${key}[${i}].name`, 'is required');
    const dedupe = name.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ name, level: optEnum(s, 'level', SKILL_LEVELS) ?? 'beginner' });
  }
  return out;
}

export function parseProjectPatch(input: unknown): ProjectPatch {
  const o = asObject(input);
  allowOnly(o, PROJECT_FIELDS);
  return {
    name: optText(o, 'name', 120, 1),
    description: optNullableText(o, 'description', 2000),
    category: optNullableText(o, 'category', 60),
    status: optEnum(o, 'status', PROJECT_STATUSES),
    score_monetisasi: optInt(o, 'score_monetisasi', 0, 100),
    score_engineering: optInt(o, 'score_engineering', 0, 100),
    score_infrastruktur: optInt(o, 'score_infrastruktur', 0, 100),
    score_skill_fit: optInt(o, 'score_skill_fit', 0, 100),
    score_strategic: optInt(o, 'score_strategic', 0, 100),
    tech_stack: optJson(o, 'tech_stack', 4000),
    deploy_location: optNullableText(o, 'deploy_location', 200),
    estimated_time_hours: optNullableInt(o, 'estimated_time_hours', 0, 100000),
    required_skills: optRequiredSkills(o, 'required_skills'),
    manfaat: optNullableText(o, 'manfaat', 5000),
    risk_analysis: optNullableText(o, 'risk_analysis', 5000),
    success_metric: optNullableText(o, 'success_metric', 1000),
  };
}

export function parseProjectCreate(input: unknown): ProjectCreate {
  const patch = parseProjectPatch(input);
  if (patch.name === undefined) return bad('name', 'is required');
  return { ...patch, name: patch.name };
}

export function hasChanges(patch: Record<string, unknown>): boolean {
  return Object.values(patch).some((v) => v !== undefined);
}

// ---------- schedule ----------

export function parseBlocks(input: unknown): ScheduleBlock[] {
  if (!Array.isArray(input) || input.length > 48) return bad('blocks', 'must be an array (max 48)');
  return (input as unknown[]).map((item, i) => {
    const label = `blocks[${i}]`;
    const o = asObject(item, label);
    allowOnly(o, ['time', 'duration_min', 'task', 'project_id', 'skill_id', 'type']);
    const time = optText(o, 'time', 5);
    if (time === undefined || !TIME_RE.test(time)) return bad(`${label}.time`, 'must be HH:MM (24h)');
    const duration = optInt(o, 'duration_min', 1, 1440);
    if (duration === undefined) return bad(`${label}.duration_min`, 'is required');
    const task = optText(o, 'task', 200, 1);
    if (task === undefined) return bad(`${label}.task`, 'is required');

    const block: ScheduleBlock = { time, duration_min: duration, task };
    const projectId = optUuid(o, 'project_id');
    if (projectId !== undefined) block.project_id = projectId;
    const skillId = optUuid(o, 'skill_id');
    if (skillId !== undefined) block.skill_id = skillId;
    const type = optText(o, 'type', 30, 1);
    if (type !== undefined) block.type = type;
    return block;
  });
}

// ---------- scoring weights ----------

const WEIGHT_KEYS = ['monetisasi', 'engineering', 'infrastruktur', 'skill_fit', 'strategic'] as const;

/** Weights must sum to exactly 1 with at most 3 decimals (matches NUMERIC(4,3) in the DB). */
export function parseWeights(input: unknown): Weights {
  const o = asObject(input, 'weights');
  allowOnly(o, WEIGHT_KEYS);
  const milli: Weights = { monetisasi: 0, engineering: 0, infrastruktur: 0, skill_fit: 0, strategic: 0 };
  let sum = 0;
  for (const k of WEIGHT_KEYS) {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      return bad(`weights.${k}`, 'must be a number between 0 and 1');
    }
    const m = Math.round(v * 1000);
    if (Math.abs(v * 1000 - m) > 1e-6) return bad(`weights.${k}`, 'at most 3 decimals');
    milli[k] = m;
    sum += m;
  }
  if (sum !== 1000) return bad('weights', `must sum to 1 (got ${sum / 1000})`);
  return {
    monetisasi: milli.monetisasi / 1000,
    engineering: milli.engineering / 1000,
    infrastruktur: milli.infrastruktur / 1000,
    skill_fit: milli.skill_fit / 1000,
    strategic: milli.strategic / 1000,
  };
}
