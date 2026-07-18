
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Vault settings per owner (legacy unlock config)
CREATE TABLE public.vault_settings (
  owner_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  is_released BOOLEAN NOT NULL DEFAULT false,
  released_at TIMESTAMPTZ,
  last_checkin_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  inactivity_days INTEGER NOT NULL DEFAULT 90,
  memorial_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_settings TO authenticated;
GRANT ALL ON public.vault_settings TO service_role;
ALTER TABLE public.vault_settings ENABLE ROW LEVEL SECURITY;

-- Family members (invited by email)
CREATE TABLE public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  family_email TEXT NOT NULL,
  full_name TEXT,
  relationship TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, family_email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_family_email ON public.family_members (family_email);

-- Vault items
CREATE TYPE public.item_type AS ENUM ('photo','video','file','certificate','note','voice');
CREATE TABLE public.vault_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  item_type public.item_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  storage_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  transcript TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_items TO authenticated;
GRANT ALL ON public.vault_items TO service_role;
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_vault_items_owner ON public.vault_items (owner_id, created_at DESC);

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.is_vault_released(_owner UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vault_settings vs
    WHERE vs.owner_id = _owner
      AND (vs.is_released = true
           OR now() - vs.last_checkin_at > (vs.inactivity_days || ' days')::interval)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_family_member(_owner UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.owner_id = _owner
      AND lower(fm.family_email) = lower(coalesce(auth.jwt()->>'email',''))
  );
$$;

-- Profiles policies
CREATE POLICY "profiles_self_all" ON public.profiles FOR ALL
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_family_read" ON public.profiles FOR SELECT
  USING (public.is_family_member(id));

-- Vault settings policies
CREATE POLICY "vault_settings_owner_all" ON public.vault_settings FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "vault_settings_family_read" ON public.vault_settings FOR SELECT
  USING (public.is_family_member(owner_id));

-- Family members policies
CREATE POLICY "family_members_owner_all" ON public.family_members FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "family_members_self_read" ON public.family_members FOR SELECT
  USING (lower(family_email) = lower(coalesce(auth.jwt()->>'email','')));

-- Vault items policies
CREATE POLICY "vault_items_owner_all" ON public.vault_items FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "vault_items_family_read" ON public.vault_items FOR SELECT
  USING (public.is_family_member(owner_id) AND public.is_vault_released(owner_id));

-- Auto-create profile + vault_settings on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.vault_settings (owner_id)
  VALUES (NEW.id)
  ON CONFLICT (owner_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER vault_settings_touch BEFORE UPDATE ON public.vault_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage bucket policies (bucket created via tool)
CREATE POLICY "vault_owner_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'vault' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vault_owner_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vault' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vault_owner_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'vault' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vault_owner_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'vault' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vault_family_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'vault'
    AND public.is_family_member(((storage.foldername(name))[1])::uuid)
    AND public.is_vault_released(((storage.foldername(name))[1])::uuid)
  );
