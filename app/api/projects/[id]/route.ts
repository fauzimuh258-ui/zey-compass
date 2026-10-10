// app/api/projects/[id]/route.ts
import type { NextRequest } from 'next/server';
import { ApiError, dbError, noContent, notFound, ok, readJson, unwrap, withAuth } from '@/lib/api';
import { seal, toProject } from '@/lib/projects';
import { projectSkillGap } from '@/lib/skills';
import { hasChanges, parseProjectPatch, uuidParam } from '@/lib/validate';

type RouteContext = { params: { id: string } };

// GET /api/projects/:id -> decrypted project + skill gap against the user's skills
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  return withAuth(async ({ supabase }) => {
    const id = uuidParam(params.id);
    const [projectRes, skillsRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).maybeSingle(),
      supabase.from('skills').select('*'),
    ]);
    if (projectRes.error) throw dbError(projectRes.error);
    if (projectRes.data === null) throw notFound('Project');
    const project = toProject(projectRes.data);
    const skill_gap = projectSkillGap(project.required_skills, unwrap(skillsRes));
    return ok({ ...project, skill_gap });
  });
}

// PATCH /api/projects/:id -> partial update; the DB recomputes the composite
export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<Response> {
  return withAuth(async ({ supabase }) => {
    const id = uuidParam(params.id);
    const patch = parseProjectPatch(await readJson(request));
    if (!hasChanges(patch)) throw new ApiError(400, 'empty_patch', 'No fields to update');
    const { data, error } = await supabase
      .from('projects')
      .update(seal(patch))
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw dbError(error);
    if (data === null) throw notFound('Project');
    return ok(toProject(data));
  });
}

// DELETE /api/projects/:id -> 204
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  return withAuth(async ({ supabase }) => {
    const id = uuidParam(params.id);
    const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id');
    if (error) throw dbError(error);
    if (data === null || data.length === 0) throw notFound('Project');
    return noContent();
  });
}
