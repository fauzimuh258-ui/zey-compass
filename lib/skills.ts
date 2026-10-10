// lib/skills.ts
import {
  SKILL_LEVELS,
  type Json,
  type ProjectRow,
  type RequiredSkill,
  type SkillGapEntry,
  type SkillGapItem,
  type SkillLevel,
  type SkillRow,
  type SkillWithDemand,
} from '@/types/compass';

export const SKILL_RANK: Record<SkillLevel, number> = { beginner: 1, intermediate: 2, expert: 3 };

const norm = (name: string): string => name.trim().toLowerCase();

function isSkillLevel(v: unknown): v is SkillLevel {
  return typeof v === 'string' && (SKILL_LEVELS as readonly string[]).includes(v);
}

/** Tolerant reader for the required_skills JSONB column. */
export function parseRequiredSkills(value: Json): RequiredSkill[] {
  if (!Array.isArray(value)) return [];
  const out: RequiredSkill[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const { name, level } = item;
    if (typeof name === 'string' && isSkillLevel(level)) out.push({ name, level });
  }
  return out;
}

function statusOf(current: SkillLevel | null, required: SkillLevel): SkillGapItem['status'] {
  if (current === null) return 'missing';
  return SKILL_RANK[current] >= SKILL_RANK[required] ? 'met' : 'below';
}

/** Gap for one project: every required skill vs. what the user already has. */
export function projectSkillGap(required: RequiredSkill[], owned: SkillRow[]): SkillGapItem[] {
  const levels = new Map(owned.map((s) => [norm(s.name), s.level] as const));
  return required.map((r) => {
    const current = levels.get(norm(r.name)) ?? null;
    return {
      name: r.name,
      required_level: r.level,
      current_level: current,
      status: statusOf(current, r.level),
    };
  });
}

/**
 * Owned skills with demand, plus the top-10 gap.
 * [ASSUMPTION] demand only counts projects that are not done yet.
 */
export function analyzeSkills(
  owned: SkillRow[],
  projects: Pick<ProjectRow, 'required_skills' | 'status'>[],
): { skills: SkillWithDemand[]; gap: SkillGapEntry[] } {
  const demand = new Map<string, { name: string; count: number; level: SkillLevel }>();
  for (const p of projects) {
    if (p.status === 'done') continue;
    for (const r of parseRequiredSkills(p.required_skills)) {
      const key = norm(r.name);
      const cur = demand.get(key);
      if (cur === undefined) {
        demand.set(key, { name: r.name, count: 1, level: r.level });
      } else {
        cur.count += 1;
        if (SKILL_RANK[r.level] > SKILL_RANK[cur.level]) cur.level = r.level;
      }
    }
  }

  const skills = owned
    .map((s) => ({ ...s, demand: demand.get(norm(s.name))?.count ?? 0 }))
    .sort((a, b) => b.demand - a.demand || a.name.localeCompare(b.name));

  const byName = new Map(owned.map((s) => [norm(s.name), s] as const));
  const gap: SkillGapEntry[] = [];
  for (const [key, d] of demand) {
    const have = byName.get(key);
    const current = have?.level ?? null;
    const status = statusOf(current, d.level);
    if (status === 'met') continue;
    gap.push({
      name: d.name,
      demand: d.count,
      required_level: d.level,
      current_level: current,
      status,
      learning_resource: have?.learning_resource ?? null,
      estimated_hours: have?.estimated_hours ?? null,
    });
  }
  gap.sort((a, b) => b.demand - a.demand || a.name.localeCompare(b.name));
  return { skills, gap: gap.slice(0, 10) };
}
