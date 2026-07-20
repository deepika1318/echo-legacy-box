
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.vault_items ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE public.vault_items ADD COLUMN IF NOT EXISTS search_text text;

CREATE INDEX IF NOT EXISTS vault_items_embedding_idx
  ON public.vault_items USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_vault_items(
  _owner uuid,
  query_embedding vector(1536),
  match_count int DEFAULT 12,
  min_similarity float DEFAULT 0.15
)
RETURNS TABLE (
  id uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vi.id, 1 - (vi.embedding <=> query_embedding) AS similarity
  FROM public.vault_items vi
  WHERE vi.owner_id = _owner
    AND vi.embedding IS NOT NULL
    AND (
      auth.uid() = _owner
      OR (
        public.is_vault_released(_owner)
        AND public.is_family_member(_owner)
        AND public.family_can_see_category(_owner, vi.item_type)
      )
    )
    AND 1 - (vi.embedding <=> query_embedding) > min_similarity
  ORDER BY vi.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_vault_items(uuid, vector, int, float) TO authenticated;
