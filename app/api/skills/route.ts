// app/api/skills/route.ts
import type { NextRequest } from 'next/server';
import { ok, readJson, unwrap, withAuth } from '@/lib/api';
import { analyzeSkills } from '@/lib/skills';
import {
  allowOnly,
  asObject,
  bad,
  optEnum,
  optNullableInt,
  optNullableText,
  optText,
} from '@/lib/validate';
import { SKILL_LEVELS } from '@/types/compass';

// GET /api/skills -> { skills: owned skills + demand, gap: top-10 skills to learn }
export async function GET(): Promise<Response> {
  return withAuth(async ({ supabase }) => {
    const [skillsRes, projectsRes] = await Promise.all([
      supabase.from('skills').select('*'),
      supabase.from('projects').select('required_skills,status'),
    ]);
    return ok(analyzeSkills(unwrap(skillsRes), unwrap(projectsRes)));
  });
}

// POST /api/skills { name, level?, category?, learning_resource?, estimated_hours? } -> 201
export async function POST(request: NextRequest): Promise<Response> {
  return withAuth(async ({ supabase, userId }) => {
    const o = asObject(await readJson(request));
    allowOnly(o, ['name', 'level', 'category', 'learning_resource', 'estimated_hours']);
    const name = optText(o, 'name', 80, 1);
    if (name === undefined) return bad('name', 'is required');

    const row = unwrap(
      await supabase
        .from('skills')
        .insert({
          user_id: userId,
          name,
          level: optEnum(o, 'level', SKILL_LEVELS),
          category: optNullableText(o, 'category', 60),
          learning_resource: optNullableText(o, 'learning_resource', 500),
          estimated_hours: optNullableInt(o, 'estimated_hours', 0, 10000),
        })
        .select()
        .single(),
    );
    return ok(row, undefined, 201);
  });
}
