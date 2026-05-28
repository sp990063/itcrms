-- ============================================================
-- ITCRMS - Initial Schema Migration
-- Version: 001
-- Description: Complete PostgreSQL schema for IT Change Request Management System
-- ============================================================

-- ============================================================
-- SECTION 1: DROP EXISTING OBJECTS ( idempotent )
-- ============================================================
-- Drop in reverse dependency order

DROP TRIGGER IF EXISTS trg_notify_on_chat_mention ON cr_chat_messages;
DROP TRIGGER IF EXISTS trg_notify_on_chat_message ON cr_chat_messages;
DROP TRIGGER IF EXISTS trg_update_cr_timestamp ON change_requests;

DROP FUNCTION IF EXISTS next_cr_number();
DROP FUNCTION IF EXISTS notify_users(uuid[], uuid, text, text, text);
DROP FUNCTION IF EXISTS get_approval_routing(uuid);
DROP FUNCTION IF EXISTS handle_new_chat_message();

DROP POLICY IF EXISTS "it_roles_full_access" ON change_requests;
DROP POLICY IF EXISTS "user_sees_own" ON change_requests;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_impact_analysis;
DROP POLICY IF EXISTS "user_sees_own" ON cr_impact_analysis;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_cost_estimate;
DROP POLICY IF EXISTS "user_sees_own" ON cr_cost_estimate;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_system_design;
DROP POLICY IF EXISTS "user_sees_own" ON cr_system_design;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_sit_test_cases;
DROP POLICY IF EXISTS "user_sees_own" ON cr_sit_test_cases;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_sit_results;
DROP POLICY IF EXISTS "user_sees_own" ON cr_sit_results;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_uat_test_cases;
DROP POLICY IF EXISTS "user_sees_own" ON cr_uat_test_cases;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_uat_results;
DROP POLICY IF EXISTS "user_sees_own" ON cr_uat_results;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_deployment_record;
DROP POLICY IF EXISTS "user_sees_own" ON cr_deployment_record;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_chat_messages;
DROP POLICY IF EXISTS "user_sees_own" ON cr_chat_messages;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_chat_messages;
DROP POLICY IF EXISTS "it_roles_can_create_message" ON cr_chat_messages;
DROP POLICY IF EXISTS "it_roles_full_access" ON notifications;
DROP POLICY IF EXISTS "user_sees_own_notif" ON notifications;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_audit_log;
DROP POLICY IF EXISTS "user_sees_own_audit" ON cr_audit_log;
DROP POLICY IF EXISTS "it_roles_full_access" ON cr_types;
DROP POLICY IF EXISTS "it_roles_full_access" ON workflow_steps;
DROP POLICY IF EXISTS "it_roles_full_access" ON system_tiers;
DROP POLICY IF EXISTS "it_roles_full_access" ON app_roles;
DROP POLICY IF EXISTS "it_roles_full_access" ON user_app_roles;
DROP POLICY IF EXISTS "admin_full_access" ON user_app_roles;
DROP POLICY IF EXISTS "it_roles_full_access" ON auth.users;
DROP POLICY IF EXISTS "users_own_profile" ON auth.users;

ALTER TABLE user_app_roles     DROP POLICY IF EXISTS "admin_full_access" ON user_app_roles;

DROP INDEX IF EXISTS idx_cr_status;
DROP INDEX IF EXISTS idx_cr_applicant;
DROP INDEX IF EXISTS idx_cr_current_step;
DROP INDEX IF EXISTS idx_chat_cr;
DROP INDEX IF EXISTS idx_notif_user;
DROP INDEX IF EXISTS idx_audit_cr;
DROP INDEX IF EXISTS idx_notif_cr;
DROP INDEX IF EXISTS idx_cr_applicant_supervisor;
DROP INDEX IF EXISTS idx_cr_type;
DROP INDEX IF EXISTS idx_cr_system_tier;
DROP INDEX IF EXISTS idx_workflow_cr_type;
DROP INDEX IF EXISTS idx_user_app_roles_user;
DROP INDEX IF EXISTS idx_user_app_roles_role;
DROP INDEX IF EXISTS idx_cr_cost_estimate_cr;
DROP INDEX IF EXISTS idx_cr_impact_cr;
DROP INDEX IF EXISTS idx_cr_design_cr;
DROP INDEX IF EXISTS idx_cr_sit_cases_cr;
DROP INDEX IF EXISTS idx_cr_sit_results_cr;
DROP INDEX IF EXISTS idx_cr_uat_cases_cr;
DROP INDEX IF EXISTS idx_cr_uat_results_cr;
DROP INDEX IF EXISTS idx_cr_deployment_cr;
DROP INDEX IF EXISTS idx_cr_chat_sender;
DROP INDEX IF EXISTS idx_cr_audit_user;
DROP INDEX IF EXISTS idx_notif_user_read;

