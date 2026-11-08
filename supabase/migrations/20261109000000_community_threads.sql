alter table public.community_posts add column github_username text, add column owner_hash text, add column deleted boolean not null default false;
alter table public.community_posts add constraint community_github_username_format check (github_username is null or github_username ~* '^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$');

create function public.community_publish_v2(p_fingerprint text, p_author text, p_title text, p_body text, p_parent uuid, p_github text, p_owner_hash text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, community_private as $$
declare post public.community_posts; affected integer; v_now timestamptz := clock_timestamp();
begin
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_owner_hash is null or p_owner_hash !~ '^[0-9a-f]{64}$' or p_author is null or char_length(trim(p_author)) not between 1 and 100 or p_body is null or char_length(trim(p_body)) not between 1 and 4000 then raise exception 'Invalid post'; end if;
  if p_github is not null and p_github !~* '^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$' then raise exception 'Invalid GitHub username'; end if;
  if p_parent is null then
    if p_title is null or char_length(trim(p_title)) not between 1 and 120 then raise exception 'Invalid title'; end if;
  elsif p_title is not null or not exists (select 1 from public.community_posts where id = p_parent and not deleted) then
    raise exception 'Post not found';
  end if;
  insert into community_private.post_limits as limits (fingerprint, last_posted) values (p_fingerprint, v_now)
    on conflict (fingerprint) do update set last_posted = excluded.last_posted
    where limits.last_posted <= excluded.last_posted - interval '60 seconds';
  get diagnostics affected = row_count;
  if affected = 0 then return jsonb_build_object('error', 'rate_limited'); end if;
  insert into public.community_posts (parent_id, author, title, body, github_username, owner_hash)
    values (p_parent, trim(p_author), case when p_parent is null then trim(p_title) else null end, trim(p_body), p_github, p_owner_hash) returning * into post;
  return to_jsonb(post) - 'owner_hash';
end $$;
revoke all on function public.community_publish_v2(text, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.community_publish_v2(text, text, text, text, uuid, text, text) to service_role;

create function public.community_delete(p_id uuid, p_owner_hash text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare parent uuid;
begin
  if p_owner_hash is null or p_owner_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  select parent_id into parent from public.community_posts where id = p_id and owner_hash = p_owner_hash and not deleted for update;
  if not found then return false; end if;
  if parent is null then
    with recursive descendants as (select id from public.community_posts where id = p_id union all select p.id from public.community_posts p join descendants d on p.parent_id = d.id)
      delete from public.community_posts where id in (select id from descendants);
  else
    update public.community_posts set author = '[deleted]', body = '[deleted]', github_username = null, owner_hash = null, deleted = true where id = p_id;
  end if;
  return true;
end $$;
revoke all on function public.community_delete(uuid, text) from public, anon, authenticated;
grant execute on function public.community_delete(uuid, text) to service_role;
