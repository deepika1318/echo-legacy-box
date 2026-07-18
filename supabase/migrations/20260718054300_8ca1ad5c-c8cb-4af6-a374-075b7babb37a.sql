
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.is_vault_released(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_family_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_vault_released(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_member(UUID) TO authenticated;