DROP TABLE IF EXISTS cr_audit_log;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS cr_chat_messages;
DROP TABLE IF EXISTS cr_deployment_record;
DROP TABLE IF EXISTS cr_uat_results;
DROP TABLE IF EXISTS cr_uat_test_cases;
DROP TABLE IF EXISTS cr_sit_results;
DROP TABLE IF EXISTS cr_sit_test_cases;
DROP TABLE IF EXISTS cr_system_design;
DROP TABLE IF EXISTS cr_cost_estimate;
DROP TABLE IF EXISTS cr_impact_analysis;
DROP TABLE IF EXISTS change_requests;
DROP TABLE IF EXISTS workflow_steps;
DROP TABLE IF EXISTS cr_types;
DROP TABLE IF EXISTS system_tiers;
DROP TABLE IF EXISTS user_app_roles;
DROP TABLE IF EXISTS app_roles;
-- auth.users is managed by Supabase Auth; we don't drop it but we do truncate our extension data

-- ============================================================
-- SECTION 2: USERS & AUTHENTICATION
-- ============================================================

-- auth.users: synced from SSO (OpenAM/OpenID Connect) on login
-- Note: Supabase Auth manages the base auth.users table. We extend it with profile fields.
-- The base table already exists; we add our extension as a joined profile table.

-- Extension: user profile data (joined to auth.users)
CREATE TABLE auth.user_profiles (
    id              uuid primary key references auth.users(id) on delete cascade,
    display_name    text not null,
    ldap_dn         text,                          -- for admin accounts via LDAP
    is_admin        boolean default false,
    created_at      timestamptz default now(),
    updated_at      timestamptz default now()
);

-- ============================================================
-- SECTION 3: APPLICATION ROLES
-- ============================================================

-- app_roles: all defined application roles
CREATE TABLE app_roles (
    id          serial primary key,
    name        text unique not null,
    description text,
    created_at  timestamptz default now()
);

-- user_app_roles: per-user effective roles (many-to-many)
CREATE TABLE user_app_roles (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references auth.users(id) on delete cascade,
    role_id     integer references app_roles(id) on delete cascade,
    created_at  timestamptz default now(),
    unique (user_id, role_id)
);

-- ============================================================
-- SECTION 4: LOOKUP TABLES
-- ============================================================

-- cr_types: Change Request types (admin-configurable)
CREATE TABLE cr_types (
    id              serial primary key,
    name            text unique not null,
    description     text,
    is_active       boolean default true,
    created_at      timestamptz default now()
);

-- workflow_steps: Per-CR-type workflow steps
CREATE TABLE workflow_steps (
    id                  serial primary key,
    cr_type_id          integer references cr_types(id) on delete cascade,
    step_order          integer not null,
    step_key            text not null,
    step_label          text not null,
    can_skip            boolean default false,
    requires_role       text,
    notify_on_complete  text[],
    created_at          timestamptz default now(),
    unique (cr_type_id, step_key)
);

-- system_tiers: tier classification
CREATE TABLE system_tiers (
    id          serial primary key,
    code        text unique not null,
    label       text not null,
    priority    integer not null
);

-- ============================================================
-- SECTION 5: CHANGE REQUESTS CORE TABLE
-- ============================================================

CREATE TABLE change_requests (
    id                      uuid primary key default gen_random_uuid(),
    cr_number               text unique not null,
    cr_type_id              integer references cr_types(id),
    title                   text not null,
    description             text not null,
    applicant_id            uuid references auth.users(id),
    applicant_supervisor_id uuid references auth.users(id),

    -- Classification
    system_tier_id          integer references system_tiers(id),
    is_internet_facing      boolean default false,
    risk_level              text check (risk_level in ('high', 'medium', 'low')) default 'medium',

    -- Current state
    status                  text default 'draft',
    current_step_key        text,
    current_step_order      integer,

    -- Approval tracking (JSONB per step)
    approvals               jsonb default '[]',

    submitted_at            timestamptz,
    completed_at            timestamptz,
    created_at              timestamptz default now(),
    updated_at              timestamptz default now(),

    -- Named check constraint for risk_level
    constraint chk_risk_level check (risk_level in ('high', 'medium', 'low'))
);

-- ============================================================
-- SECTION 6: CHANGE REQUEST DETAIL TABLES
-- ============================================================

-- cr_impact_analysis: Impact data
CREATE TABLE cr_impact_analysis (
    id                  uuid primary key default gen_random_uuid(),
    cr_id               uuid references change_requests(id) on delete cascade,
    affected_systems    text,
    impact_description  text,
    rollback_plan       text,
    outage_window       text,
    created_at          timestamptz default now(),
    updated_at          timestamptz default now(),
    unique (cr_id)
);

