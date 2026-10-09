// lib/ai/schedule.ts
// AI daily schedule generation. Like lib/ai/scoring.ts, this only SUGGESTS -
// nothing is saved here. The client applies the result with the existing
// PUT /api/schedule (same precedent as AnalyzeButton/SuggestionCard).
// [NEW, Part 5] This was explicitly deferred out of Part 3's scope.
import { unwrap, type AuthContext } from '@/lib/api';
import { outputError, type ChatMessage } from '@/lib/ai/client';
import { runAi } from '@/lib/ai/run';
import { cleanLine, safeText } from '@/lib/ai/text';
import { analyzeSkills } from '@/lib/skills';
import type { ScheduleBlock } from '@/types/compass';

export type GenerateScheduleInput = {
  date: string;
  availableHours: number;
  energyPattern: string;
};

export type GeneratedSchedule = {
  blocks: ScheduleBlock[];
  reasoning: string;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_BLOCKS = 24;
// How far over available_hours a reply may run before it's rejected and
// retried; the model is asked to respect the budget, this is the backstop.
const OVER_BUDGET_TOLERANCE = 1.2;

const SYSTEM_PROMPT = `You build a realistic ONE-DAY schedule for a solo founder.
Rules:
- Use ONLY the JSON facts provided (top_projects, skill_gap, available_hours, energy_pattern). Never invent project or skill names.
- project_id and skill_id, when used, MUST exactly match an id from top_projects or skill_gap - omit the field entirely rather than guess one.
- Total scheduled minutes must not exceed available_hours * 60.
- Reply with ONE JSON object and nothing else: {"blocks": [{"time","duration_min","task","project_id"?,"skill_id"?,"type"?}], "reasoning": "..."}.
- time is 24h "HH:MM". duration_min is a positive integer. task is a short, specific action, not just a project name.
- Match energy_pattern: put the highest-composite project's work in the described high-energy hours, lighter or reflective work elsewhere.
- Include at most one short reflection/review block near the end if hours allow.
- reasoning: Indonesian, informal and direct (address the reader as "lo"), 1-2 short sentences explaining the ordering. No greeting, no closing, no filler, no markdown, no em dashes.
- Never use the words delve, robust, leverage, seamless.`;

function parseGeneratedSchedule(
  raw: unknown,
  validProjectIds: ReadonlySet<string>,
  validSkillIds: ReadonlySet<string>,
  availableHours: number,
): GeneratedSchedule {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return outputError('expected a JSON object');
  }
  const o = raw as Record<string, unknown>;

  const reasoning = typeof o.reasoning === 'string' ? cleanLine(o.reasoning) : '';
  if (reasoning.length < 5) return outputError('reasoning is missing');

  const items = Array.isArray(o.blocks) ? (o.blocks as unknown[]) : [];
  if (items.length === 0) return outputError('blocks must be a non-empty array');

  const blocks: ScheduleBlock[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const b = item as Record<string, unknown>;
    const time = typeof b.time === 'string' ? b.time : '';
    const duration = typeof b.duration_min === 'number' ? Math.round(b.duration_min) : NaN;
    const task = typeof b.task === 'string' ? cleanLine(b.task).slice(0, 200) : '';
    if (!TIME_RE.test(time) || !Number.isFinite(duration) || duration <= 0 || task === '') continue;

    const block: ScheduleBlock = { time, duration_min: Math.min(duration, 1440), task };
    if (typeof b.project_id === 'string' && validProjectIds.has(b.project_id)) block.project_id = b.project_id;
    if (typeof b.skill_id === 'string' && validSkillIds.has(b.skill_id)) block.skill_id = b.skill_id;
    if (typeof b.type === 'string' && b.type.trim() !== '') block.type = b.type.trim().slice(0, 30);

    blocks.push(block);
    if (blocks.length === MAX_BLOCKS) break;
  }
  if (blocks.length === 0) return outputError('no valid blocks in reply');

  const totalMinutes = blocks.reduce((sum, b) => sum + b.duration_min, 0);
  if (totalMinutes > availableHours * 60 * OVER_BUDGET_TOLERANCE) {
    return outputError(`total scheduled time (${totalMinutes}m) far exceeds available_hours`);
  }

  blocks.sort((a, b) => a.time.localeCompare(b.time));
  return { blocks, reasoning };
}

export async function generateSchedule(ctx: AuthContext, input: GenerateScheduleInput): Promise<GeneratedSchedule> {
  const [projectsRes, skillsRes] = await Promise.all([
    ctx.supabase.from('projects').select('*'),
    ctx.supabase.from('skills').select('*'),
  ]);
  const projects = unwrap(projectsRes);
  const skills = unwrap(skillsRes);

  const topProjects = [...projects]
    .filter((p) => p.status !== 'done')
    .sort((a, b) => b.score_composite - a.score_composite)
    .slice(0, 5);
  const validProjectIds = new Set(topProjects.map((p) => p.id));

  const skillIdByName = new Map(skills.map((s) => [s.name.toLowerCase(), s.id] as const));
  const gapEntries = analyzeSkills(skills, projects).gap.slice(0, 3);
  const validSkillIds = new Set(
    gapEntries
      .map((g) => skillIdByName.get(g.name.toLowerCase()))
      .filter((id): id is string => id !== undefined),
  );

  const facts = {
    date: input.date,
    available_hours: input.availableHours,
    energy_pattern: safeText(input.energyPattern, 200),
    top_projects: topProjects.map((p) => ({
      id: p.id,
      name: safeText(p.name, 80),
      status: p.status,
      composite: p.score_composite,
    })),
    skill_gap: gapEntries.map((g) => ({
      id: skillIdByName.get(g.name.toLowerCase()) ?? null,
      skill: safeText(g.name, 60),
      status: g.status,
    })),
  };

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(facts) },
  ];
  const result = await runAi(ctx, 'ai/schedule/generate', {
    messages,
    validate: (raw) => parseGeneratedSchedule(raw, validProjectIds, validSkillIds, input.availableHours),
    temperature: 0.4,
    maxTokens: 3072,
  });
  return result.value;
}
