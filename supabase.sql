-- FinanFamília — esquema inicial para Supabase
-- Execute no SQL Editor do seu projeto Supabase.
-- As políticas RLS limitam cada registro aos membros da família vinculada ao perfil autenticado.

create extension if not exists pgcrypto;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  family_id uuid references public.families(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  type text not null check (type in ('income','expense')),
  description text not null check (char_length(description) between 1 and 120),
  amount numeric(12,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  category text not null default 'Outros',
  responsible text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  category text not null default 'Outros',
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  target_amount numeric(12,2) not null check (target_amount > 0),
  saved_amount numeric(12,2) not null default 0 check (saved_amount >= 0),
  deadline date,
  created_at timestamptz not null default now()
);

create index if not exists transactions_family_date_idx on public.transactions(family_id, transaction_date desc);
create index if not exists bills_family_due_idx on public.bills(family_id, due_date);
create index if not exists goals_family_created_idx on public.goals(family_id, created_at desc);

alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.bills enable row level security;
alter table public.goals enable row level security;

-- Função auxiliar: a família do usuário autenticado.
create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.family_id from public.profiles p where p.id = (select auth.uid())
$$;

revoke all on function public.current_family_id() from public;
grant execute on function public.current_family_id() to authenticated;

-- Criação atômica da família e do perfil do primeiro membro.
-- SECURITY DEFINER é restrito a este fluxo e não recebe user_id do cliente.
create or replace function public.create_family_for_current_user(family_name text, full_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_family_id uuid;
begin
  if uid is null then
    raise exception 'É necessário estar autenticado.';
  end if;
  if char_length(trim(coalesce(family_name,''))) < 1 or char_length(trim(family_name)) > 80 then
    raise exception 'O nome da família deve ter entre 1 e 80 caracteres.';
  end if;
  if char_length(trim(coalesce(full_name,''))) < 1 or char_length(trim(full_name)) > 80 then
    raise exception 'O nome deve ter entre 1 e 80 caracteres.';
  end if;
  if exists (select 1 from public.profiles p where p.id = uid and p.family_id is not null) then
    raise exception 'Este usuário já pertence a uma família.';
  end if;
  insert into public.families(name) values (trim(family_name)) returning id into new_family_id;
  insert into public.profiles(id, full_name, family_id)
  values (uid, trim(full_name), new_family_id)
  on conflict (id) do update set full_name = excluded.full_name, family_id = excluded.family_id;
  return new_family_id;
end;
$$;

revoke all on function public.create_family_for_current_user(text,text) from public;
grant execute on function public.create_family_for_current_user(text,text) to authenticated;

-- Cria o perfil sem família ao registrar; a interface vincula a família via RPC.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Famílias: só membros podem ver sua família.
drop policy if exists "family members can read their family" on public.families;
create policy "family members can read their family" on public.families
for select to authenticated using (id = (select public.current_family_id()));

-- Perfil: cada usuário lê o próprio perfil. Sem permissão direta para trocar family_id.
drop policy if exists "users can read own profile" on public.profiles;
create policy "users can read own profile" on public.profiles
for select to authenticated using (id = (select auth.uid()));

drop policy if exists "users can update own profile name" on public.profiles;
create policy "users can update own profile name" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Movimentações: acesso restrito à família atual.
drop policy if exists "family members read transactions" on public.transactions;
create policy "family members read transactions" on public.transactions for select to authenticated
using (family_id = (select public.current_family_id()));
drop policy if exists "family members insert transactions" on public.transactions;
create policy "family members insert transactions" on public.transactions for insert to authenticated
with check (family_id = (select public.current_family_id()) and created_by = (select auth.uid()));
drop policy if exists "family members update transactions" on public.transactions;
create policy "family members update transactions" on public.transactions for update to authenticated
using (family_id = (select public.current_family_id())) with check (family_id = (select public.current_family_id()));
drop policy if exists "family members delete transactions" on public.transactions;
create policy "family members delete transactions" on public.transactions for delete to authenticated
using (family_id = (select public.current_family_id()));

-- Contas a pagar.
drop policy if exists "family members read bills" on public.bills;
create policy "family members read bills" on public.bills for select to authenticated using (family_id = (select public.current_family_id()));
drop policy if exists "family members insert bills" on public.bills;
create policy "family members insert bills" on public.bills for insert to authenticated with check (family_id = (select public.current_family_id()) and created_by = (select auth.uid()));
drop policy if exists "family members update bills" on public.bills;
create policy "family members update bills" on public.bills for update to authenticated using (family_id = (select public.current_family_id())) with check (family_id = (select public.current_family_id()));
drop policy if exists "family members delete bills" on public.bills;
create policy "family members delete bills" on public.bills for delete to authenticated using (family_id = (select public.current_family_id()));

-- Metas financeiras.
drop policy if exists "family members read goals" on public.goals;
create policy "family members read goals" on public.goals for select to authenticated using (family_id = (select public.current_family_id()));
drop policy if exists "family members insert goals" on public.goals;
create policy "family members insert goals" on public.goals for insert to authenticated with check (family_id = (select public.current_family_id()) and created_by = (select auth.uid()));
drop policy if exists "family members update goals" on public.goals;
create policy "family members update goals" on public.goals for update to authenticated using (family_id = (select public.current_family_id())) with check (family_id = (select public.current_family_id()));
drop policy if exists "family members delete goals" on public.goals;
create policy "family members delete goals" on public.goals for delete to authenticated using (family_id = (select public.current_family_id()));

grant select on public.families, public.profiles, public.transactions, public.bills, public.goals to authenticated;
grant insert, update, delete on public.transactions, public.bills, public.goals to authenticated;
grant update (full_name) on public.profiles to authenticated;
