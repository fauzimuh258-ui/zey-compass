// app/(dashboard)/projects/[id]/page.tsx
import { notFound } from 'next/navigation';
import { ProjectDetailView } from '@/components/projects/ProjectDetailView';
import { toProject } from '@/lib/projects';
import { projectSkillGap } from '@/lib/skills';
import { createClient } from '@/lib/supabase/server';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [projectRes, skillsRes] = await Promise.all([
    supabase.from('projects').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('skills').select('*'),
  ]);

  if (projectRes.error || projectRes.data === null) notFound();

  const project = toProject(projectRes.data);
  const skills = skillsRes.data ?? [];

  return <ProjectDetailView project={project} skills={skills} initialSkillGap={projectSkillGap(project.required_skills, skills)} />;
}
