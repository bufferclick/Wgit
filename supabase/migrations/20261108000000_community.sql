-- Public discussion content is only accessed by the community Edge Function.
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.community_posts(id),
  author text not null check (char_length(author) between 1 and 100),
  title text check (title is null or char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  check ((parent_id is null and title is not null) or (parent_id is not null and title is null))
);
create index community_posts_thread_created_idx on public.community_posts (parent_id, created_at desc);
alter table public.community_posts enable row level security;
revoke all on public.community_posts from anon, authenticated;

create schema if not exists community_private;
revoke all on schema community_private from public, anon, authenticated;
create table community_private.post_limits (
  fingerprint text primary key,
  last_posted timestamptz not null
);
revoke all on all tables in schema community_private from public, anon, authenticated;

create function public.community_publish(p_fingerprint text, p_author text, p_title text, p_body text, p_parent uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, community_private as $$
declare post public.community_posts; affected integer; v_now timestamptz := clock_timestamp();
begin
  if p_fingerprint !~ '^[0-9a-f]{64}$' or char_length(trim(p_author)) not between 1 and 100 or char_length(trim(p_body)) not between 1 and 4000 then raise exception 'Invalid post'; end if;
  if p_parent is null then
    if p_title is null or char_length(trim(p_title)) not between 1 and 120 then raise exception 'Invalid title'; end if;
  elsif p_title is not null or not exists (select 1 from public.community_posts where id = p_parent and parent_id is null) then
    raise exception 'Discussion not found';
  end if;
  insert into community_private.post_limits as limits (fingerprint, last_posted) values (p_fingerprint, v_now)
    on conflict (fingerprint) do update set last_posted = excluded.last_posted
    where limits.last_posted <= excluded.last_posted - interval '60 seconds';
  get diagnostics affected = row_count;
  if affected = 0 then return jsonb_build_object('error', 'rate_limited'); end if;
  insert into public.community_posts (parent_id, author, title, body)
    values (p_parent, trim(p_author), case when p_parent is null then trim(p_title) else null end, trim(p_body)) returning * into post;
  return to_jsonb(post);
end $$;
revoke all on function public.community_publish(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.community_publish(text, text, text, text, uuid) to service_role;
grant select on public.community_posts to service_role;