-- cr_cost_estimate: Cost estimate
CREATE TABLE cr_cost_estimate (
    id              uuid primary key default gen_random_uuid(),
    cr_id           uuid references change_requests(id) on delete cascade,
    labor_cost      numeric(12,2),
    material_cost   numeric(12,2),
    total_cost      numeric(12,2),
    currency        text default 'HKD',
    notes           text,
    created_at      timestamptz default now(),
    updated_at      timestamptz default now(),
    unique (cr_id)
);

-- cr_system_design: Design details
CREATE TABLE cr_system_design (
    id              uuid primary key default gen_random_uuid(),
    cr_id           uuid references change_requests(id) on delete cascade,
    design_details  text,
    tech_stack      text,
    created_at      timestamptz default now(),
    updated_at      timestamptz default now(),
    unique (cr_id)
);

-- cr_sit_test_cases: SJT test cases (JSONB array)
CREATE TABLE cr_sit_test_cases (
    id              uuid primary key default gen_random_uuid(),
    cr_id           uuid references change_requests(id) on delete cascade,
    test_cases      jsonb,
    created_at      timestamptz default now(),
    updated_at      timestamptz default now(),
    unique (cr_id)
);

-- cr_sit_results: SJT test results
CREATE TABLE cr_sit_results (
    id              uuid primary key default gen_random_uuid(),
    cr_id           uuid references change_requests(id) on delete cascade,
    results         jsonb,
    created_at      timestamptz default now(),
    updated_at      timestamptz default now(),
    unique (cr_id)
);

-- cr_uat_test_cases: UAT test cases (JSONB array)
CREATE TABLE cr_uat_test_cases (
    id              uuid primary key default gen_random_uuid(),
    cr_id           uuid references change_requests(id) on delete cascade,
    test_cases      jsonb,
    created_at      timestamptz default now(),
    updated_at      timestamptz default now(),
    unique (cr_id)
);

-- cr_uat_results: UAT test results
CREATE TABLE cr_uat_results (
    id              uuid primary key default gen_random_uuid(),
    cr_id           uuid references change_requests(id) on delete cascade,
    results         jsonb,
    created_at      timestamptz default now(),
    updated_at      timestamptz default now(),
    unique (cr_id)
);

-- cr_deployment_record: Deployment record
CREATE TABLE cr_deployment_record (
    id                  uuid primary key default gen_random_uuid(),
    cr_id               uuid references change_requests(id) on delete cascade,
    deployed_by         uuid references auth.users(id),
    deployed_at         timestamptz,
    deployment_notes    text,
    check_by_1          uuid references auth.users(id),
    check_by_2          uuid references auth.users(id),
    check_completed_at  timestamptz,
    created_at          timestamptz default now(),
    unique (cr_id)
);

-- ============================================================
-- SECTION 7: CHATROOM & NOTIFICATIONS
-- ============================================================

-- cr_chat_messages: Per-CR chatroom messages
CREATE TABLE cr_chat_messages (
    id              uuid primary key default gen_random_uuid(),
    cr_id           uuid references change_requests(id) on delete cascade,
    sender_id       uuid references auth.users(id),
    body            text not null,
    mentions        text[],
    created_at      timestamptz default now()
);

-- notifications: User notifications
CREATE TABLE notifications (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid references auth.users(id) on delete cascade,
    cr_id           uuid references change_requests(id) on delete cascade,
    type            text check (type in ('in_app', 'email', 'both')) default 'both',
    subject         text not null,
    body            text,
    is_read         boolean default false,
    created_at      timestamptz default now(),
    constraint chk_notification_type check (type in ('in_app', 'email', 'both'))
);

-- ============================================================
-- SECTION 8: AUDIT LOG
-- ============================================================

CREATE TABLE cr_audit_log (
    id              uuid primary key default gen_random_uuid(),
    cr_id           uuid references change_requests(id) on delete cascade,
    user_id         uuid references auth.users(id),
    action          text not null,
    step_key        text,
    details         jsonb,
    created_at      timestamptz default now()
);

-- ============================================================
-- SECTION 9: INDEXES
-- ============================================================

-- change_requests indexes
CREATE INDEX idx_cr_status             ON change_requests(status);
CREATE INDEX idx_cr_applicant          ON change_requests(applicant_id);
CREATE INDEX idx_cr_applicant_supervisor ON change_requests(applicant_supervisor_id);
CREATE INDEX idx_cr_current_step       ON change_requests(current_step_key);
CREATE INDEX idx_cr_type               ON change_requests(cr_type_id);
CREATE INDEX idx_cr_system_tier        ON change_requests(system_tier_id);
CREATE INDEX idx_cr_number_year        ON change_requests(substring(cr_number from 4 for 4), substring(cr_number from 9));

-- workflow_steps index
CREATE INDEX idx_workflow_cr_type     ON workflow_steps(cr_type_id, step_order);

-- user_app_roles indexes
CREATE INDEX idx_user_app_roles_user  ON user_app_roles(user_id);
CREATE INDEX idx_user_app_roles_role  ON user_app_roles(role_id);

