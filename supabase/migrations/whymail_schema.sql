
-- ─── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Profiles ────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Domains ─────────────────────────────────────────────────
create table if not exists public.domains (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  verified boolean default false,
  verification_status text default 'pending' check (verification_status in ('pending','verified','failed')),
  mx_record text,
  spf_record text,
  dkim_record text,
  dmarc_record text,
  created_at timestamptz default now(),
  unique(user_id, name)
);
alter table public.domains enable row level security;
create policy "Users manage own domains" on public.domains for all using (auth.uid() = user_id);

-- ─── Email Accounts ───────────────────────────────────────────
create table if not exists public.email_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  domain_id uuid references public.domains(id) on delete cascade,
  email text not null unique,
  display_name text,
  imap_host text,
  imap_port integer default 993,
  imap_secure boolean default true,
  smtp_host text,
  smtp_port integer default 587,
  smtp_secure boolean default false,
  username text,
  password_encrypted text,
  enabled boolean default true,
  storage_used_mb integer default 0,
  storage_quota_mb integer default 5000,
  last_synced_at timestamptz,
  created_at timestamptz default now()
);
alter table public.email_accounts enable row level security;
create policy "Users manage own accounts" on public.email_accounts for all using (auth.uid() = user_id);

-- ─── Emails ──────────────────────────────────────────────────
create table if not exists public.emails (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  account_id uuid references public.email_accounts(id) on delete cascade not null,
  message_id text,
  folder text default 'inbox' check (folder in ('inbox','sent','drafts','spam','trash')),
  from_address text not null,
  from_name text,
  to_addresses text[] not null default '{}',
  cc_addresses text[],
  bcc_addresses text[],
  subject text,
  body_text text,
  body_html text,
  is_read boolean default false,
  is_starred boolean default false,
  sent_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(account_id, message_id)
);
alter table public.emails enable row level security;
create policy "Users manage own emails" on public.emails for all using (auth.uid() = user_id);
create index if not exists idx_emails_account_folder on public.emails(account_id, folder);
create index if not exists idx_emails_user_folder on public.emails(user_id, folder);
create index if not exists idx_emails_sent_at on public.emails(sent_at desc);

-- ─── Attachments ─────────────────────────────────────────────
create table if not exists public.attachments (
  id uuid primary key default uuid_generate_v4(),
  email_id uuid references public.emails(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  filename text not null,
  mime_type text,
  size_bytes bigint default 0,
  storage_path text,
  created_at timestamptz default now()
);
alter table public.attachments enable row level security;
create policy "Users manage own attachments" on public.attachments for all using (auth.uid() = user_id);
