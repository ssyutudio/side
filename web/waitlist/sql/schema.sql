-- Side waitlist schema. Safe to run more than once.

create table if not exists waitlist (
  id bigserial primary key,
  email text not null,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- One row per person, whatever the capitalisation.
create unique index if not exists waitlist_email_lower_key on waitlist (lower(email));

-- Anonymous usage counts (opt-in, off by default). Numbers and a random install id only:
-- no tab content of any kind is stored here.
create table if not exists usage_counts (
  install_id uuid primary key,
  tabs_set_aside integer not null default 0,
  lines_set_aside integer not null default 0,
  sidy_spoke integer not null default 0,
  steps_shown integer not null default 0,
  steps_clicked integer not null default 0,
  still_working_10m integer not null default 0,
  updated_at timestamptz not null default now()
);
