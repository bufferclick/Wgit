-- Supabase's API role enables pg_safeupdate, which rejects DELETE without a
-- WHERE clause even inside a SECURITY DEFINER function. The predicates match
-- every row in the explicitly selected categories (all keys are NOT NULL).
create or replace function public.community_wipe_v2(p_categories text[])
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, community_private as $$
declare result jsonb := '{}'::jsonb; n bigint; m bigint;
begin
  if p_categories is null or cardinality(p_categories) = 0 or exists(select 1 from unnest(p_categories) x where x is null or x not in ('posts','votes','bans','limits')) then raise exception 'Invalid selection'; end if;
  if 'posts' = any(p_categories) then delete from public.community_posts where id is not null; get diagnostics n = row_count; result := result || jsonb_build_object('posts', n); end if;
  if 'votes' = any(p_categories) then delete from public.release_votes where release_id is not null; get diagnostics n = row_count; result := result || jsonb_build_object('votes', n); end if;
  if 'bans' = any(p_categories) then delete from public.community_bans where github_id is not null; get diagnostics n = row_count; result := result || jsonb_build_object('bans', n); end if;
  if 'limits' = any(p_categories) then
    delete from community_private.post_limits where fingerprint is not null; get diagnostics n = row_count;
    delete from community_private.user_limits where github_id is not null; get diagnostics m = row_count;
    result := result || jsonb_build_object('limits', n + m);
  end if;
  return result;
end $$;