-- detail table indexes (FK -> PK lookups)
CREATE INDEX idx_cr_impact_cr          ON cr_impact_analysis(cr_id);
CREATE INDEX idx_cr_cost_estimate_cr   ON cr_cost_estimate(cr_id);
CREATE INDEX idx_cr_design_cr          ON cr_system_design(cr_id);
CREATE INDEX idx_cr_sit_cases_cr       ON cr_sit_test_cases(cr_id);
CREATE INDEX idx_cr_sit_results_cr     ON cr_sit_results(cr_id);
CREATE INDEX idx_cr_uat_cases_cr       ON cr_uat_test_cases(cr_id);
CREATE INDEX idx_cr_uat_results_cr     ON cr_uat_results(cr_id);
CREATE INDEX idx_cr_deployment_cr      ON cr_deployment_record(cr_id);

-- chatroom & notification indexes
CREATE INDEX idx_chat_cr               ON cr_chat_messages(cr_id);
CREATE INDEX idx_cr_chat_sender        ON cr_chat_messages(sender_id);
CREATE INDEX idx_notif_user            ON notifications(user_id);
CREATE INDEX idx_notif_user_read       ON notifications(user_id, is_read);
CREATE INDEX idx_notif_cr              ON notifications(cr_id);

-- audit log indexes
CREATE INDEX idx_audit_cr              ON cr_audit_log(cr_id);
CREATE INDEX idx_cr_audit_user        ON cr_audit_log(user_id);

-- ============================================================
-- SECTION 10: UTILITY FUNCTIONS
-- ============================================================

-- next_cr_number(): Returns next CR number string CR-YYYY-NNNNN
CREATE OR REPLACE FUNCTION next_cr_number() returns text as $$
    select 'CR-' || to_char(now(), 'YYYY') || '-' || lpad(
        coalesce(
            (select cast(count(*) + 1 as text) from change_requests
             where cr_number like 'CR-' || to_char(now(), 'YYYY') || '-%'),
            '1'
        ), 5, '0');
$$ language sql;

-- notify_users(): Insert notifications for multiple users
CREATE OR REPLACE FUNCTION notify_users(
    p_user_ids   uuid[],
    p_cr_id      uuid,
    p_subject    text,
    p_body       text,
    p_type       text default 'both'
) returns void as $$
    insert into notifications (user_id, cr_id, subject, body, type)
    select unnest(p_user_ids), p_cr_id, p_subject, p_body, p_type;
$$ language sql;

-- get_approval_routing(): Returns JSONB describing required approval steps based on CR classification
-- Called by approve-cr edge function to determine routing
CREATE OR REPLACE FUNCTION get_approval_routing(p_cr_id uuid) returns jsonb as $$
declare
    v_risk_level     text;
    v_tier_code      text;
    v_internet       boolean;
    v_routing        jsonb;
begin
    select cr.risk_level, st.code, cr.is_internet_facing
    into v_risk_level, v_tier_code, v_internet
    from change_requests cr
    join system_tiers st on st.id = cr.system_tier_id
    where cr.id = p_cr_id;

    -- High-risk + (tier2 OR tier1h OR internet_facing) → Section Head + Director
    if v_risk_level = 'high' and (v_tier_code in ('tier2', 'tier1h') or v_internet = true) then
        v_routing := '["section_head", "director"]'::jsonb;
    -- tier2 OR internet_facing (no high-risk) → Section Head
    elsif v_tier_code = 'tier2' or v_internet = true then
        v_routing := '["section_head"]'::jsonb;
    -- Normal → IT Supervisor only (no extra approval)
    else
        v_routing := '[]'::jsonb;
    end if;

    return v_routing;
end;
$$ language plpgsql;

-- handle_new_chat_message(): Trigger function to process @mentions and notify mentioned users
CREATE OR REPLACE FUNCTION handle_new_chat_message() returns trigger as $$
declare
    v_mentions    text[];
    v_cr_id       uuid;
    v_sender_name text;
    v_user_ids    uuid[];
    v_mention     text;
begin
    v_cr_id := new.cr_id;

    select up.display_name into v_sender_name
    from auth.users u
    join auth.user_profiles up on up.id = u.id
    where u.id = new.sender_id;

    -- Process mentions from the mentions array
    if new.mentions is not null and array_length(new.mentions, 1) > 0 then
        foreach v_mention in array new.mentions
        loop
            -- v_mention can be an email (@user@domain.com) or role tag (@it-staff)
            if v_mention like '%@%' and not v_mention like '@%-%' then
                -- Email mention: find user by email
                begin
                    select id into v_user_ids
                    from auth.users
                    where email = replace(v_mention, '@', '');
                exception when others then
                    v_user_ids := null;
                end;
            elsif v_mention like '@%-%' then
                -- Role tag: find users with that role
                select array_agg(uar.user_id)
                into v_user_ids
                from user_app_roles uar
                join app_roles ar on ar.id = uar.role_id
                where ar.name = substring(v_mention from 2);
            end if;

            -- Insert notification for each found user
            if v_user_ids is not null and array_length(v_user_ids, 1) > 0 then
                insert into notifications (user_id, cr_id, subject, body, type)
                select u.id, v_cr_id,
                       'You were mentioned in CR chat',
                       (v_sender_name || ' mentioned you: ' || new.body),
                       'both'
                from unnest(v_user_ids) as u(id);
            end if;
        end loop;
    end if;

    return new;
