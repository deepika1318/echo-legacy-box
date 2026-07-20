
-- Create private schema for internal helpers
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_family_member(_owner uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.owner_id = _owner
      AND lower(fm.family_email) = lower(coalesce(auth.jwt()->>'email',''))
  );
$$;

CREATE OR REPLACE FUNCTION private.is_vault_released(_owner uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vault_settings vs
    WHERE vs.owner_id = _owner
      AND (
        vs.is_released = true
        OR (
          now() - vs.last_checkin_at > (vs.inactivity_days || ' days')::interval
          AND (SELECT count(*) FROM public.release_approvals ra WHERE ra.owner_id = _owner) >= vs.required_approvals
        )
        OR EXISTS (
          SELECT 1 FROM public.death_certificates dc
          WHERE dc.owner_id = _owner AND dc.status = 'approved'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.family_can_see_category(_owner uuid, _type public.item_type)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.owner_id = _owner
      AND lower(fm.family_email) = lower(COALESCE(auth.jwt()->>'email',''))
      AND CASE _type
        WHEN 'photo'::public.item_type THEN fm.allow_photo
        WHEN 'video'::public.item_type THEN fm.allow_video
        WHEN 'file'::public.item_type THEN fm.allow_file
        WHEN 'certificate'::public.item_type THEN fm.allow_certificate
        WHEN 'note'::public.item_type THEN fm.allow_note
        WHEN 'voice'::public.item_type THEN fm.allow_voice
        ELSE false
      END
  );
$$;

REVOKE ALL ON FUNCTION private.is_family_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_vault_released(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.family_can_see_category(uuid, public.item_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_family_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_vault_released(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.family_can_see_category(uuid, public.item_type) TO authenticated, service_role;

-- Public-schema policies
DROP POLICY IF EXISTS profiles_family_read ON public.profiles;
CREATE POLICY profiles_family_read ON public.profiles
  FOR SELECT TO authenticated
  USING (private.is_family_member(id));

DROP POLICY IF EXISTS vault_settings_family_read ON public.vault_settings;
CREATE POLICY vault_settings_family_read ON public.vault_settings
  FOR SELECT TO authenticated
  USING (private.is_family_member(owner_id));

DROP POLICY IF EXISTS dc_uploader_insert ON public.death_certificates;
CREATE POLICY dc_uploader_insert ON public.death_certificates
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(uploader_email) = lower(COALESCE(auth.jwt()->>'email', ''))
    AND (
      private.is_family_member(owner_id)
      OR EXISTS (
        SELECT 1 FROM public.trusted_contacts tc
        WHERE tc.owner_id = death_certificates.owner_id
          AND lower(tc.contact_email) = lower(COALESCE(auth.jwt()->>'email', ''))
      )
    )
  );

DROP POLICY IF EXISTS vault_items_family_read ON public.vault_items;
CREATE POLICY vault_items_family_read ON public.vault_items
  FOR SELECT TO authenticated
  USING (
    private.is_family_member(owner_id)
    AND private.is_vault_released(owner_id)
    AND private.family_can_see_category(owner_id, item_type)
  );

-- Storage policies
DROP POLICY IF EXISTS vault_family_read ON storage.objects;
CREATE POLICY vault_family_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'vault'
    AND private.is_family_member(((storage.foldername(name))[1])::uuid)
    AND private.is_vault_released(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS vault_cert_family_insert ON storage.objects;
CREATE POLICY vault_cert_family_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vault'
    AND (storage.foldername(name))[1] = 'certificates'
    AND (
      private.is_family_member(((storage.foldername(name))[2])::uuid)
      OR EXISTS (
        SELECT 1 FROM public.trusted_contacts tc
        WHERE tc.owner_id = ((storage.foldername(objects.name))[2])::uuid
          AND lower(tc.contact_email) = lower(COALESCE(auth.jwt()->>'email', ''))
      )
    )
  );

-- Drop old public helpers
DROP FUNCTION IF EXISTS public.is_family_member(uuid);
DROP FUNCTION IF EXISTS public.is_vault_released(uuid);
DROP FUNCTION IF EXISTS public.family_can_see_category(uuid, public.item_type);

-- Convert match_vault_items to SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.match_vault_items(
  _owner uuid,
  query_embedding vector,
  match_count integer DEFAULT 12,
  min_similarity double precision DEFAULT 0.15
)
RETURNS TABLE(id uuid, similarity double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, private
AS $$
  SELECT vi.id, 1 - (vi.embedding <=> query_embedding) AS similarity
  FROM public.vault_items vi
  WHERE vi.owner_id = _owner
    AND vi.embedding IS NOT NULL
    AND 1 - (vi.embedding <=> query_embedding) > min_similarity
  ORDER BY vi.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.match_vault_items(uuid, vector, integer, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_vault_items(uuid, vector, integer, double precision) TO authenticated, service_role;

-- Lock down trigger-only function
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
