-- Fablekeep: run this entire file once in your Supabase SQL Editor.
-- Characters belong to individual Supabase Auth users.
-- The publishable browser key can only access rows allowed by these policies.

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  sheet jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint characters_sheet_is_object check (jsonb_typeof(sheet) = 'object'),
  constraint characters_name_length check (char_length(name) <= 160)
);

create index if not exists characters_user_updated_idx
  on public.characters (user_id, updated_at desc);

-- Turn on row-level security and explicitly allow ONLY owner actions.
alter table public.characters enable row level security;

-- Dropping first makes this script safe to rerun if you change the policies.
drop policy if exists "Owners can read characters" on public.characters;
drop policy if exists "Owners can create characters" on public.characters;
drop policy if exists "Owners can update characters" on public.characters;
drop policy if exists "Owners can delete characters" on public.characters;

create policy "Owners can read characters"
  on public.characters for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners can create characters"
  on public.characters for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners can update characters"
  on public.characters for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners can delete characters"
  on public.characters for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Automatically record when a sheet is changed.
create or replace function public.touch_character_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_character_updated_at on public.characters;
create trigger touch_character_updated_at
  before update on public.characters
  for each row execute function public.touch_character_updated_at();

-- Restrict table access to signed-in users; RLS still checks ownership.
revoke all on public.characters from anon;
grant select, insert, update, delete on public.characters to authenticated;
