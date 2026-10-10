// types/compass.ts
// Domain types, API DTOs and the hand-written Supabase `Database` type.
// Row types are `type` aliases, not interfaces: supabase-js needs them to be
// assignable to Record<string, unknown>, which interfaces are not.
// Swap `Database` for `supabase gen types typescript` output when convenient.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export const PROJECT_STATUSES = ['backlog', 'next', 'in_progress', 'review', 'done'] as const;
export const SKILL_LEVELS = ['beginner', 'intermediate', 'expert'] as const;
export const INSIGHT_TYPES = ['weekly_review', 'project_recommendation', 'skill_gap'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export type InsightType = (typeof INSIGHT_TYPES)[number];

// ---------- table rows (mirror the SQL migration) ----------

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string | null;
  status: ProjectStatus;
  score_monetisasi: number;
  score_engineering: number;
  score_infrastruktur: number;
  score_skill_fit: number;
  score_strategic: number;
  score_composite: number; // owned by a DB trigger, read-only for clients
  tech_stack: Json | null;
  deploy_location: string | null;
  estimated_time_hours: number | null;
  required_skills: Json; // [{ name, level }], see RequiredSkill
  manfaat: string | null; // AES-256-GCM ciphertext
  risk_analysis: string | null; // AES-256-GCM ciphertext
  success_metric: string | null;
  created_at: string;
  updated_at: string;
};

export type SkillRow = {
  id: string;
  user_id: string;
  name: string;
  level: SkillLevel;
  category: string | null;
  learning_resource: string | null;
  estimated_hours: number | null;
  created_at: string;
};

export type ScheduleRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  blocks: Json; // ScheduleBlock[]
  ai_generated: boolean;
  created_at: string;
};

export type InsightRow = {
  id: string;
  user_id: string;
  type: InsightType;
  content: string;
  created_at: string;
};

export type ProfileRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
};

export type ScoringWeightsRow = {
  user_id: string;
  weight_monetisasi: number;
  weight_engineering: number;
  weight_infrastruktur: number;
  weight_skill_fit: number;
  weight_strategic: number;
  updated_at: string;
};

export type AiQueryLogRow = {
  id: string;
  user_id: string;
  endpoint: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  status: 'ok' | 'error' | 'rate_limited';
  created_at: string;
};

export type AuditLogRow = {
  id: number;
  user_id: string;
  table_name: string;
  row_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Json | null;
  new_data: Json | null;
  created_at: string;
};

// rate_limits is not listed: it is only reachable through the RPC below.

// ---------- Supabase Database type ----------

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
/** Insert shape: `Req` keys are mandatory, everything else is optional (DB defaults). */
type Insertable<Row, Req extends keyof Row = never> = Pick<Row, Req> & Partial<Omit<Row, Req>>;
type ComputedComposite = { score_composite?: never };
type ProjectInsert = Insertable<Omit<ProjectRow, 'score_composite'>, 'name'> & ComputedComposite;
type ProjectUpdate = Partial<Omit<ProjectRow, 'score_composite'>> & ComputedComposite;

export type Database = {
  public: {
    Tables: {
      projects: Table<ProjectRow, ProjectInsert, ProjectUpdate>;
      skills: Table<SkillRow, Insertable<SkillRow, 'name'>, Partial<SkillRow>>;
      daily_schedule: Table<ScheduleRow, Insertable<ScheduleRow, 'date'>, Partial<ScheduleRow>>;
      insights: Table<InsightRow, Insertable<InsightRow, 'type' | 'content'>, Partial<InsightRow>>;
      profiles: Table<ProfileRow, Insertable<ProfileRow>, Partial<ProfileRow>>;
      scoring_weights: Table<
        ScoringWeightsRow,
        Insertable<ScoringWeightsRow>,
        Partial<ScoringWeightsRow>
      >;
      ai_query_log: Table<AiQueryLogRow, Insertable<AiQueryLogRow, 'endpoint'>, Partial<AiQueryLogRow>>;
      audit_log: Table<AuditLogRow, Insertable<AuditLogRow>, Partial<AuditLogRow>>;
    };
    Views: { [_ in never]: never };
    Functions: {
      compass_recalc_user: { Args: { p_user_id: string }; Returns: number };
      compass_hit_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number };
        Returns: { allowed: boolean; remaining: number; reset_at: string }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

// ---------- API DTOs ----------

export type RequiredSkill = { name: string; level: SkillLevel };

/** ProjectRow with decoded skills and decrypted text fields. */
export type Project = Omit<ProjectRow, 'required_skills'> & { required_skills: RequiredSkill[] };
/** List view: the encrypted columns are left out. */
export type ProjectSummary = Omit<Project, 'manfaat' | 'risk_analysis'>;

/** Validated write payload. `undefined` means "field not sent". */
export type ProjectPatch = {
  name?: string;
  description?: string | null;
  category?: string | null;
  status?: ProjectStatus;
  score_monetisasi?: number;
  score_engineering?: number;
  score_infrastruktur?: number;
  score_skill_fit?: number;
  score_strategic?: number;
  tech_stack?: Json | null;
  deploy_location?: string | null;
  estimated_time_hours?: number | null;
  required_skills?: RequiredSkill[];
  manfaat?: string | null;
  risk_analysis?: string | null;
  success_metric?: string | null;
};
export type ProjectCreate = ProjectPatch & { name: string };

export type SkillGapItem = {
  name: string;
  required_level: SkillLevel;
  current_level: SkillLevel | null;
  status: 'met' | 'below' | 'missing';
};

export type SkillGapEntry = {
  name: string;
  demand: number; // active projects that need it
  required_level: SkillLevel; // highest level any of them asks for
  current_level: SkillLevel | null;
  status: 'below' | 'missing';
  learning_resource: string | null;
  estimated_hours: number | null;
};

export type SkillWithDemand = SkillRow & { demand: number };

export type ScheduleBlock = {
  time: string; // HH:MM, 24h
  duration_min: number;
  task: string;
  project_id?: string;
  skill_id?: string;
  type?: string; // e.g. "reflection"
};
export type Schedule = Omit<ScheduleRow, 'blocks'> & { blocks: ScheduleBlock[] };

export type Weights = {
  monetisasi: number;
  engineering: number;
  infrastruktur: number;
  skill_fit: number;
  strategic: number;
};

export const DEFAULT_WEIGHTS: Weights = {
  monetisasi: 0.25,
  engineering: 0.15,
  infrastruktur: 0.25,
  skill_fit: 0.15,
  strategic: 0.2,
};

export type ApiSuccess<T> = { data: T; meta?: Record<string, unknown> };
export type ApiFailure = { error: { code: string; message: string } };
