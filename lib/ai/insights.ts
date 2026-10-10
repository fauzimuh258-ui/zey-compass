// lib/ai/insights.ts
// Insight generation. Facts are computed here (deterministic); the model only
// turns them into three short recommendations. The model is read-only: it gets
// no tools and never touches the database. This module stores the result.
import { ApiError, unwrap, type AuthContext } from '@/lib/api';
import { outputError, type ChatMessage } from '@/lib/ai/client';
import { runAi } from '@/lib/ai/run';
import { cleanLine, clip, safeText } from '@/lib/ai/text';
import { analyzeSkills, parseRequiredSkills, projectSkillGap } from '@/lib/skills';
import type {
  AuditLogRow,
  InsightRow,
  InsightType,
  Json,
  ProjectRow,
  ScheduleRow,
  SkillRow,
} from '@/types/compass';

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const STAGNANT_DAYS = 14; // [ASSUMPTION] an open project untouched this long is "stagnant"
const OPEN_STATUSES: readonly string[] = ['next', 'in_progress', 'review'];

export type InsightData = {
  now: Date;
  projects: ProjectRow[];
  skills: SkillRow[];
  audit: AuditLogRow[]; // project changes, last 7 days
  schedule: ScheduleRow[]; // last 7 days
};

export type GeneratedInsight = InsightRow & { items: string[] };

/** One read pass shared by every insight type. Dates are UTC approximations. */
export async function gatherInsightData(ctx: AuthContext, now = new Date()): Promise<InsightData> {
  const since = new Date(now.getTime() - WEEK_DAYS * DAY_MS);
  const [projects, skills, audit, schedule] = await Promise.all([
    ctx.supabase.from('projects').select('*'),
    ctx.supabase.from('skills').select('*'),
    ctx.supabase
      .from('audit_log')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(500),
    ctx.supabase
      .from('daily_schedule')
      .select('*')
      .gte('date', since.toISOString().slice(0, 10))
      .lte('date', now.toISOString().slice(0, 10)),
  ]);
  return {
    now,
    projects: unwrap(projects),
    skills: unwrap(skills),
    audit: unwrap(audit),
    schedule: unwrap(schedule),
  };
}

// ---------- facts (no model involved) ----------

const daysSince = (iso: string, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));

const label = (p: ProjectRow): string => safeText(p.name, 80);

function jsonStatus(data: Json | null): string | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const status = data.status;
  return typeof status === 'string' ? status : null;
}

function plannedMinutes(blocks: Json): number {
  if (!Array.isArray(blocks)) return 0;
  let total = 0;
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null || Array.isArray(block)) continue;
    const minutes = block.duration_min;
    if (typeof minutes === 'number') total += minutes;
  }
  return total;
}

export function weeklyFacts(d: InsightData): Record<string, Json> {
  const byId = new Map(d.projects.map((p) => [p.id, p] as const));
  const open = d.projects.filter((p) => OPEN_STATUSES.includes(p.status));

  const edits = new Map<string, number>();
  const statusChanges: Json[] = [];
  let created = 0;
  let deleted = 0;
  for (const a of d.audit) {
    if (a.action === 'INSERT') {
      created += 1;
    } else if (a.action === 'DELETE') {
      deleted += 1;
    } else {
      edits.set(a.row_id, (edits.get(a.row_id) ?? 0) + 1);
      const from = jsonStatus(a.old_data);
      const to = jsonStatus(a.new_data);
      const p = byId.get(a.row_id);
      if (p !== undefined && from !== null && to !== null && from !== to && statusChanges.length < 10) {
        statusChanges.push({ project: label(p), from, to });
      }
    }
  }

  const mostEdited = [...edits.entries()]
    .flatMap(([id, count]) => {
      const p = byId.get(id);
      return p === undefined ? [] : [{ project: label(p), edits: count }];
    })
    .sort((a, b) => b.edits - a.edits || a.project.localeCompare(b.project))
    .slice(0, 3);

  const stagnant = open
    .map((p) => ({
      project: label(p),
      status: p.status,
      days_since_update: daysSince(p.updated_at, d.now),
    }))
    .filter((s) => s.days_since_update >= STAGNANT_DAYS)
    .sort((a, b) => b.days_since_update - a.days_since_update)
    .slice(0, 5);

  const minutesPerDay = d.schedule.map((day) => plannedMinutes(day.blocks));

  return {
    period_days: WEEK_DAYS,
    projects_total: d.projects.length,
    projects_open: open.length,
    projects_in_progress: d.projects.filter((p) => p.status === 'in_progress').length,
    projects_done: d.projects.filter((p) => p.status === 'done').length,
    edits_last_7d: [...edits.values()].reduce((sum, n) => sum + n, 0),
    created_last_7d: created,
    deleted_last_7d: deleted,
    status_changes_last_7d: statusChanges,
    most_edited: mostEdited,
    planned_minutes_last_7d: minutesPerDay.reduce((sum, n) => sum + n, 0),
    planned_days_last_7d: minutesPerDay.filter((n) => n > 0).length,
    stagnant,
    top_by_composite: d.projects
      .filter((p) => p.status !== 'done')
      .sort((a, b) => b.score_composite - a.score_composite)
      .slice(0, 3)
      .map((p) => ({ project: label(p), composite: p.score_composite, status: p.status })),
    skill_gap_top: analyzeSkills(d.skills, d.projects)
      .gap.slice(0, 3)
      .map((g) => ({ skill: safeText(g.name, 60), demand: g.demand, status: g.status })),
  };
}

