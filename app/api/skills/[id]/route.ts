// app/api/skills/[id]/route.ts
// [NEW, gap-fill] Part 2 shipped GET/POST /api/skills but no way to edit or
// remove a skill afterwards (e.g. bumping a level as it improves). Mirrors
// the PATCH/DELETE shape of app/api/projects/[id]/route.ts.
import type { NextRequest } from 'next/server';
import { dbError, noContent, notFound, ok, readJson, withAuth } from '@/lib/api';
import {
  allowOnly,
  asObject,
  bad,
  hasChanges,
  optEnum,
  optNullableInt,
  optNullableText,
  optText,
  uuidParam,
} from '@/lib/validate';
import { SKILL_LEVELS } from '@/types/compass';

type RouteContext = { params: { id: string } };

const SKILL_FIELDS = ['name', 'level', 'category', 'learning_resource', 'estimated_hours'] as const;

// PATCH /api/skills/:id { name?, level?, category?, learning_resource?, estimated_hours? }
export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<Response> {
  return withAuth(async ({ supabase }) => {
    const id = uuidParam(params.id);
    const o = asObject(await readJson(request));
    allowOnly(o, SKILL_FIELDS);

    const name = optText(o, 'name', 80, 1);
    if (o.name !== undefined && name === undefined) return bad('name', 'must not be empty');
    const patch = {
      name,
      level: optEnum(o, 'level', SKILL_LEVELS),
      category: optNullableText(o, 'category', 60),
      learning_resource: optNullableText(o, 'learning_resource', 500),
      estimated_hours: optNullableInt(o, 'estimated_hours', 0, 10000),
    };
    if (!hasChanges(patch)) return bad('body', 'no fields to update');

    const { data, error } = await supabase.from('skills').update(patch).eq('id', id).select().maybeSingle();
    if (error) throw dbError(error);
    if (data === null) throw notFound('Skill');
    return ok(data);
  });
}

// DELETE /api/skills/:id -> 204
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  return withAuth(async ({ supabase }) => {
    const id = uuidParam(params.id);
    const { data, error } = await supabase.from('skills').delete().eq('id', id).select('id');
    if (error) throw dbError(error);
    if (data === null || data.length === 0) throw notFound('Skill');
    return noContent();
  });
}
