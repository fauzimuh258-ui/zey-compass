// app/(dashboard)/insights/page.tsx
import { InsightsView } from '@/components/insights/InsightsView';
import { createClient } from '@/lib/supabase/server';

export default async function InsightsPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from('insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  return <InsightsView initialInsights={data ?? []} />;
}