export function recommendationFacts(d: InsightData): Record<string, Json> {
  const candidates = d.projects
    .filter((p) => p.status !== 'done')
    .sort((a, b) => b.score_composite - a.score_composite || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((p) => {
      const gap = projectSkillGap(parseRequiredSkills(p.required_skills), d.skills);
      const ready = gap.filter((g) => g.status === 'met').length;
      return {
        project: label(p),
        status: p.status,
        composite: p.score_composite,
        scores: {
          monetisasi: p.score_monetisasi,
          engineering_complexity: p.score_engineering,
          infrastruktur: p.score_infrastruktur,
          skill_fit: p.score_skill_fit,
          strategic: p.score_strategic,
        },
        estimated_hours: p.estimated_time_hours,
        days_since_update: daysSince(p.updated_at, d.now),
        skills_ready: gap.length === 0 ? 'none listed' : `${ready}/${gap.length}`,
        missing_or_below_skills: gap
          .filter((g) => g.status !== 'met')
          .slice(0, 4)
          .map((g) => safeText(g.name, 60)),
      };
    });
  return {
    in_progress_count: d.projects.filter((p) => p.status === 'in_progress').length,
    candidates,
  };
}

export function skillGapFacts(d: InsightData): Record<string, Json> {
  const { skills, gap } = analyzeSkills(d.skills, d.projects);
  return {
    owned_skills: skills.length,
    open_projects: d.projects.filter((p) => p.status !== 'done').length,
    top_owned_by_demand: skills
      .filter((s) => s.demand > 0)
      .slice(0, 3)
      .map((s) => ({ skill: safeText(s.name, 60), level: s.level, demand: s.demand })),
    gap: gap.slice(0, 8).map((g) => ({
      skill: safeText(g.name, 60),
      demand: g.demand,
      required_level: g.required_level,
      current_level: g.current_level,
      status: g.status,
      estimated_hours: g.estimated_hours,
      has_learning_resource: g.learning_resource !== null,
    })),
  };
}

// ---------- prompts ----------

const SYSTEM_PROMPT = `You write short strategic insights about a solo founder's project portfolio.
Rules:
- Use ONLY the JSON facts provided. Never invent projects, skills, numbers or dates.
- Reply with ONE JSON object and nothing else: {"insights": ["...", "...", "..."]} with exactly 3 items.
- Each item is Indonesian, informal and direct (address the reader as "lo"), one or two short sentences, at most 240 characters, and contains a concrete number or a project/skill name from the facts.
- Say what to DO, not only what is happening.
- No greetings, no closing remarks, no filler, no markdown, no emojis, no em dashes.
- Never use the words delve, robust, leverage, seamless.`;

const TASKS: Record<InsightType, string> = {
  weekly_review:
    'Task: weekly review. Item 1: how active the week was (edits_last_7d, status_changes_last_7d, planned_minutes_last_7d). Item 2: which projects are stagnant. Item 3: one focus for next week. Activity means project edits, not finished work: never claim tasks were completed.',
  project_recommendation:
    'Task: recommend what to work on next. Item 1: the ONE focus project from candidates and why (composite, skills_ready, days_since_update). Item 2: a second option and when it makes sense. Item 3: one project to postpone or finish first. If in_progress_count is above 2, say too many are in progress.',
  skill_gap:
    'Task: skill gap. Name the 3 skills to learn first, ordered by demand, with required_level versus current_level. Give a realistic time when estimated_hours exists. Never include URLs.',
};

function factsFor(type: InsightType, d: InsightData): Record<string, Json> {
  if (type === 'weekly_review') return weeklyFacts(d);
  if (type === 'project_recommendation') return recommendationFacts(d);
  return skillGapFacts(d);
}

function buildMessages(type: InsightType, d: InsightData): ChatMessage[] {
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n${TASKS[type]}` },
    { role: 'user', content: JSON.stringify(factsFor(type, d)) },
  ];
}

export function parseInsightsOutput(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return outputError('expected a JSON object');
  }
  const list = (raw as Record<string, unknown>).insights;
  if (!Array.isArray(list)) return outputError('insights must be an array');
  const items = (list as unknown[])
    .filter((x): x is string => typeof x === 'string')
    .map((s) => clip(cleanLine(s), 400))
    .filter((s) => s.length >= 10);
  if (items.length < 3) return outputError('need 3 insights of at least 10 characters');
  return items.slice(0, 3);
}

// ---------- generation ----------

/** Fails before any model call (no quota used) when there is nothing to analyze. */
function assertEnoughData(type: InsightType, d: InsightData): void {
  if (type === 'skill_gap') {
    if (analyzeSkills(d.skills, d.projects).gap.length === 0) {
      throw new ApiError(422, 'no_data', 'No skill gap yet: add required_skills to open projects first');
    }
    return;
  }
  const relevant = type === 'weekly_review' ? d.projects : d.projects.filter((p) => p.status !== 'done');
  if (relevant.length === 0) throw new ApiError(422, 'no_data', 'Add at least one open project first');
}

export async function generateInsight(
  ctx: AuthContext,
  type: InsightType,
  data: InsightData,
): Promise<GeneratedInsight> {
  assertEnoughData(type, data);
  const result = await runAi(ctx, `ai/insights/${type}`, {
    messages: buildMessages(type, data),
    validate: parseInsightsOutput,
    temperature: 0.4,
    // [FIX] see the maxTokens comment in lib/ai/scoring.ts: room for the
    // reasoning model's thinking tokens, not just the 3 final sentences.
    maxTokens: 3072,
  });
  const items = result.value;
  const content = items.map((text, i) => `${i + 1}. ${text}`).join('\n');
  const row = unwrap(
    await ctx.supabase
      .from('insights')
      .insert({ user_id: ctx.userId, type, content })
      .select()
      .single(),
  );
  return { ...row, items };
}
