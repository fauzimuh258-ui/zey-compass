// lib/ai/scoring.ts
// AI-assisted scoring. The model only SUGGESTS: nothing is saved here. The
// composite is computed server-side (never asked from the model), so it always
// matches compass_composite() in the database.
import { dbError, notFound, unwrap, type AuthContext } from '@/lib/api';
import { outputError, type ChatMessage } from '@/lib/ai/client';
import { runAi } from '@/lib/ai/run';
import { cleanLine, safeText } from '@/lib/ai/text';
import { allowOnly, asObject, bad, parseProjectPatch, uuidParam } from '@/lib/validate';
import {
  DEFAULT_WEIGHTS,
  SKILL_LEVELS,
  type ProjectPatch,
  type ProjectRow,
  type RequiredSkill,
  type Weights,
} from '@/types/compass';

type Scores = Pick<
  ProjectRow,
  | 'score_monetisasi'
  | 'score_engineering'
  | 'score_infrastruktur'
  | 'score_skill_fit'
  | 'score_strategic'
>;

/**
 * Keys match ProjectPatch, so a suggestion can be applied with
 * PATCH /api/projects/:id (drop `reasoning` first).
 */
export type ScoringSuggestion = Scores & {
  reasoning: string;
  required_skills: RequiredSkill[];
  estimated_time_hours: number | null;
};

export type AnalyzeInput = {
  projectId: string | undefined;
  draft: Pick<ProjectPatch, 'name' | 'description' | 'category' | 'tech_stack' | 'deploy_location'>;
};

export type AnalyzeResult = {
  suggestion: ScoringSuggestion;
  composite_preview: number;
  weights: Weights;
  current: (Scores & { score_composite: number }) | null;
  model: string;
};

const SYSTEM_PROMPT = `You are a strategic analyst scoring ONE project idea for a solo founder.
Score five dimensions as integers from 0 to 100:
- score_monetisasi: revenue potential (0 = free forever, 100 = high revenue).
- score_engineering: technical complexity (0 = trivial, 100 = research-level). HIGHER MEANS HARDER.
- score_infrastruktur: contribution to the founder's own ecosystem (0 = standalone, 100 = critical shared infrastructure). Judge it against the "ecosystem" list.
- score_skill_fit: fit with the founder's CURRENT skills (0 = mostly new skills needed, 100 = skills already held). Judge it against "founder_skills".
- score_strategic: long-term impact over 3-5 years (0 = passing trend, 100 = decade-long foundation).
Also return required_skills (max 8 items {"name", "level"}, level = beginner|intermediate|expert as needed by the project) and estimated_time_hours (integer, realistic solo build time).
Rules:
- Use only the data provided. Never invent facts about the founder or the project.
- Reply with ONE JSON object and nothing else. Keys: score_monetisasi, score_engineering, score_infrastruktur, score_skill_fit, score_strategic, reasoning, required_skills, estimated_time_hours.
- reasoning: Indonesian, informal and direct, at most 3 short sentences naming the deciding factors and the weakest point. No greeting, no closing, no filler, no markdown, no em dashes. Never use the words delve, robust, leverage, seamless.`;

// ---------- input ----------

const ANALYZE_FIELDS = [
  'project_id',
  'name',
  'description',
  'category',
  'tech_stack',
  'deploy_location',
] as const;

/** { project_id } and/or draft fields. Draft fields override the saved project. */
export function parseAnalyzeInput(input: unknown): AnalyzeInput {
  const o = asObject(input);
  allowOnly(o, ANALYZE_FIELDS);
  const { project_id: rawId, ...fields } = o;

  let projectId: string | undefined;
  if (rawId !== undefined) {
    if (typeof rawId !== 'string') return bad('project_id', 'must be a UUID string');
    projectId = uuidParam(rawId);
  }
  const p = parseProjectPatch(fields);
  return {
    projectId,
    draft: {
      name: p.name,
      description: p.description,
      category: p.category,
      tech_stack: p.tech_stack,
      deploy_location: p.deploy_location,
    },
  };
}

// ---------- output ----------

const SCORE_KEYS = [
  'score_monetisasi',
  'score_engineering',
  'score_infrastruktur',
  'score_skill_fit',
  'score_strategic',
] as const;