end;
$$ language plpgsql;

-- trg_update_cr_timestamp: Auto-update updated_at on change_requests
CREATE OR REPLACE FUNCTION trg_update_cr_timestamp() returns trigger as $$
begin
    new.updated_at := now();
    return new;
end;
$$ language plpgsql;

-- ============================================================
-- SECTION 11: TRIGGERS
-- ============================================================

-- Auto-update timestamp on change_requests
CREATE TRIGGER trg_update_cr_timestamp
    before update on change_requests
    for each row execute function trg_update_cr_timestamp();

-- Auto-process @mentions on new chat message
CREATE TRIGGER trg_notify_on_chat_message
    after insert on cr_chat_messages
    for each row execute function handle_new_chat_message();

-- ============================================================
-- SECTION 12: ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all application tables
alter table auth.user_profiles    enable row level security;
alter table app_roles            enable row level security;
alter table user_app_roles        enable row level security;
alter table cr_types             enable row level security;
alter table workflow_steps       enable row level security;
alter table system_tiers         enable row level security;
alter table change_requests      enable row level security;
alter table cr_impact_analysis   enable row level security;
alter table cr_cost_estimate     enable row level security;
alter table cr_system_design     enable row level security;
alter table cr_sit_test_cases    enable row level security;
alter table cr_sit_results        enable row level security;
alter table cr_uat_test_cases    enable row level security;
alter table cr_uat_results        enable row level security;
alter table cr_deployment_record  enable row level security;
alter table cr_chat_messages     enable row level security;
alter table notifications        enable row level security;
alter table cr_audit_log         enable row level security;

-- ============================================================
-- SECTION 13: RLS POLICIES
-- ============================================================

-- =============================================
-- auth.user_profiles
-- =============================================
-- IT roles + admin can view all profiles
create policy "it_roles_view_profiles"
    on auth.user_profiles for select
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','committee_member','admin')
        )
    );

-- Users can view their own profile
create policy "users_own_profile"
    on auth.user_profiles for select
    using (id = auth.uid());

-- Admin can update any profile
create policy "admin_update_profiles"
    on auth.user_profiles for update
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('admin')
        )
    );

-- =============================================
-- app_roles
-- =============================================
-- All authenticated users can view roles
create policy "all_can_view_roles"
    on app_roles for select
    using (auth.role() = 'authenticated');

-- Only admin can modify roles
create policy "admin_manage_roles"
    on app_roles for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name = 'admin'
        )
    );

-- =============================================
-- user_app_roles
-- =============================================
-- IT roles + admin can view all role assignments
create policy "it_roles_view_user_app_roles"
    on user_app_roles for select
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','committee_member','admin')
        )
    );

-- Only admin can manage role assignments
create policy "admin_manage_user_app_roles"
    on user_app_roles for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name = 'admin'
        )
    );

-- =============================================
-- cr_types
-- =============================================
-- IT roles + admin can view and manage cr_types
create policy "it_roles_manage_cr_types"
    on cr_types for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','admin')
        )
    );

-- =============================================
-- workflow_steps
-- =============================================
-- IT roles + admin can view and manage workflow_steps
create policy "it_roles_manage_workflow_steps"
    on workflow_steps for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','admin')
        )
    );

-- =============================================
-- system_tiers
-- =============================================
-- All authenticated can view system tiers
create policy "all_can_view_tiers"
    on system_tiers for select
    using (auth.role() = 'authenticated');

-- Admin can manage tiers
create policy "admin_manage_tiers"
    on system_tiers for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name = 'admin'
        )
    );

-- =============================================
-- change_requests
-- =============================================
-- IT roles + committee + admin: full access to all CRs
create policy "it_roles_full_access"
    on change_requests for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','committee_member','admin')
        )
    );

-- Users can see their own submitted CRs
create policy "user_sees_own"
    on change_requests for select
    using (applicant_id = auth.uid());

-- Users can insert their own CRs (applicant)
create policy "user_can_create"
    on change_requests for insert
    with check (applicant_id = auth.uid());

-- Users can update their own CRs only in draft status
create policy "user_can_update_own"
    on change_requests for update
    using (applicant_id = auth.uid() and status = 'draft');

