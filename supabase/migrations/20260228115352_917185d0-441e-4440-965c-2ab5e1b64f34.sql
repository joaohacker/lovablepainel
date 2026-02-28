
-- Atomic function to check concurrency limit and insert generation
-- Uses advisory lock to prevent race conditions
CREATE OR REPLACE FUNCTION public.try_start_generation(
  p_farm_id text,
  p_client_name text,
  p_credits_requested integer,
  p_status text DEFAULT 'waiting_invite',
  p_master_email text DEFAULT NULL,
  p_client_ip text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_client_token_id uuid DEFAULT NULL,
  p_token_id uuid DEFAULT NULL,
  p_max_concurrent integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_active_count integer;
  v_gen_id uuid;
  v_now timestamptz := now();
  v_ten_min_ago timestamptz := v_now - interval '10 minutes';
  v_twelve_min_ago timestamptz := v_now - interval '12 minutes';
  v_three_min_ago timestamptz := v_now - interval '3 minutes';
BEGIN
  -- Global advisory lock for generation concurrency control
  -- Using a fixed lock key so ALL generation requests serialize here
  PERFORM pg_advisory_xact_lock(7777777777);

  -- Count active generations (with ghost filtering)
  SELECT 
    (SELECT count(*) FROM generations WHERE status = 'running' AND updated_at >= v_ten_min_ago) +
    (SELECT count(*) FROM generations WHERE status = 'waiting_invite' AND created_at >= v_twelve_min_ago) +
    (SELECT count(*) FROM generations WHERE status = 'creating' AND created_at >= v_three_min_ago)
  INTO v_active_count;

  IF v_active_count >= p_max_concurrent THEN
    -- Queue it
    INSERT INTO generations (farm_id, client_name, credits_requested, status, master_email, client_ip, user_id, client_token_id, token_id)
    VALUES (p_farm_id, p_client_name, p_credits_requested, 'queued', p_master_email, p_client_ip, p_user_id, p_client_token_id, p_token_id)
    RETURNING id INTO v_gen_id;

    -- Calculate queue position
    RETURN jsonb_build_object(
      'queued', true,
      'generation_id', v_gen_id,
      'active_count', v_active_count,
      'queue_position', (SELECT count(*) FROM generations WHERE status = 'queued' AND created_at <= v_now)
    );
  END IF;

  -- Not queued - insert with requested status
  INSERT INTO generations (farm_id, client_name, credits_requested, status, master_email, client_ip, user_id, client_token_id, token_id)
  VALUES (p_farm_id, p_client_name, p_credits_requested, p_status, p_master_email, p_client_ip, p_user_id, p_client_token_id, p_token_id)
  RETURNING id INTO v_gen_id;

  RETURN jsonb_build_object(
    'queued', false,
    'generation_id', v_gen_id,
    'active_count', v_active_count
  );
END;
$$;
