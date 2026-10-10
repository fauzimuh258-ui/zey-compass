-- supabase/migrations/20260920000000_init.sql
-- Zey Compass, Part 1 v2: schema + RLS. Replaces v1 entirely.
-- Tags: [SPEC] verbatim from spec, [FIX] spec bug corrected,
--       [ASSUMPTION] my addition, [v2] new or changed in v2.
-- NOTE: table names are generic. If this Supabase project is
-- shared with another app, check for name collisions first.
-- Already ran v1? Reset first (destroys its data):
--   DROP TABLE IF EXISTS public.audit_log, public.ai_query_log,
--     public.insights, public.daily_schedule, public.skills,
--     public.projects CASCADE;
--   DROP FUNCTION IF EXISTS public.compass_set_updated_at(),
--     public.compass_log_project_change() CASCADE;

BEGIN;

-- [v2] updated_at moves only on real edits. A composite-only
-- change (weights recalculation) is not activity, and the
-- "stagnant projects" insight depends on that.
CREATE FUNCTION public.compass_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'score_composite' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'score_composite' - 'updated_at') THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- ========== [v2] profiles ==========

CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name TEXT CHECK (char_length(display_name) <= 80),
  avatar_url TEXT CHECK (
    avatar_url ~* '^https?://' AND char_length(avatar_url) <= 2048
  ),
  bio TEXT CHECK (char_length(bio) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.compass_set_updated_at();

-- ========== [v2] scoring_weights ==========
-- One row per user. Column defaults are the spec weights.

CREATE TABLE public.scoring_weights (
  user_id UUID PRIMARY KEY DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE,
  weight_monetisasi NUMERIC(4, 3) NOT NULL DEFAULT 0.25
    CHECK (weight_monetisasi BETWEEN 0 AND 1),
  weight_engineering NUMERIC(4, 3) NOT NULL DEFAULT 0.15
    CHECK (weight_engineering BETWEEN 0 AND 1),
  weight_infrastruktur NUMERIC(4, 3) NOT NULL DEFAULT 0.25
    CHECK (weight_infrastruktur BETWEEN 0 AND 1),
  weight_skill_fit NUMERIC(4, 3) NOT NULL DEFAULT 0.15
    CHECK (weight_skill_fit BETWEEN 0 AND 1),
  weight_strategic NUMERIC(4, 3) NOT NULL DEFAULT 0.20
    CHECK (weight_strategic BETWEEN 0 AND 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- [ASSUMPTION] weighted average, so the weights must sum to 1
  CONSTRAINT scoring_weights_sum_is_1 CHECK (
    weight_monetisasi + weight_engineering + weight_infrastruktur
    + weight_skill_fit + weight_strategic = 1
  )
);

CREATE TRIGGER scoring_weights_set_updated_at
  BEFORE UPDATE ON public.scoring_weights
  FOR EACH ROW EXECUTE FUNCTION public.compass_set_updated_at();

-- [v2] Single source of truth for the formula.
-- Engineering is INVERTED: (100 - engineering), so a harder
-- project scores lower. No weights row yet = spec defaults.
CREATE FUNCTION public.compass_composite(
  p_user_id UUID,
  p_monetisasi INTEGER,
  p_engineering INTEGER,
  p_infrastruktur INTEGER,
  p_skill_fit INTEGER,
  p_strategic INTEGER
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    p_monetisasi * COALESCE(w.weight_monetisasi, 0.25)
    + (100 - p_engineering) * COALESCE(w.weight_engineering, 0.15)
    + p_infrastruktur * COALESCE(w.weight_infrastruktur, 0.25)
    + p_skill_fit * COALESCE(w.weight_skill_fit, 0.15)
    + p_strategic * COALESCE(w.weight_strategic, 0.20)
  FROM (VALUES (1)) AS d (x)
  LEFT JOIN public.scoring_weights AS w ON w.user_id = p_user_id
$$;

-- ========== projects ==========

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- [FIX] NOT NULL + default, so clients can omit user_id
  user_id UUID NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  -- [ASSUMPTION] values mirror the kanban columns
  status TEXT NOT NULL DEFAULT 'backlog'
    CHECK (status IN
      ('backlog', 'next', 'in_progress', 'review', 'done')),

  -- [FIX] scores are NOT NULL and limited to 0-100
  score_monetisasi INTEGER NOT NULL DEFAULT 0
    CHECK (score_monetisasi BETWEEN 0 AND 100),
  score_engineering INTEGER NOT NULL DEFAULT 0
    CHECK (score_engineering BETWEEN 0 AND 100),
  score_infrastruktur INTEGER NOT NULL DEFAULT 0
    CHECK (score_infrastruktur BETWEEN 0 AND 100),
  score_skill_fit INTEGER NOT NULL DEFAULT 0
    CHECK (score_skill_fit BETWEEN 0 AND 100),
  score_strategic INTEGER NOT NULL DEFAULT 0
    CHECK (score_strategic BETWEEN 0 AND 100),
  -- [v2] plain column instead of GENERATED (weights are per user
  -- now). The trigger below owns it and overwrites client values.
  score_composite NUMERIC(5, 2) NOT NULL DEFAULT 0,

  tech_stack JSONB,
  deploy_location TEXT,
  estimated_time_hours INTEGER
    CHECK (estimated_time_hours >= 0),
  -- [ASSUMPTION] shape: [{"name": "Rust", "level": "intermediate"}]
  required_skills JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(required_skills) = 'array'),
  -- [ASSUMPTION] AES-256-GCM ciphertext, encrypted app-side
  manfaat TEXT,
  risk_analysis TEXT,
  success_metric TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE FUNCTION public.compass_apply_composite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.score_composite := public.compass_composite(
    NEW.user_id, NEW.score_monetisasi, NEW.score_engineering,
    NEW.score_infrastruktur, NEW.score_skill_fit, NEW.score_strategic
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_apply_composite
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.compass_apply_composite();

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.compass_set_updated_at();

-- [FIX] index user_id for RLS; also serves the list sort
CREATE INDEX projects_user_composite_idx
  ON public.projects (user_id, score_composite DESC);
CREATE INDEX projects_user_status_idx
  ON public.projects (user_id, status);

-- [v2] Recomputes every project of one user (RLS applies).
CREATE FUNCTION public.compass_recalc_user(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.projects AS p
  SET score_composite = public.compass_composite(
    p.user_id, p.score_monetisasi, p.score_engineering,
    p.score_infrastruktur, p.score_skill_fit, p.score_strategic
  )
  WHERE p.user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- [v2] Weights changed -> recompute that user's projects
CREATE FUNCTION public.compass_recalc_on_weights()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM public.compass_recalc_user(NEW.user_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER scoring_weights_recalc
  AFTER INSERT OR UPDATE OF
    weight_monetisasi, weight_engineering, weight_infrastruktur,
    weight_skill_fit, weight_strategic
  ON public.scoring_weights
  FOR EACH ROW EXECUTE FUNCTION public.compass_recalc_on_weights();

-- ========== skills ==========

CREATE TABLE public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'beginner'
    CHECK (level IN ('beginner', 'intermediate', 'expert')),
  category TEXT,
  learning_resource TEXT,
  estimated_hours INTEGER CHECK (estimated_hours >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [ASSUMPTION] one row per skill name per user,
-- case-insensitive. Also indexes user_id.
CREATE UNIQUE INDEX skills_user_name_uidx
  ON public.skills (user_id, lower(name));

-- ========== daily_schedule ==========

CREATE TABLE public.daily_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE,
  date DATE NOT NULL,
  -- [{ "time": "08:00", "duration_min": 90,
  --    "task": "...", "project_id": "..." }]
  -- [FIX] spec mixed duration_min and duration. Standardized
  -- on duration_min; Part 3 must emit the same key.
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(blocks) = 'array'),
  ai_generated BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- [FIX] one row per day (the API upserts on this)
  UNIQUE (user_id, date)
);

-- ========== insights ==========

CREATE TABLE public.insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN
    ('weekly_review', 'project_recommendation', 'skill_gap')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX insights_user_created_idx
  ON public.insights (user_id, created_at DESC);

-- ===== [ASSUMPTION] security tables (spec: Security) =====

-- Spec wants "log all AI queries" AND "AI must not log personal
-- data". Resolved: metadata only, never prompt or response text.
CREATE TABLE public.ai_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'error', 'rate_limited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ai_query_log_user_created_idx
  ON public.ai_query_log (user_id, created_at DESC);

-- Project changes only, written by trigger. Snapshots drop
-- the sensitive columns (manfaat, risk_analysis).
CREATE TABLE public.audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  row_id UUID NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_log_user_created_idx
  ON public.audit_log (user_id, created_at DESC);

CREATE FUNCTION public.compass_log_project_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_strip CONSTANT text[] := ARRAY['manfaat', 'risk_analysis'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log
      (user_id, table_name, row_id, action, new_data)
    VALUES
      (NEW.user_id, TG_TABLE_NAME, NEW.id, TG_OP,
       to_jsonb(NEW) - v_strip);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- [v2] skip derived-only changes (weights recalculation)
    IF (to_jsonb(NEW) - 'score_composite' - 'updated_at')
       IS NOT DISTINCT FROM
       (to_jsonb(OLD) - 'score_composite' - 'updated_at') THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.audit_log
      (user_id, table_name, row_id, action, old_data, new_data)
    VALUES
      (NEW.user_id, TG_TABLE_NAME, NEW.id, TG_OP,
       to_jsonb(OLD) - v_strip, to_jsonb(NEW) - v_strip);
    RETURN NEW;
  END IF;

  -- DELETE: skip when the owner is already gone (account
  -- deletion cascade), else the FK to auth.users would block it
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
    INSERT INTO public.audit_log
      (user_id, table_name, row_id, action, old_data)
    VALUES
      (OLD.user_id, TG_TABLE_NAME, OLD.id, TG_OP,
       to_jsonb(OLD) - v_strip);
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER projects_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.compass_log_project_change();

REVOKE EXECUTE ON FUNCTION public.compass_log_project_change()
  FROM PUBLIC, anon, authenticated;

-- ========== [v2] rate_limits ==========
-- Fixed-window counters, written only by compass_hit_rate_limit().
-- [ASSUMPTION] bucket added so each endpoint group limits itself.
-- The primary key doubles as UNIQUE (user_id, bucket, window_start).

CREATE TABLE public.rate_limits (
  user_id UUID NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  bucket TEXT NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 64),
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  PRIMARY KEY (user_id, bucket, window_start)
);

-- Atomic increment. SECURITY DEFINER because users must not be
-- able to reset their own counters.
CREATE FUNCTION public.compass_hit_rate_limit(
  p_bucket TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_window TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_bucket IS NULL OR char_length(p_bucket) NOT BETWEEN 1 AND 64
     OR p_limit < 1 OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'invalid rate limit arguments'
      USING ERRCODE = '22023';
  END IF;

  v_window := date_bin(
    make_interval(secs => p_window_seconds), now(), TIMESTAMPTZ 'epoch'
  );

  -- drop this bucket's finished windows
  DELETE FROM public.rate_limits AS r
  WHERE r.user_id = v_uid
    AND r.bucket = p_bucket
    AND r.window_start < v_window;

  INSERT INTO public.rate_limits AS r (user_id, bucket, window_start)
  VALUES (v_uid, p_bucket, v_window)
  ON CONFLICT (user_id, bucket, window_start)
  DO UPDATE SET count = r.count + 1
  RETURNING r.count INTO v_count;

  RETURN QUERY SELECT
    v_count <= p_limit,
    GREATEST(p_limit - v_count, 0),
    v_window + make_interval(secs => p_window_seconds);
END;
$$;

-- ========== [v2] new-user seed ==========
-- New signups get a profile and default weights. A failure here
-- is logged as a warning and never blocks the signup itself.
CREATE FUNCTION public.compass_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_avatar TEXT;
BEGIN
  v_avatar := NEW.raw_user_meta_data ->> 'avatar_url';

  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    left(COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1)
    ), 80),
    CASE
      WHEN v_avatar ~* '^https?://' AND char_length(v_avatar) <= 2048
      THEN v_avatar
    END
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.scoring_weights (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'compass_handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER compass_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.compass_handle_new_user();

REVOKE EXECUTE ON FUNCTION public.compass_handle_new_user()
  FROM PUBLIC, anon, authenticated;

-- ========== RLS ==========

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_query_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- rate_limits: RLS on, no policies. Only the RPC touches it.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- [FIX] role-scoped, explicit WITH CHECK, and (SELECT auth.uid())
-- so it is evaluated once per query instead of once per row
CREATE POLICY user_own_profiles ON public.profiles
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_own_weights ON public.scoring_weights
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_own_projects ON public.projects
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_own_skills ON public.skills
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_own_schedule ON public.daily_schedule
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_own_insights ON public.insights
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- [ASSUMPTION] users read + append their own AI log rows,
-- never edit or delete them
CREATE POLICY user_read_ai_query_log ON public.ai_query_log
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY user_insert_ai_query_log ON public.ai_query_log
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- [ASSUMPTION] audit log is read-only for users
CREATE POLICY user_read_audit_log ON public.audit_log
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ========== grants ==========
-- [FIX] explicit least privilege, independent of project defaults
REVOKE ALL ON public.profiles, public.scoring_weights,
  public.projects, public.skills, public.daily_schedule,
  public.insights, public.ai_query_log, public.audit_log,
  public.rate_limits
  FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.profiles, public.scoring_weights, public.projects,
     public.skills, public.daily_schedule, public.insights
  TO authenticated;
GRANT SELECT, INSERT ON public.ai_query_log TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

GRANT ALL ON public.profiles, public.scoring_weights,
  public.projects, public.skills, public.daily_schedule,
  public.insights, public.ai_query_log, public.audit_log,
  public.rate_limits
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.compass_hit_rate_limit(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compass_hit_rate_limit(TEXT, INTEGER, INTEGER)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.compass_recalc_user(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compass_recalc_user(UUID)
  TO authenticated, service_role;

-- ========== [v2] seed existing users ==========
-- Default weights (0.25 / 0.15 / 0.25 / 0.15 / 0.20) come from
-- the column defaults. New signups use the trigger above.
INSERT INTO public.profiles (user_id, display_name)
SELECT id, left(split_part(email, '@', 1), 80) FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.scoring_weights (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
