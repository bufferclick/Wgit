-- Delete the selected app data in one transaction and return actual row counts.
-- Auth accounts remain a separate operation performed through Auth's admin API.
create function public.community_wipe_v2(p_categories text[])
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, community_private as $$
declare result jsonb := '{}'::jsonb; n bigint; m bigint;
begin
  if p_categories is null or cardinality(p_categories) = 0 or exists(select 1 from unnest(p_categories) x where x is null or x not in ('posts','votes','bans','limits')) then raise exception 'Invalid selection'; end if;
  if 'posts' = any(p_categories) then delete from public.community_posts; get diagnostics n = row_count; result := result || jsonb_build_object('posts', n); end if;
  if 'votes' = any(p_categories) then delete from public.release_votes; get diagnostics n = row_count; result := result || jsonb_build_object('votes', n); end if;
  if 'bans' = any(p_categories) then delete from public.community_bans; get diagnostics n = row_count; result := result || jsonb_build_object('bans', n); end if;
  if 'limits' = any(p_categories) then
    delete from community_private.post_limits; get diagnostics n = row_count;
    delete from community_private.user_limits; get diagnostics m = row_count;
    result := result || jsonb_build_object('limits', n + m);
  end if;
  return result;
end $$;
revoke all on function public.community_wipe_v2(text[]) from public, anon, authenticated;
grant execute on function public.community_wipe_v2(text[]) to service_role;
