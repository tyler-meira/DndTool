-- Fablekeep shared multiplayer rooms. Run AFTER supabase/schema.sql.
-- Existing characters remain private; tabletop rooms are shared with room members.
create extension if not exists pgcrypto;

create table if not exists public.vtt_rooms (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null default 'New campaign' check (char_length(name) between 1 and 100),
  join_code text not null unique default upper(encode(gen_random_bytes(6),'hex')),
  map_path text,
  map_ratio double precision not null default 0.5625 check (map_ratio between 0.2 and 4),
  grid_cols integer not null default 20 check (grid_cols between 6 and 80),
  show_grid boolean not null default true,
  snap_grid boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.vtt_members (
  room_id uuid not null references public.vtt_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(room_id,user_id)
);
create table if not exists public.vtt_tokens (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.vtt_rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#93455a',
  x double precision not null default 0.5 check (x between 0 and 1),
  y double precision not null default 0.5 check (y between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vtt_tokens_room_idx on public.vtt_tokens(room_id);
create table if not exists public.vtt_rolls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.vtt_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  results integer[] not null,
  total integer not null,
  created_at timestamptz not null default now()
);
create index if not exists vtt_rolls_room_idx on public.vtt_rolls(room_id,created_at desc);

-- This helper bypasses membership-table RLS, preventing recursive policies.
create or replace function public.vtt_is_member(p_room uuid)
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from public.vtt_members
    where room_id = p_room and user_id = (select auth.uid()));
$$;
revoke all on function public.vtt_is_member(uuid) from public, anon;
grant execute on function public.vtt_is_member(uuid) to authenticated;

create or replace function public.vtt_add_creator()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.vtt_members(room_id,user_id) values (new.id,new.created_by);
  return new;
end;
$$;
drop trigger if exists vtt_room_creator on public.vtt_rooms;
create trigger vtt_room_creator after insert on public.vtt_rooms
for each row execute function public.vtt_add_creator();

create or replace function public.vtt_touch_updated()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists vtt_room_touch on public.vtt_rooms;
create trigger vtt_room_touch before update on public.vtt_rooms
for each row execute function public.vtt_touch_updated();
drop trigger if exists vtt_token_touch on public.vtt_tokens;
create trigger vtt_token_touch before update on public.vtt_tokens
for each row execute function public.vtt_touch_updated();

-- Joining is performed by a secure RPC, not by unauthenticated room lookup.
create or replace function public.vtt_join_room(p_code text)
returns uuid language plpgsql security definer
set search_path = '' as $$
declare r uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  select id into r from public.vtt_rooms where join_code = upper(trim(p_code));
  if r is null then raise exception 'Invalid room code'; end if;
  insert into public.vtt_members(room_id,user_id)
    values(r,(select auth.uid())) on conflict do nothing;
  return r;
end;
$$;
revoke all on function public.vtt_join_room(text) from public,anon;
grant execute on function public.vtt_join_room(text) to authenticated;

alter table public.vtt_rooms enable row level security;
alter table public.vtt_members enable row level security;
alter table public.vtt_tokens enable row level security;
alter table public.vtt_rolls enable row level security;

create policy "Members view rooms" on public.vtt_rooms for select to authenticated
 using (public.vtt_is_member(id));
create policy "Users create their rooms" on public.vtt_rooms for insert to authenticated
 with check (created_by = (select auth.uid()));
create policy "Members update rooms" on public.vtt_rooms for update to authenticated
 using (public.vtt_is_member(id)) with check (public.vtt_is_member(id));
-- Room removal is restricted to its creator.
create policy "Creators delete rooms" on public.vtt_rooms for delete to authenticated
 using (created_by = (select auth.uid()));

create policy "Members view memberships" on public.vtt_members for select to authenticated
 using (public.vtt_is_member(room_id));
-- Membership additions only through the security-definer join-room RPC.
create policy "Members may leave" on public.vtt_members for delete to authenticated
 using (user_id = (select auth.uid()));

create policy "Members view tokens" on public.vtt_tokens for select to authenticated
 using (public.vtt_is_member(room_id));
create policy "Members create tokens" on public.vtt_tokens for insert to authenticated
 with check (public.vtt_is_member(room_id));
create policy "Members move tokens" on public.vtt_tokens for update to authenticated
 using (public.vtt_is_member(room_id)) with check (public.vtt_is_member(room_id));
create policy "Members delete tokens" on public.vtt_tokens for delete to authenticated
 using (public.vtt_is_member(room_id));

create policy "Members view rolls" on public.vtt_rolls for select to authenticated
 using (public.vtt_is_member(room_id));
create policy "Members roll dice" on public.vtt_rolls for insert to authenticated
 with check (public.vtt_is_member(room_id) and user_id = (select auth.uid()));

-- Protect membership-independent columns (owner, invite code, token room binding).
revoke update on public.vtt_rooms from authenticated;
grant update(name,map_path,map_ratio,grid_cols,show_grid,snap_grid) on public.vtt_rooms to authenticated;
revoke update on public.vtt_tokens from authenticated;
grant update(name,color,x,y) on public.vtt_tokens to authenticated;
grant select,insert,delete on public.vtt_rooms to authenticated;
grant select,delete on public.vtt_members to authenticated;
grant select,insert,delete on public.vtt_tokens to authenticated;
grant select,insert on public.vtt_rolls to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('vtt-maps','vtt-maps',false,15728640,array['image/png','image/jpeg','image/webp'])
 on conflict(id) do update set public=false,file_size_limit=15728640,allowed_mime_types=excluded.allowed_mime_types;
-- File naming: room-uuid/random-uuid.png (only room members can access).
create policy "Room members read maps" on storage.objects for select to authenticated
 using (bucket_id='vtt-maps' and public.vtt_is_member((storage.foldername(name))[1]::uuid));
create policy "Room members upload maps" on storage.objects for insert to authenticated
 with check (bucket_id='vtt-maps' and public.vtt_is_member((storage.foldername(name))[1]::uuid));
create policy "Room members delete maps" on storage.objects for delete to authenticated
 using (bucket_id='vtt-maps' and public.vtt_is_member((storage.foldername(name))[1]::uuid));

-- Database changes broadcast to authorized subscribers through Postgres Changes.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='vtt_rooms') then
  alter publication supabase_realtime add table public.vtt_rooms;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='vtt_tokens') then
  alter publication supabase_realtime add table public.vtt_tokens;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='vtt_rolls') then
  alter publication supabase_realtime add table public.vtt_rolls;
 end if;
end $$;
