DROP POLICY IF EXISTS "vault_settings_family_read" ON public.vault_settings;
CREATE POLICY "vault_settings_family_read" ON public.vault_settings
FOR SELECT TO authenticated
USING (private.is_family_member(owner_id) AND private.is_vault_released(owner_id));