-- =============================================
-- cr_impact_analysis
-- =============================================
create policy "it_roles_full_access"
    on cr_impact_analysis for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','committee_member','admin')
        )
    );

create policy "user_sees_own"
    on cr_impact_analysis for select
    using (
        exists (
            select 1 from change_requests cr
            where cr.id = cr_id and cr.applicant_id = auth.uid()
        )
    );

-- =============================================
-- cr_cost_estimate
-- =============================================
create policy "it_roles_full_access"
    on cr_cost_estimate for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','admin')
        )
    );

create policy "user_sees_own"
    on cr_cost_estimate for select
    using (
        exists (
            select 1 from change_requests cr
            where cr.id = cr_id and cr.applicant_id = auth.uid()
        )
    );

-- =============================================
-- cr_system_design
-- =============================================
create policy "it_roles_full_access"
    on cr_system_design for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','admin')
        )
    );

create policy "user_sees_own"
    on cr_system_design for select
    using (
        exists (
            select 1 from change_requests cr
            where cr.id = cr_id and cr.applicant_id = auth.uid()
        )
    );

-- =============================================
-- cr_sit_test_cases
-- =============================================
create policy "it_roles_full_access"
    on cr_sit_test_cases for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','admin')
        )
    );

create policy "user_sees_own"
    on cr_sit_test_cases for select
    using (
        exists (
            select 1 from change_requests cr
            where cr.id = cr_id and cr.applicant_id = auth.uid()
        )
    );

-- =============================================
-- cr_sit_results
-- =============================================
create policy "it_roles_full_access"
    on cr_sit_results for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','admin')
        )
    );

create policy "user_sees_own"
    on cr_sit_results for select
    using (
        exists (
            select 1 from change_requests cr
            where cr.id = cr_id and cr.applicant_id = auth.uid()
        )
    );

-- =============================================
-- cr_uat_test_cases
-- =============================================
create policy "it_roles_full_access"
    on cr_uat_test_cases for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','admin')
        )
    );

create policy "user_sees_own"
    on cr_uat_test_cases for select
    using (
        exists (
            select 1 from change_requests cr
            where cr.id = cr_id and cr.applicant_id = auth.uid()
        )
    );

-- =============================================
-- cr_uat_results
-- =============================================
create policy "it_roles_full_access"
    on cr_uat_results for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','admin')
        )
    );

create policy "user_sees_own"
    on cr_uat_results for select
    using (
        exists (
            select 1 from change_requests cr
            where cr.id = cr_id and cr.applicant_id = auth.uid()
        )
    );

-- =============================================
-- cr_deployment_record
-- =============================================
create policy "it_roles_full_access"
    on cr_deployment_record for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','deployment_executor','deployment_checker','admin')
        )
    );

create policy "user_sees_own"
    on cr_deployment_record for select
    using (
        exists (
            select 1 from change_requests cr
            where cr.id = cr_id and cr.applicant_id = auth.uid()
        )
    );

-- =============================================
-- cr_chat_messages
-- =============================================
-- IT roles + admin: full access to all messages
create policy "it_roles_full_access"
    on cr_chat_messages for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','admin')
        )
    );

-- Users can see messages on their own CRs
create policy "user_sees_own_cr_messages"
    on cr_chat_messages for select
    using (
        exists (
            select 1 from change_requests cr
            where cr.id = cr_id and cr.applicant_id = auth.uid()
        )
    );

-- Authenticated users can insert messages (sender must match)
create policy "users_can_post_messages"
    on cr_chat_messages for insert
    with check (sender_id = auth.uid());

-- =============================================
-- notifications
-- =============================================
-- IT roles + admin can view all notifications
create policy "it_roles_full_access"
    on notifications for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','admin')
        )
    );

-- Users see only their own notifications
create policy "user_sees_own_notif"
    on notifications for select
    using (user_id = auth.uid());

-- System can insert notifications (no auth context needed for trigger-based inserts)
create policy "system_can_insert_notif"
    on notifications for insert
    with check (true);

-- Users can update their own notifications (mark as read)
create policy "user_can_update_notif"
    on notifications for update
    using (user_id = auth.uid());

-- =============================================
-- cr_audit_log
-- =============================================
-- IT roles + admin can view all audit logs
create policy "it_roles_full_access"
    on cr_audit_log for all
    using (
        exists (
            select 1 from user_app_roles uar
            join app_roles ar on ar.id = uar.role_id
            where uar.user_id = auth.uid()
            and ar.name in ('it_staff','it_supervisor','it_section_head','it_director','admin')
        )
    );

-- Users can see audit entries for their own CRs
create policy "user_sees_own_audit"
    on cr_audit_log for select
    using (
        exists (
            select 1 from change_requests cr
            where cr.id = cr_id and cr.applicant_id = auth.uid()
        )
    );

-- ============================================================
-- SECTION 14: SEED DATA
-- ============================================================

