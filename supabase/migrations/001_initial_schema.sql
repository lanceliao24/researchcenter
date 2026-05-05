-- Research Center Database Schema
-- Run this in Supabase SQL Editor

-- Enable pgvector extension
create extension if not exists vector;

-- User roles
create type user_role as enum ('admin', 'viewer');

-- Profiles (extends Supabase Auth)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  name text,
  role user_role default 'viewer',
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case
      when (select count(*) from public.profiles) = 0 then 'admin'::user_role
      else 'viewer'::user_role
    end
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keywords for social tracking
create table if not exists keywords (
  id bigint generated always as identity primary key,
  keyword text unique not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Social posts
create table if not exists social_posts (
  id bigint generated always as identity primary key,
  keyword text not null,
  platform text not null,
  title text,
  url text unique,
  description text,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  fetched_at timestamptz default now(),
  published_at timestamptz
);

create index if not exists idx_social_posts_keyword on social_posts(keyword);
create index if not exists idx_social_posts_platform on social_posts(platform);
create index if not exists idx_social_posts_fetched on social_posts(fetched_at desc);

-- Documents (transcripts, surveys, reports)
create table if not exists documents (
  id bigint generated always as identity primary key,
  title text not null,
  type text not null check (type in ('transcript', 'survey', 'report')),
  file_path text,
  status text default 'processing' check (status in ('processing', 'ready', 'error')),
  metadata jsonb,
  uploaded_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists idx_documents_type on documents(type);

-- Survey responses (parsed CSV rows)
create table if not exists survey_responses (
  id bigint generated always as identity primary key,
  document_id bigint references documents(id) on delete cascade,
  row_data jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_survey_responses_doc on survey_responses(document_id);

-- Vector embeddings for RAG
create table if not exists embeddings (
  id bigint generated always as identity primary key,
  source_type text not null,
  source_id bigint not null,
  chunk_text text not null,
  chunk_index int,
  embedding vector(768),
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_embeddings_source on embeddings(source_type, source_id);

-- Vector similarity search function
create or replace function match_embeddings(
  query_embedding text,
  match_count int default 8,
  filter_source_type text default null
)
returns table (
  chunk_text text,
  source_type text,
  source_id bigint,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    e.chunk_text,
    e.source_type,
    e.source_id,
    e.metadata,
    1 - (e.embedding <=> query_embedding::vector) as similarity
  from embeddings e
  where
    (filter_source_type is null or e.source_type = filter_source_type)
  order by e.embedding <=> query_embedding::vector
  limit match_count;
end;
$$;

-- Row Level Security
alter table profiles enable row level security;
alter table keywords enable row level security;
alter table social_posts enable row level security;
alter table documents enable row level security;
alter table survey_responses enable row level security;
alter table embeddings enable row level security;

-- Policies: authenticated users can read all data
create policy "Users can view profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

create policy "Users can view keywords" on keywords for select using (auth.role() = 'authenticated');
create policy "Admins can manage keywords" on keywords for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Users can view social posts" on social_posts for select using (auth.role() = 'authenticated');
create policy "Service can manage social posts" on social_posts for all using (auth.role() = 'service_role');

create policy "Users can view documents" on documents for select using (auth.role() = 'authenticated');
create policy "Admins can manage documents" on documents for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Users can view survey responses" on survey_responses for select using (auth.role() = 'authenticated');
create policy "Service can manage survey responses" on survey_responses for all using (auth.role() = 'service_role');

create policy "Users can view embeddings" on embeddings for select using (auth.role() = 'authenticated');
create policy "Service can manage embeddings" on embeddings for all using (auth.role() = 'service_role');

-- Insert default keywords
insert into keywords (keyword) values
  ('LINE GO 租車'),
  ('LINE GO 計程車'),
  ('Taxi Go'),
  ('LINE TAXI')
on conflict (keyword) do nothing;
