
-- 1) trusted_contacts
CREATE TABLE public.trusted_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  contact_email text NOT NULL,
  full_name text,
  relationship text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, contact_email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_contacts TO authenticated;
GRANT ALL ON public.trusted_contacts TO service_role;
ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tc_owner_all ON public.trusted_contacts FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY tc_self_read ON public.trusted_contacts FOR SELECT TO authenticated
  USING (lower(contact_email) = lower(COALESCE(auth.jwt()->>'email','')));

-- 2) release_approvals
CREATE TABLE public.release_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  contact_email text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, contact_email)
);
GRANT SELECT, INSERT, DELETE ON public.release_approvals TO authenticated;
GRANT ALL ON public.release_approvals TO service_role;
ALTER TABLE public.release_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY ra_owner_read ON public.release_approvals FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);
CREATE POLICY ra_contact_read ON public.release_approvals FOR SELECT TO authenticated
  USING (lower(contact_email) = lower(COALESCE(auth.jwt()->>'email','')));
CREATE POLICY ra_contact_insert ON public.release_approvals FOR INSERT TO authenticated
  WITH CHECK (
    lower(contact_email) = lower(COALESCE(auth.jwt()->>'email','')) AND
    EXISTS (
      SELECT 1 FROM public.trusted_contacts tc
      WHERE tc.owner_id = release_approvals.owner_id
        AND lower(tc.contact_email) = lower(release_approvals.contact_email)
    )
  );
CREATE POLICY ra_contact_delete ON public.release_approvals FOR DELETE TO authenticated
  USING (lower(contact_email) = lower(COALESCE(auth.jwt()->>'email','')));

-- 3) death_certificates
CREATE TABLE public.death_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  uploader_email text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.death_certificates TO authenticated;
GRANT ALL ON public.death_certificates TO service_role;
ALTER TABLE public.death_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY dc_owner_read ON public.death_certificates FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);
CREATE POLICY dc_owner_update ON public.death_certificates FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY dc_uploader_read ON public.death_certificates FOR SELECT TO authenticated
  USING (lower(uploader_email) = lower(COALESCE(auth.jwt()->>'email','')));
CREATE POLICY dc_uploader_insert ON public.death_certificates FOR INSERT TO authenticated
  WITH CHECK (
    lower(uploader_email) = lower(COALESCE(auth.jwt()->>'email','')) AND
    (
      public.is_family_member(owner_id) OR EXISTS (
        SELECT 1 FROM public.trusted_contacts tc
        WHERE tc.owner_id = death_certificates.owner_id
          AND lower(tc.contact_email) = lower(COALESCE(auth.jwt()->>'email',''))
      )
    )
  );

-- 4) per-category permissions on family_members
ALTER TABLE public.family_members
  ADD COLUMN allow_photo boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_video boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_file boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_certificate boolean NOT NULL DEFAULT false,
  ADD COLUMN allow_note boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_voice boolean NOT NULL DEFAULT true;

-- 5) required_approvals on vault_settings
ALTER TABLE public.vault_settings
  ADD COLUMN required_approvals int NOT NULL DEFAULT 1 CHECK (required_approvals >= 1);

-- 6) encryption metadata on vault_items
ALTER TABLE public.vault_items
  ADD COLUMN is_sensitive boolean NOT NULL DEFAULT false,
  ADD COLUMN is_encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN encrypted_transcript text,
  ADD COLUMN encrypted_description text;

-- 7) updated is_vault_released with quorum + approved certificate
CREATE OR REPLACE FUNCTION public.is_vault_released(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- 8) per-category read guard for family
CREATE OR REPLACE FUNCTION public.family_can_see_category(_owner uuid, _type public.item_type)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- 9) tighten vault_items family read with category permission
DROP POLICY IF EXISTS vault_items_family_read ON public.vault_items;
CREATE POLICY vault_items_family_read ON public.vault_items FOR SELECT
  USING (
    public.is_family_member(owner_id)
    AND public.is_vault_released(owner_id)
    AND public.family_can_see_category(owner_id, item_type)
  );

-- 10) storage policies for certificate uploads under vault/certificates/{owner_id}/
CREATE POLICY vault_cert_family_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vault'
    AND (storage.foldername(name))[1] = 'certificates'
    AND (
      public.is_family_member(((storage.foldername(name))[2])::uuid)
      OR EXISTS (
        SELECT 1 FROM public.trusted_contacts tc
        WHERE tc.owner_id = ((storage.foldername(name))[2])::uuid
          AND lower(tc.contact_email) = lower(COALESCE(auth.jwt()->>'email',''))
      )
    )
  );
CREATE POLICY vault_cert_owner_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vault'
    AND (storage.foldername(name))[1] = 'certificates'
    AND ((storage.foldername(name))[2])::uuid = auth.uid()
  );
CREATE POLICY vault_cert_uploader_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vault'
    AND (storage.foldername(name))[1] = 'certificates'
    AND owner = auth.uid()
  );