-- =============================================
-- 14.1: App Roles (10 roles)
-- =============================================
insert into app_roles (name, description) values
    ('user',                  'Business user — can submit CRs and track own CRs'),
    ('user_supervisor',       'User supervisor — can approve/reject team CRs'),
    ('it_staff',              'IT Staff — can pickup CRs, fill analysis/estimate/design'),
    ('it_supervisor',        'IT Supervisor — approves IT steps, routes CRs'),
    ('it_section_head',       'IT Section Head — approves high-risk/tier2 CRs'),
    ('it_director',           'IT Director — approves highest-risk CRs'),
    ('committee_member',      'Change Control Committee Member'),
    ('deployment_executor',   'Deployment Executor — executes approved deployments'),
    ('deployment_checker',    'Deployment Checker — verifies deployment completion'),
    ('admin',                 'System Administrator — full access');

-- =============================================
-- 14.2: System Tiers (3 tiers)
-- =============================================
insert into system_tiers (code, label, priority) values
    ('tier2',  'Tier 2',  2),
    ('tier1h', 'Tier 1H', 3),
    ('tier1',  'Tier 1',  1);

-- =============================================
-- 14.3: CR Types (4 default types)
-- =============================================
insert into cr_types (name, description, is_active) values
    ('system_enhancement', 'System Enhancement — new feature or major change to an existing system', true),
    ('data_update',        'Data Update — batch data change, data migration, or data correction', true),
    ('data_extraction',    'Data Extraction — data export or report generation request', true),
    ('bug_fix',            'Bug Fix — correction of a defect in an existing system', true);

-- =============================================
-- 14.4: Workflow Steps for each CR Type
-- =============================================
-- Workflow steps for system_enhancement (type id = 1)
insert into workflow_steps (cr_type_id, step_order, step_key, step_label, can_skip, requires_role, notify_on_complete) values
    (1,  1,  'submit',                  'Submit CR',                      false, 'user',                 array['it_staff','user_supervisor']),
    (1,  2,  'user_supervisor_approve', 'User Supervisor Approve',         false, 'user_supervisor',       array['it_staff']),
    (1,  3,  'it_pickup',               'IT Staff Pickup',                 false, 'it_staff',              array['it_staff']),
    (1,  4,  'it_impact_analysis',      'IT Impact Analysis',              false, 'it_staff',              array['it_supervisor']),
    (1,  5,  'it_supervisor_approve',  'IT Supervisor Approve',           false, 'it_supervisor',         array['it_section_head','it_director']),
    (1,  6,  'section_head_approve',    'IT Section Head Approve',         true,  'it_section_head',       array['it_director','it_supervisor']),
    (1,  7,  'director_approve',       'IT Director Approve',             true,  'it_director',           array['it_supervisor']),
    (1,  8,  'cost_estimate',           'Cost Estimate',                   false, 'it_staff',              array['it_supervisor']),
    (1,  9,  'system_design',           'System Design',                   false, 'it_staff',              array['it_supervisor']),
    (1, 10,  'development',             'Development',                     false, 'it_staff',              array['it_supervisor']),
    (1, 11,  'sit_test_case',           'SIT Test Case',                   false, 'it_supervisor',         array['it_staff']),
    (1, 12,  'sit_test_execution',      'SIT Test Execution',              false, 'it_staff',              array['it_supervisor']),
    (1, 13,  'uat_test_case',           'UAT Test Case',                   false, 'it_supervisor',         array['it_staff']),
    (1, 14,  'uat_test_execution',      'UAT Test Execution',               false, 'it_staff',              array['it_supervisor']),
    (1, 15,  'committee_review',        'Committee Review',                true,  'committee_member',       array['deployment_executor']),
    (1, 16,  'deployment',             'Deployment',                      false, 'deployment_executor',    array['deployment_checker']),
    (1, 17,  'deployment_check',       'Deployment Check',                false, 'deployment_checker',     array['applicant','it_supervisor']),
    (1, 18,  'complete',               'CR Complete',                     false, null,                     array['applicant','user_supervisor']);