export function parseScoringOutput(raw: unknown): ScoringSuggestion {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return outputError('expected a JSON object');
  }
  const o = raw as Record<string, unknown>;

  const scores: Scores = {
    score_monetisasi: 0,
    score_engineering: 0,
    score_infrastruktur: 0,
    score_skill_fit: 0,
    score_strategic: 0,
  };
  for (const key of SCORE_KEYS) {
    const v = o[key];
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) {
      return outputError(`${key} must be a number between 0 and 100`);
    }
    scores[key] = Math.round(n);
  }

  const reasoning = typeof o.reasoning === 'string' ? cleanLine(o.reasoning) : '';
  if (reasoning.length < 10) return outputError('reasoning is missing');

  const required: RequiredSkill[] = [];
  const seen = new Set<string>();
  const items = Array.isArray(o.required_skills) ? (o.required_skills as unknown[]) : [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const s = item as Record<string, unknown>;
    const name = typeof s.name === 'string' ? cleanLine(s.name).slice(0, 80) : '';
    const key = name.toLowerCase();
    if (name === '' || seen.has(key)) continue;
    seen.add(key);
    required.push({ name, level: SKILL_LEVELS.find((l) => l === s.level) ?? 'intermediate' });
    if (required.length === 8) break;
  }

  const hours = o.estimated_time_hours;
  const estimated =
    typeof hours === 'number' && Number.isFinite(hours) && hours >= 1
      ? Math.min(Math.round(hours), 100000)
      : null;

  return { ...scores, reasoning, required_skills: required, estimated_time_hours: estimated };
}

/** Same formula as SQL compass_composite(): engineering is inverted (100 - engineering). */
export function previewComposite(s: Scores, w: Weights): number {
  const milli = (x: number): number => Math.round(x * 1000); // integer math, no float drift
  const sum =
    s.score_monetisasi * milli(w.monetisasi) +
    (100 - s.score_engineering) * milli(w.engineering) +
    s.score_infrastruktur * milli(w.infrastruktur) +
    s.score_skill_fit * milli(w.skill_fit) +
    s.score_strategic * milli(w.strategic);
  return Math.round(sum / 10) / 100;
}

// ---------- orchestration ----------

async function loadWeights({ supabase, userId }: AuthContext): Promise<Weights> {
  const { data, error } = await supabase
    .from('scoring_weights')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw dbError(error);
  if (data === null) return DEFAULT_WEIGHTS;
  return {
    monetisasi: data.weight_monetisasi,
    engineering: data.weight_engineering,
    infrastruktur: data.weight_infrastruktur,
    skill_fit: data.weight_skill_fit,
    strategic: data.weight_strategic,
  };
}

const pick = <T>(override: T | undefined, base: T): T => (override === undefined ? base : override);

export async function analyzeProject(ctx: AuthContext, input: AnalyzeInput): Promise<AnalyzeResult> {
  const [skillsRes, projectsRes, weights] = await Promise.all([
    ctx.supabase.from('skills').select('*'),
    ctx.supabase.from('projects').select('*'),
    loadWeights(ctx),
  ]);
  const skills = unwrap(skillsRes);
  const projects = unwrap(projectsRes);

  const current =
    input.projectId === undefined ? undefined : projects.find((p) => p.id === input.projectId);
  if (input.projectId !== undefined && current === undefined) throw notFound('Project');

  const { draft } = input;
  const name = draft.name ?? current?.name;
  if (name === undefined) return bad('name', 'is required (or pass project_id)');
  const description = pick(draft.description, current?.description ?? null);
  const category = pick(draft.category, current?.category ?? null);
  const techStack = pick(draft.tech_stack, current?.tech_stack ?? null);
  const deployLocation = pick(draft.deploy_location, current?.deploy_location ?? null);

  // Only these fields leave the server, redacted. manfaat, risk_analysis and
  // success_metric are never sent.
  const facts = {
    project: {
      name: safeText(name, 120),
      description: safeText(description, 1200),
      category: safeText(category, 60),
      tech_stack: safeText(techStack === null ? '' : JSON.stringify(techStack), 400),
      deploy_location: safeText(deployLocation, 120),
    },
    founder_skills: skills
      .slice(0, 60)
      .map((s) => ({ name: safeText(s.name, 60), level: s.level })),
    ecosystem: [...projects]
      .filter((p) => p.id !== current?.id)
      .sort((a, b) => b.score_composite - a.score_composite)
      .slice(0, 30)
      .map((p) => ({
        name: safeText(p.name, 80),
        category: safeText(p.category, 40),
        status: p.status,
        summary: safeText(p.description, 140),
      })),
  };

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(facts) },
  ];
  const result = await runAi(ctx, 'ai/analyze', {
    messages,
    validate: parseScoringOutput,
    temperature: 0.2,
    // [FIX] 900 was sized for a plain instruct model. The default model is now
    // a reasoning model (see lib/ai/client.ts); its thinking tokens count
    // against this ceiling, so it needs more headroom or the JSON gets cut off.
    maxTokens: 4096,
  });

  return {
    suggestion: result.value,
    composite_preview: previewComposite(result.value, weights),
    weights,
    current:
      current === undefined
        ? null
        : {
            score_monetisasi: current.score_monetisasi,
            score_engineering: current.score_engineering,
            score_infrastruktur: current.score_infrastruktur,
            score_skill_fit: current.score_skill_fit,
            score_strategic: current.score_strategic,
            score_composite: current.score_composite,
          },
    model: `${result.provider}/${result.model}`,
  };
}
