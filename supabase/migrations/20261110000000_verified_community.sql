-- These tables/functions are only accessible through the server-side Edge Function.
alter table public.community_posts add column github_id text;
create table public.community_bans (github_id text primary key, github_login text not null unique, created_at timestamptz not null default now());
create table public.release_votes (release_id text not null, github_id text not null, direction smallint not null check (direction in (-1, 1)), primary key (release_id, github_id));
create table community_private.user_limits (github_id text primary key, last_posted timestamptz not null);
alter table public.community_bans enable row level security;
alter table public.release_votes enable row level security;
revoke all on public.community_bans, public.release_votes from public, anon, authenticated;
revoke all on community_private.user_limits from public, anon, authenticated;
grant select, insert, update, delete on public.community_bans, public.release_votes to service_role;

create function public.community_publish_verified(p_fingerprint text, p_github_id text, p_login text, p_title text, p_body text, p_parent uuid, p_owner_hash text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, community_private as $$
declare result jsonb; now_time timestamptz := clock_timestamp(); affected integer;
begin
  if p_github_id is null or p_github_id !~ '^[0-9]{1,20}$' or p_login is null or p_login !~* '^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$' or p_login like '%--%' then raise exception 'Invalid identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wgit:' || p_github_id, 0));
  if exists(select 1 from public.community_bans where github_id = p_github_id or github_login = lower(p_login)) then return jsonb_build_object('error','banned'); end if;
  if exists(select 1 from community_private.user_limits where github_id = p_github_id and last_posted > now_time - interval '60 seconds') then return jsonb_build_object('error','rate_limited'); end if;
  result := public.community_publish_v2(p_fingerprint, p_login, p_title, p_body, p_parent, p_login, p_owner_hash);
  if result ? 'error' then return result; end if;
  insert into community_private.user_limits (github_id, last_posted) values(p_github_id, now_time) on conflict (github_id) do update set last_posted = excluded.last_posted;
  update public.community_posts set github_id = p_github_id where id = (result->>'id')::uuid;
  return result || jsonb_build_object('github_id', p_github_id);
end $$;
revoke all on function public.community_publish_verified(text,text,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.community_publish_verified(text,text,text,text,text,uuid,text) to service_role;

create function public.community_set_ban(p_github_id text, p_login text, p_banned boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_github_id !~ '^[0-9]{1,20}$' or p_github_id = '266074872' or p_login !~ '^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$' then raise exception 'Invalid ban'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wgit:' || p_github_id, 0));
  if p_banned then
    insert into public.community_bans (github_id, github_login) values(p_github_id, lower(p_login)) on conflict (github_id) do update set github_login = excluded.github_login;
  else delete from public.community_bans where github_id = p_github_id; end if;
end $$;
revoke all on function public.community_set_ban(text,text,boolean) from public, anon, authenticated;
grant execute on function public.community_set_ban(text,text,boolean) to service_role;

create function public.community_wipe(p_categories text[])
returns void language plpgsql security definer set search_path = pg_catalog, public, community_private as $$
begin
  if p_categories is null or cardinality(p_categories) = 0 or exists(select 1 from unnest(p_categories) x where x not in ('posts','votes','bans','limits')) then raise exception 'Invalid selection'; end if;
  if 'posts' = any(p_categories) then delete from public.community_posts; end if;
  if 'votes' = any(p_categories) then delete from public.release_votes; end if;
  if 'bans' = any(p_categories) then delete from public.community_bans; end if;
  if 'limits' = any(p_categories) then delete from community_private.post_limits; delete from community_private.user_limits; end if;
end $$;
revoke all on function public.community_wipe(text[]) from public, anon, authenticated;
grant execute on function public.community_wipe(text[]) to service_role;

create function public.release_vote(p_release_id text, p_github_id text, p_direction integer)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_release_id is null or p_release_id !~ '^(pr-(1|2|3|4|5|6|7|8|9|11|12)|v0\.1\.3)$' or p_github_id is null or p_github_id !~ '^[0-9]{1,20}$' or p_direction is null or p_direction not in (-1, 0, 1) then raise exception 'Invalid vote'; end if;
  if p_direction = 0 then delete from public.release_votes where release_id = p_release_id and github_id = p_github_id;
  else insert into public.release_votes (release_id, github_id, direction) values(p_release_id,p_github_id,p_direction) on conflict (release_id, github_id) do update set direction = excluded.direction; end if;
end $$;
create function public.release_vote_totals()
returns table (release_id text, upvotes bigint, downvotes bigint) language sql security definer set search_path = pg_catalog, public as $$
  select release_id, count(*) filter (where direction = 1), count(*) filter (where direction = -1) from public.release_votes group by release_id
$$;
revoke all on function public.release_vote(text,text,integer), public.release_vote_totals() from public, anon, authenticated;
grant execute on function public.release_vote(text,text,integer), public.release_vote_totals() to service_role;