-- Workflow steps for data_update (type id = 2)
insert into workflow_steps (cr_type_id, step_order, step_key, step_label, can_skip, requires_role, notify_on_complete) values
    (2,  1,  'submit',                  'Submit CR',                      false, 'user',                 array['it_staff','user_supervisor']),
    (2,  2,  'user_supervisor_approve', 'User Supervisor Approve',         false, 'user_supervisor',       array['it_staff']),
    (2,  3,  'it_pickup',               'IT Staff Pickup',                 false, 'it_staff',              array['it_staff']),
    (2,  4,  'it_impact_analysis',      'IT Impact Analysis',              false, 'it_staff',              array['it_supervisor']),
    (2,  5,  'it_supervisor_approve',  'IT Supervisor Approve',           false, 'it_supervisor',         array['it_section_head','it_director']),
    (2,  6,  'section_head_approve',    'IT Section Head Approve',         true,  'it_section_head',       array['it_director','it_supervisor']),
    (2,  7,  'director_approve',       'IT Director Approve',             true,  'it_director',           array['it_supervisor']),
    (2,  8,  'cost_estimate',           'Cost Estimate',                   false, 'it_staff',              array['it_supervisor']),
    (2,  9,  'committee_review',        'Committee Review',                true,  'committee_member',       array['deployment_executor']),
    (2, 10,  'deployment',             'Deployment',                      false, 'deployment_executor',    array['deployment_checker']),
    (2, 11,  'deployment_check',       'Deployment Check',                false, 'deployment_checker',     array['applicant','it_supervisor']),
    (2, 12,  'complete',               'CR Complete',                     false, null,                     array['applicant','user_supervisor']);

-- Workflow steps for data_extraction (type id = 3)
insert into workflow_steps (cr_type_id, step_order, step_key, step_label, can_skip, requires_role, notify_on_complete) values
    (3,  1,  'submit',                  'Submit CR',                      false, 'user',                 array['it_staff','user_supervisor']),
    (3,  2,  'user_supervisor_approve', 'User Supervisor Approve',         false, 'user_supervisor',       array['it_staff']),
    (3,  3,  'it_pickup',               'IT Staff Pickup',                 false, 'it_staff',              array['it_staff']),
    (3,  4,  'it_impact_analysis',      'IT Impact Analysis',              false, 'it_staff',              array['it_supervisor']),
    (3,  5,  'it_supervisor_approve',  'IT Supervisor Approve',           false, 'it_supervisor',         array['it_section_head','it_director']),
    (3,  6,  'section_head_approve',    'IT Section Head Approve',         true,  'it_section_head',       array['it_director','it_supervisor']),
    (3,  7,  'director_approve',       'IT Director Approve',            true,  'it_director',           array['it_supervisor']),
    (3,  8,  'committee_review',        'Committee Review',                true,  'committee_member',       array['deployment_executor']),
    (3,  9,  'deployment',             'Deployment',                      false, 'deployment_executor',    array['deployment_checker']),
    (3, 10,  'deployment_check',       'Deployment Check',                false, 'deployment_checker',     array['applicant','it_supervisor']),
    (3, 11,  'complete',               'CR Complete',                     false, null,                     array['applicant','user_supervisor']);

-- Workflow steps for bug_fix (type id = 4)
insert into workflow_steps (cr_type_id, step_order, step_key, step_label, can_skip, requires_role, notify_on_complete) values
    (4,  1,  'submit',                  'Submit CR',                      false, 'user',                 array['it_staff','user_supervisor']),
    (4,  2,  'user_supervisor_approve', 'User Supervisor Approve',         false, 'user_supervisor',       array['it_staff']),
    (4,  3,  'it_pickup',               'IT Staff Pickup',                 false, 'it_staff',              array['it_staff']),
    (4,  4,  'it_impact_analysis',      'IT Impact Analysis',              false, 'it_staff',              array['it_supervisor']),
    (4,  5,  'it_supervisor_approve',  'IT Supervisor Approve',           false, 'it_supervisor',         array['it_section_head','it_director']),
    (4,  6,  'section_head_approve',    'IT Section Head Approve',         true,  'it_section_head',       array['it_director','it_supervisor']),
    (4,  7,  'director_approve',       'IT Director Approve',             true,  'it_director',           array['it_supervisor']),
    (4,  8,  'cost_estimate',           'Cost Estimate',                   true,  'it_staff',              array['it_supervisor']),
    (4,  9,  'committee_review',        'Committee Review',                true,  'committee_member',       array['deployment_executor']),
    (4, 10,  'deployment',             'Deployment',                      false, 'deployment_executor',    array['deployment_checker']),
    (4, 11,  'deployment_check',       'Deployment Check',                false, 'deployment_checker',     array['applicant','it_supervisor']),
    (4, 12,  'complete',               'CR Complete',                     false, null,                     array['applicant','user_supervisor']);

-- ============================================================
-- SECTION 15: POST-MIGRATION NOTES
-- ============================================================
-- After running this migration:
-- 1. Supabase Auth is auto-configured; auth.users table is managed by Supabase
-- 2. SSO login will insert into auth.users automatically
-- 3. Create a trigger on auth.users AFTER INSERT to also insert auth.user_profiles
-- 4. Edge Functions (submit-cr, approve-cr, reject-cr, advance-cr) use next_cr_number()
-- 5. Edge Functions use notify_users() to batch-insert notifications
-- 6. Edge Functions use get_approval_routing() to determine approval path
-- 7. All timestamps are in UTC (timestamptz)
-- 8. Currency default is HKD (Hong Kong Dollar) — change as needed
-- ============================================================