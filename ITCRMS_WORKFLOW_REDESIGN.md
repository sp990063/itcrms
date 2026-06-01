# ITCRMS Workflow & Form Data Field Redesign
**Version:** 2.0  
**Date:** 2026-06-01  
**Approach:** 强度思考 (Deep Reasoning) — redesign from first principles using high-level requirement + current system analysis  

---

## 1. Executive Summary

The current ITCRMS implementation has a solid SPEC.md foundation but the workflow logic and form data fields were designed incrementally. This redesign applies **强度思考** — re-examining every user flow, form field, and state transition from scratch against the high-level requirement:

> *A self-hosted internal web application that manages IT service change requests through a multi-stage approval workflow, with role-based access control, email + in-app notifications, per-CR chatrooms with @mentions, and full audit trail.*

### Key Findings
- **5 distinct actor classes** map to the 10 roles: Submitter → Approver Chain (4 levels) → Testing Chain → Committee → Operations
- **18 workflow states** but only ~8 forms currently exist; many step-specific data collections are missing or embedded in JSONB
- **RBAC is coarse** — most pages show "IT only" but don't filter by what actions the specific role can actually perform at the current step
- **Notifications are per-transition** but the trigger logic (Edge Functions) hasn't been fully implemented — currently only `approve-cr`, `reject-cr`, `advance-cr` exist
- **Chatroom @mention** syntax is defined but the notification dispatch from chat messages is not yet implemented

---

## 2. User Journey Maps (Per Role)

### 2.1 Business User (Submitter)
**Roles:** `user`  
**Dashboard看到什麼：**  
- Stats widget: 我的CR count (total, pending, approved, rejected)
- My CRs table: CR-Number, Title, Type, Status, Submitted Date, Current Step
- "Submit New CR" button (prominent)

**Actions they CAN take:**
1. Submit new CR → fills Submit CR Form → becomes DRAFT
2. View own CRs in My CRs page
3. View CR detail (own CRs only)
4. Post messages in chatroom (own CRs only)
5. @mention users in chatroom
6. Cancel own DRAFT CR (before any approval)

**Actions they CANNOT take:**
- Approve anything
- See other users' CRs
- Access IT Staff / Admin pages
- Edit CR after submission

**Notifications received:**
- Your CR was submitted (to IT Team)
- Your CR was approved/rejected by User Supervisor
- Your CR moved to next stage (每步完成後)
- Your CR is complete / rejected

**Journey Flow:**
```
Login → Dashboard (我的 stats)
  → Submit New CR → Submit CR Form → DRAFT
  → My CRs → Click CR → CR Detail (chatroom + timeline)
  → @mention in chatroom → Notification triggered
```

---

### 2.2 User Supervisor
**Roles:** `user_supervisor`  
**Dashboard看到什麼：**  
- Stats: 待我審批 (pending my approval), 團隊CR count
- Team CRs table: show CRs submitted by their direct reports
- "Pending Approvals" banner if any CR awaits their approval

**Actions:**
1. Approve/Reject CRs submitted by their team members (User Supervisor approval step)
2. View team's CRs (filtered by their supervisory relationship)
3. View own CRs (also has `user` role)
4. Post in team CRs' chatrooms

**RBAC note:** `申请人_supervisor_id` in `change_requests` table links submitter → supervisor. User Supervisor sees CRs where `applicant_supervisor_id = auth.uid()`.

**Journey Flow:**
```
Login → Dashboard (team stats + pending count)
  → "Pending Approvals" → List of CRs awaiting User Supervisor approval
  → Click CR → CR Detail → Approve Dialog (with notes)
  → CR moves to PENDING_IT_PICKUP
```

---

### 2.3 IT Staff
**Roles:** `it_staff`  
**Dashboard看到什麼：**  
- Stats: 我的待處理 (pending pickup), 已認領 (claimed), 完成數
- All CRs table (read-only, filtered to IT-relevant stages)
- "Pending Pickup" queue

**Actions:**
1. **Pickup CR** — claim a CR in `PENDING_IT_PICKUP` → becomes assigned to them
2. **Fill Impact Analysis Form** — submit `cr_impact_analysis` data
3. **Fill Cost Estimate Form** — submit `cr_cost_estimate` data
4. **Fill System Design Form** — submit `cr_system_design` data
5. **Fill SIT Test Case Form** — submit `cr_sit_test_cases` data
6. **Advance CR** — move to next workflow step
7. View all CRs (full read access)
8. Post in any CR's chatroom

**Journey Flow:**
```
Login → Dashboard (IT stats)
  → "Pending Pickup" list → Click "Claim" on a CR
  → CR Detail → Fill Impact Analysis Form → Submit
  → CR moves to PENDING_IT_SUPERVISOR
  → (After supervisor approval, CR returns)
  → Fill Cost Estimate → Submit
  → Fill System Design → Submit
  → Fill SIT Test Cases → Submit
  → CR moves to SIT Execution
```

---

### 2.4 IT Supervisor
**Roles:** `it_supervisor`  
**Dashboard看到什麼：**  
- Stats: 待我審批 (IT steps), 團隊IT Staff工作量, 所有CRs狀態分佈
- All CRs with IT-pending status highlighted
- IT Staff workload distribution

**Actions:**
1. **Approve/Reject Impact Analysis** (step: it_supervisor_approve after impact analysis)
2. **Approve/Reject SIT Test Cases** (step: sit_test_case_approve)
3. **Approve/Reject SIT Test Results** (step: sit_execution_approve)
4. **Approve/Reject UAT Test Cases** (step: uat_test_case_approve)
5. **Approve/Reject UAT Test Results** (step: uat_execution_approve)
6. Reassign CR to different IT Staff
7. View all CRs, edit any CR

**Journey Flow:**
```
Login → Dashboard
  → "Pending IT Supervisor Approvals" list
  → Click CR → CR Detail → See Impact Analysis data
  → Approve (with notes) → CR routes based on risk/tier
  → (Later) Approve SIT Test Cases
  → (Later) Approve UAT Test Cases
```

---

### 2.5 IT Section Head
**Roles:** `it_section_head`  
**Dashboard看到什麼：**  
- Stats: 待我審批 (section head approval), High-risk/Tier1/Internet-facing CR count
- CRs that require section head approval

**Actions:**
1. **Approve/Reject CR** at section head approval step
   - Routing condition: high-risk OR tier2 OR internet-facing
2. View all CRs

**Journey Flow:**
```
Login → Dashboard (pending section head approvals)
  → Click CR → CR Detail → Review full context
  → Approve/Reject (with notes)
  → If approved → routes to Director or Cost Estimate
```

---

### 2.6 IT Director
**Roles:** `it_director`  
**Dashboard看到什麼：**  
- Stats: 待我審批, High-priority CR count
- CRs requiring director approval

**Actions:**
1. **Approve/Reject CR** at director approval step
   - Routing condition: high-risk + (tier2 OR tier1h OR internet-facing)

**Journey Flow:**
```
Login → Dashboard
  → Click CR needing director approval
  → Review business case, risk, cost
  → Approve/Reject
  → CR moves to Cost Estimate or Design
```

---

### 2.7 Committee Member
**Roles:** `committee_member`  
**Dashboard看到什麼：**  
- Stats: 待委員會審批 (pending committee review)
- CRs in `PENDING_COMMITTEE` stage only

**Actions:**
1. **Approve/Reject CR** at committee review step
2. View committee-stage CRs only (RBAC restriction)

**Journey Flow:**
```
Login → Dashboard (committee pending count)
  → Click CR → CR Detail (full context + test results)
  → Approve/Reject (with notes)
  → If approved → CR moves to DEPLOYMENT
```

---

### 2.8 Deployment Executor
**Roles:** `deployment_executor`  
**Dashboard看到什麼：**  
- Stats: 待部署CR count
- CRs in `PENDING_DEPLOYMENT` or `PENDING_DEPLOYMENT_CHECK`

**Actions:**
1. **Execute Deployment** — mark deployment as complete, fill `cr_deployment_record`
2. View CRs assigned to them

**Journey Flow:**
```
Login → Dashboard
  → "Pending Deployment" list
  → Click CR → CR Detail → "Execute Deployment" button
  → Fill Deployment Record Form (deployed_by, notes, deployed_at)
  → Submit → CR moves to PENDING_DEPLOYMENT_CHECK
```

---

### 2.9 Deployment Checker
**Roles:** `deployment_checker`  
**Dashboard看到什麼：**  
- Stats: 待檢查CR count (need 2 checkers)
- CRs in `PENDING_DEPLOYMENT_CHECK`

**Actions:**
1. **Perform Deployment Check** — verify deployment, fill checker fields in `cr_deployment_record`
2. Need 2 separate checkers to complete

**Journey Flow:**
```
Login → Dashboard
  → Click CR → CR Detail → "Check Deployment" button
  → Fill check notes → Submit
  → (Second checker does same)
  → When 2 checks complete → CR moves to COMPLETED
```

---

### 2.10 Admin
**Roles:** `admin`  
**Dashboard看到什麼：**  
- All stats across all roles
- User count, role assignments, CR type configurations

**Actions:**
1. Manage CR Types (Admin → CR Types page)
2. Configure Workflow Steps per CR Type
3. Assign roles to users (Admin → Users page)
4. View all users and their role assignments
5. Full read/write access to everything

---

## 3. Form Data Field Specifications

### Form 1: Submit CR Form (`cr/new.tsx`) ✅ Currently exists (CRForm.tsx)

| # | Field Name | DB Column | Type | Validation | Roles | Notes |
|---|-----------|-----------|------|-----------|-------|-------|
| 1 | CR Type | `cr_type_id` | select | Required | All | FK to `cr_types` |
| 2 | Title | `title` | text | Required, ≤200 chars | All | |
| 3 | Description | `description` | textarea | Required, ≤5000 chars | All | |
| 4 | System Tier | `system_tier_id` | select | Required | All | FK to `system_tiers` |
| 5 | Internet Facing | `is_internet_facing` | checkbox | Default false | All | |
| 6 | Risk Level | `risk_level` | radio | Required, {high,medium,low} | All | Default: medium |
| 7 | Attachment | `cr_attachments` (new table) | file | Optional, ≤10MB | All | Supabase Storage |

**Workflow:** Submit → DRAFT → (user clicks "Submit") → `PENDING_USER_SUPERVISOR`

**Additional fields to add:**
- `applicant_supervisor_id` — auto-populated from `auth.users` supervisory relationship (needs `users.supervisor_id` column or lookup via `user_app_roles`)

---

### Form 2: Impact Analysis Form (IT Staff — after claiming CR)

**Triggered at:** `PENDING_IT_IMPACT`  
**Filled by:** IT Staff (assigned or any IT Staff if unassigned)  
**Table:** `cr_impact_analysis`

| # | Field Name | DB Column | Type | Validation | Notes |
|---|-----------|-----------|------|-----------|-------|
| 1 | Affected Systems | `affected_systems` | textarea | Required | Which systems are impacted |
| 2 | Impact Description | `impact_description` | textarea | Required | Business impact details |
| 3 | Rollback Plan | `rollback_plan` | textarea | Required | Step-by-step rollback |
| 4 | Outage Window | `outage_window` | text | Required | e.g., "2026-06-15 02:00-06:00 HKT" |
| 5 | Risk Mitigation | `risk_mitigation` | textarea | Optional | How risks are mitigated |

**Data flow:** IT Staff fills form → calls `advance-cr` edge function → status → `PENDING_IT_SUPERVISOR`

---

### Form 3: Cost Estimate Form (IT Staff)

**Triggered at:** `PENDING_COST_ESTIMATE`  
**Filled by:** IT Staff  
**Table:** `cr_cost_estimate`

| # | Field Name | DB Column | Type | Validation | Notes |
|---|-----------|-----------|------|-----------|-------|
| 1 | Labor Cost (HKD) | `labor_cost` | number | ≥0 | |
| 2 | Material Cost (HKD) | `material_cost` | number | ≥0 | |
| 3 | Total Cost (HKD) | `total_cost` | number | Auto-calculated | `labor + material` |
| 4 | Currency | `currency` | text | Default 'HKD' | |
| 5 | Estimate Notes | `notes` | textarea | Optional | Assumptions, constraints |

**Auto-calculate:** `total_cost = labor_cost + material_cost` (enforce in form JS + DB trigger)

---

### Form 4: System Design Form (IT Staff)

**Triggered at:** `PENDING_DESIGN`  
**Filled by:** IT Staff  
**Table:** `cr_system_design`

| # | Field Name | DB Column | Type | Validation | Notes |
|---|-----------|-----------|------|-----------|-------|
| 1 | Design Details | `design_details` | textarea | Required | Technical design description |
| 2 | Technology Stack | `tech_stack` | text | Optional | Languages, frameworks, infrastructure |
| 3 | Dependencies | `dependencies` | textarea | Optional | External services, libraries |
| 4 | Architecture Diagram | `architecture_diagram` (Storage ref) | file | Optional | Upload to Supabase Storage |

---

### Form 5: SIT Test Case Form (IT Staff)

**Triggered at:** `PENDING_SIT_TEST_CASE`  
**Filled by:** IT Staff  
**Table:** `cr_sit_test_cases`  
**JSONB structure:** `{ test_cases: [{ id, title, steps, expected_result, priority }] }`

| # | Field Name | Sub-field | Type | Validation | Notes |
|---|-----------|-----------|------|-----------|-------|
| 1 | Test Case Title | `title` | text | Required per case | Min 1 case required |
| 2 | Test Steps | `steps` | textarea | Required per case | Numbered steps |
| 3 | Expected Result | `expected_result` | textarea | Required per case | |
| 4 | Priority | `priority` | select | {high,medium,low} | Default medium |
| 5 | Add Case Button | — | action | — | Dynamic add/remove rows |

**Dynamic rows:** JavaScript-managed array of test case objects. "Add Test Case" button adds a new row. Each row has delete button.

---

### Form 6: SIT Test Result Form (SIT Tester)

**Triggered at:** `PENDING_SIT_EXECUTION`  
**Filled by:** SIT Tester (assigned IT Staff or separate role — not currently in spec)  
**Table:** `cr_sit_results`  
**JSONB structure:** `{ results: [{ test_case_id, executed_by, executed_at, actual_result, status }] }`

| # | Field Name | Sub-field | Type | Validation | Notes |
|---|-----------|-----------|------|-----------|-------|
| 1 | Test Case | `test_case_id` | select (readonly) | — | Pre-populated from SIT Test Cases |
| 2 | Executed By | `executed_by` | text (auto) | — | `auth.uid()` |
| 3 | Executed At | `executed_at` | datetime (auto) | — | `now()` |
| 4 | Actual Result | `actual_result` | textarea | Required | What actually happened |
| 5 | Status | `status` | select | {pass,fail,blocked} | Default pass |

**Note:** 2 SIT testers must execute + IT Supervisor must approve results to proceed. Currently not modeled in current system.

---

### Form 7: UAT Test Case Form (IT Supervisor)

**Triggered at:** `PENDING_UAT_TEST_CASE`  
**Filled by:** IT Supervisor  
**Table:** `cr_uat_test_cases`  
**JSONB structure:** Same as SIT but for UAT

| # | Field Name | Sub-field | Type | Validation | Notes |
|---|-----------|-----------|------|-----------|-------|
| 1 | Test Case Title | `title` | text | Required | |
| 2 | Test Steps | `steps` | textarea | Required | |
| 3 | Expected Result | `expected_result` | textarea | Required | |
| 4 | Priority | `priority` | select | {high,medium,low} | |

---

### Form 8: UAT Test Result Form (UAT Tester)

**Triggered at:** `PENDING_UAT_EXECUTION`  
**Filled by:** UAT Tester (business user, not IT — spec says "UAT Tester")  
**Table:** `cr_uat_results`  
**JSONB structure:** Same as SIT Results

| # | Field Name | Sub-field | Type | Validation | Notes |
|---|-----------|-----------|------|-----------|-------|
| 1 | Test Case | `test_case_id` | select | — | |
| 2 | Executed By | `executed_by` | auto | — | |
| 3 | Executed At | `executed_at` | auto | — | |
| 4 | Actual Result | `actual_result` | textarea | Required | |
| 5 | Status | `status` | select | {pass,fail,blocked} | |

**Note:** UAT Tester submits results + IT Supervisor approves → committee review

---

### Form 9: Committee Review Form (Committee Member)

**Triggered at:** `PENDING_COMMITTEE`  
**Filled by:** Committee Member  
**Table:** `cr_audit_log` entry + `change_requests` status update

| # | Field Name | DB Column | Type | Validation | Notes |
|---|-----------|-----------|------|-----------|-------|
| 1 | Decision | `status` next state | radio | {approve,reject} | Required |
| 2 | Review Notes | `notes` in `cr_audit_log.details` | textarea | Required if reject | |
| 3 | Committee Vote | `vote_count` (new) | number | — | Track votes |

**Data flow:** `approve-cr` edge function → status → `PENDING_DEPLOYMENT`

---

### Form 10: Deployment Record Form (Deployment Executor)

**Triggered at:** `PENDING_DEPLOYMENT`  
**Filled by:** Deployment Executor  
**Table:** `cr_deployment_record`

| # | Field Name | DB Column | Type | Validation | Notes |
|---|-----------|-----------|------|-----------|-------|
| 1 | Deployed By | `deployed_by` | auto | — | `auth.uid()` |
| 2 | Deployed At | `deployed_at` | datetime | Required | Actual deployment time |
| 3 | Deployment Notes | `deployment_notes` | textarea | Optional | What was done |
| 4 | Deployment Checklist | `checklist` (new JSONB) | checkbox group | — | Pre-deployment checklist items |

**Checklist items (suggested):**
- [ ] Code review completed
- [ ] Backup taken
- [ ] Rollback plan verified
- [ ] Stakeholders notified

---

### Form 11: Deployment Check Form (Deployment Checker)

**Triggered at:** `PENDING_DEPLOYMENT_CHECK`  
**Filled by:** Deployment Checker (×2 required)  
**Table:** `cr_deployment_record` (updated)

| # | Field Name | DB Column | Type | Validation | Notes |
|---|-----------|-----------|------|-----------|-------|
| 1 | Checker 1 | `check_by_1` | auto | — | First checker |
| 2 | Check 1 Completed At | `check_1_completed_at` | datetime | — | |
| 3 | Check 1 Notes | `check_1_notes` | textarea | Required | |
| 4 | Checker 2 | `check_by_2` | auto | — | Second checker |
| 5 | Check 2 Completed At | `check_2_completed_at` | datetime | — | |
| 6 | Check 2 Notes | `check_2_notes` | textarea | Required | |

**RBAC:** Each checker can only fill their own slot (check_by_1 OR check_by_2, not both). When both complete → status → `COMPLETED`

---

### Form 12: Approval/Rejection Dialog

**Used in:** CR Detail page (`cr/[id].tsx`) — `ApprovalDialog` component  
**Triggered by:** Any approval/rejection step

| # | Field Name | DB Impact | Type | Validation | Notes |
|---|-----------|-----------|------|-----------|-------|
| 1 | Action | — | button group | Required | Approve / Reject (separate dialogs) |
| 2 | Notes | `approvals` JSONB or `cr_audit_log.details` | textarea | Optional (Required if reject) | Reasoning / comments |
| 3 | Skip Step | `can_skip` flag | checkbox | Only if `workflow_steps.can_skip=true` | Admin can skip optional steps |

**Reject requires:** reason/notes — submitted via `reject-cr` edge function

---

### Form 13: CR Detail Page — Display Fields

**Page:** `cr/[id].tsx`  
**Shown fields vary by workflow state and viewer role:**

#### Always shown (read-only):
- CR Number, Title, Description
- CR Type, System Tier, Risk Level, Internet Facing
- Status badge + Current Step
- Step Timeline (all steps, highlighted current)
- Audit Log (collapsible table)

#### Shown when data exists:
- **Impact Analysis:** (if `cr_impact_analysis` record exists) — Affected Systems, Impact Description, Rollback Plan, Outage Window
- **Cost Estimate:** (if `cr_cost_estimate` record exists) — Labor, Material, Total
- **System Design:** (if `cr_system_design` record exists) — Design Details, Tech Stack
- **SIT Test Cases:** (if `cr_sit_test_cases` exists) — Dynamic table of test cases
- **SIT Results:** (if `cr_sit_results` exists) — Dynamic table of results + pass/fail summary
- **UAT Test Cases:** (if `cr_uat_test_cases` exists) — Dynamic table
- **UAT Results:** (if `cr_uat_results` exists) — Dynamic table
- **Deployment Record:** (if `cr_deployment_record` exists) — Who deployed, when, notes
- **Deployment Check:** — Checker 1/2 status + notes

#### Action buttons (role + state dependent):
- "Submit for Approval" (User at DRAFT)
- "Approve" / "Reject" buttons (current approver at their step)
- "Advance" button (IT Staff at their active step)
- "Claim" button (IT Staff at PENDING_IT_PICKUP)
- "Execute Deployment" (Deployment Executor at PENDING_DEPLOYMENT)
- "Check Deployment" (Deployment Checker at PENDING_DEPLOYMENT_CHECK)

---

### Form 14: Admin — CR Type Configuration Form

**Page:** `admin/cr-types.tsx`  
**Table:** `cr_types` + `workflow_steps`  
**CRUD operations:** Create, Read, Update, Deactivate

| # | Field Name | Table | Type | Validation | Notes |
|---|-----------|-------|------|-----------|-------|
| 1 | Type Name | `cr_types.name` | text | Required, unique | e.g., "System Enhancement" |
| 2 | Description | `cr_types.description` | textarea | Optional | |
| 3 | Is Active | `cr_types.is_active` | checkbox | Default true | Soft-delete |
| 4 | Workflow Steps | `workflow_steps` | sub-form | Min 1 step | Per-type step sequence |

**Workflow Steps sub-form (per step):**
| # | Field Name | Column | Type | Validation |
|---|-----------|--------|------|-----------|-------|
| 1 | Step Key | `step_key` | text | Required, unique per type |
| 2 | Step Label | `step_label` | text | Required |
| 3 | Step Order | `step_order` | number | Required, sequential |
| 4 | Can Skip | `can_skip` | checkbox | Default false |
| 5 | Required Role | `requires_role` | select | Which role can perform |
| 6 | Notify On Complete | `notify_on_complete` | multi-select | Roles to notify |

**Step keys (standard set):**
- `submit` → `user_supervisor_approve` → `it_pickup` → `it_impact` → `it_supervisor_approve` → `section_head_approve` → `director_approve` → `cost_estimate` → `system_design` → `development` → `sit_test_case` → `sit_execution` → `uat_test_case` → `uat_execution` → `committee_review` → `deployment` → `deployment_check` → `complete`

---

### Form 15: Admin — Role Assignment Form

**Page:** `admin/users.tsx`  
**Table:** `user_app_roles`  
**Operation:** Assign/remove roles to users

| # | Field Name | Table | Type | Validation | Notes |
|---|-----------|-------|------|-----------|-------|
| 1 | User Email | `auth.users` lookup | select | Required | Searchable dropdown |
| 2 | Roles | `user_app_roles.role_id` | multi-select | At least 1 role | Checkboxes or tag input |
| 3 | Effective From | `user_app_roles.created_at` | auto | — | When assigned |
| 4 | Remove Role | — | button | — | Per-role remove button |

**RBAC:** Only `admin` role can access this form  
**UX pattern:** Search user → Show current roles → Add/remove roles → Save

---

## 4. Workflow State → Action Matrix

| State | Actor | Action | Form | Next State | Notification | Audit Log |
|-------|-------|--------|------|-----------|-------------|-----------|
| `DRAFT` | User | Submit | Submit CR Form | `PENDING_USER_SUPERVISOR` | IT Team + Supervisor | `step_completed: submit` |
| `PENDING_USER_SUPERVISOR` | User Supervisor | Approve | Approval Dialog | `PENDING_IT_PICKUP` | IT Staff, IT Supervisor | `approved: user_supervisor_approve` |
| `PENDING_USER_SUPERVISOR` | User Supervisor | Reject | Rejection Dialog | `REJECTED` | Applicant | `rejected: user_supervisor_approve` |
| `PENDING_IT_PICKUP` | IT Staff | Claim | — (button) | `PENDING_IT_IMPACT` | — | `claimed` |
| `PENDING_IT_IMPACT` | IT Staff | Submit Impact Analysis | Impact Analysis Form | `PENDING_IT_SUPERVISOR` | IT Supervisor | `step_completed: it_impact` |
| `PENDING_IT_SUPERVISOR` | IT Supervisor | Approve | Approval Dialog | *routing* | Applicant, IT Staff | `approved: it_supervisor_approve` |
| `PENDING_IT_SUPERVISOR` | IT Supervisor | Reject | Rejection Dialog | `REJECTED` | Applicant | `rejected: it_supervisor_approve` |
| *routing → `PENDING_SECTION_HEAD` | IT Section Head | Approve | Approval Dialog | `PENDING_DIRECTOR` or `PENDING_COST_ESTIMATE` | IT Director (if director next) | `approved: section_head_approve` |
| *routing → `PENDING_DIRECTOR` | IT Director | Approve | Approval Dialog | `PENDING_COST_ESTIMATE` | IT Staff | `approved: director_approve` |
| *routing → `PENDING_COST_ESTIMATE` | IT Staff | Submit Cost Estimate | Cost Estimate Form | `PENDING_DESIGN` | IT Supervisor | `step_completed: cost_estimate` |
| `PENDING_DESIGN` | IT Staff | Submit System Design | System Design Form | `PENDING_DEVELOPMENT` | IT Supervisor | `step_completed: system_design` |
| `PENDING_DEVELOPMENT` | IT Staff | Mark Development Complete | — (button) | `PENDING_SIT_TEST_CASE` | IT Supervisor | `step_completed: development` |
| `PENDING_SIT_TEST_CASE` | IT Supervisor | Approve Test Cases | Approval Dialog | `PENDING_SIT_EXECUTION` | IT Staff | `approved: sit_test_case` |
| `PENDING_SIT_EXECUTION` | SIT Tester | Submit Results | SIT Test Result Form | (2 results + approve) | IT Supervisor | `step_completed: sit_execution` |
| `PENDING_SIT_EXECUTION` | IT Supervisor | Approve Results | Approval Dialog | `PENDING_UAT_TEST_CASE` | UAT Tester | `approved: sit_execution` |
| `PENDING_UAT_TEST_CASE` | IT Supervisor | Approve Test Cases | Approval Dialog | `PENDING_UAT_EXECUTION` | UAT Tester | `approved: uat_test_case` |
| `PENDING_UAT_EXECUTION` | UAT Tester | Submit Results | UAT Test Result Form | (results + approve) | IT Supervisor | `step_completed: uat_execution` |
| `PENDING_UAT_EXECUTION` | IT Supervisor | Approve Results | Approval Dialog | `PENDING_COMMITTEE` | Committee | `approved: uat_execution` |
| `PENDING_COMMITTEE` | Committee Member | Approve | Approval Dialog | `PENDING_DEPLOYMENT` | Deployment Executor | `approved: committee_review` |
| `PENDING_COMMITTEE` | Committee Member | Reject | Rejection Dialog | `REJECTED` | Applicant, IT Supervisor | `rejected: committee_review` |
| `PENDING_DEPLOYMENT` | Deployment Executor | Execute Deployment | Deployment Record Form | `PENDING_DEPLOYMENT_CHECK` | Applicant, Checkers | `step_completed: deployment` |
| `PENDING_DEPLOYMENT_CHECK` | Deployment Checker 1 | Check | Deployment Check Form | (if checker 2 done → COMPLETED) | — | `checked: deployment_check_1` |
| `PENDING_DEPLOYMENT_CHECK` | Deployment Checker 2 | Check | Deployment Check Form | → `COMPLETED` | Applicant, IT Director | `checked: deployment_check_2` |
| `COMPLETED` | — | — | — | — | Applicant, Supervisor | `completed` |
| `REJECTED` | — | — | — | — | Applicant | `rejected` |

### Routing Logic (from SPEC.md Section 4.1)

```
After IT Supervisor Approve:
  IF high-risk AND (tier2 OR tier1h OR internet-facing):
    → PENDING_SECTION_HEAD → PENDING_DIRECTOR → PENDING_COST_ESTIMATE
  ELIF tier2 OR internet-facing:
    → PENDING_SECTION_HEAD → PENDING_COST_ESTIMATE
  ELSE:
    → PENDING_COST_ESTIMATE
```

---

## 5. Notification Matrix (Refined)

| # | State Transition | Recipients | Type | Subject Template | Body Template |
|---|----------------|-----------|------|-----------------|---------------|
| 1 | DRAFT → PENDING_USER_SUPERVISOR | IT Staff, Supervisor | both | `[ITCRMS] New CR #{cr_number} submitted` | `{user} submitted "{title}". CR Type: {cr_type}. Risk: {risk_level}` |
| 2 | PENDING_USER_SUPERVISOR → PENDING_IT_PICKUP | IT Staff | both | `[ITCRMS] CR #{cr_number} approved by supervisor` | `Your CR "{title}" was approved by {approver}. Ready for IT pickup.` |
| 3 | PENDING_USER_SUPERVISOR → REJECTED | Applicant | both | `[ITCRMS] CR #{cr_number} rejected` | `Your CR "{title}" was rejected by {approver}. Reason: {notes}` |
| 4 | IT Staff claims CR | IT Supervisor | in-app | `[ITCRMS] CR #{cr_number} claimed` | `{it_staff} claimed CR "{title}"` |
| 5 | PENDING_IT_IMPACT → PENDING_IT_SUPERVISOR | IT Supervisor | both | `[ITCRMS] Impact Analysis submitted for CR #{cr_number}` | `{it_staff} submitted impact analysis for "{title}". Awaiting your approval.` |
| 6 | PENDING_IT_SUPERVISOR → PENDING_SECTION_HEAD | IT Section Head | both | `[ITCRMS] CR #{cr_number} requires section head approval` | `CR "{title}" (Risk: {risk_level}, Tier: {tier}) requires your approval.` |
| 7 | PENDING_IT_SUPERVISOR → PENDING_COST_ESTIMATE | IT Staff | both | `[ITCRMS] CR #{cr_number} approved by IT Supervisor` | `Your CR "{title}" was approved by {it_supervisor}. Proceed with cost estimate.` |
| 8 | PENDING_IT_SUPERVISOR → REJECTED | Applicant | both | `[ITCRMS] CR #{cr_number} rejected by IT` | `Your CR "{title}" was rejected by {it_supervisor}. Reason: {notes}` |
| 9 | PENDING_SECTION_HEAD → PENDING_DIRECTOR | IT Director | both | `[ITCRMS] CR #{cr_number} requires director approval` | `CR "{title}" requires your approval (Section Head approved).` |
| 10 | PENDING_SECTION_HEAD → REJECTED | Applicant, IT Supervisor | both | `[ITCRMS] CR #{cr_number} rejected by Section Head` | `CR "{title}" rejected by {section_head}. Reason: {notes}` |
| 11 | PENDING_DIRECTOR → PENDING_COST_ESTIMATE | IT Staff | both | `[ITCRMS] CR #{cr_number} approved by Director` | `Director approved. Proceed with cost estimate for "{title}".` |
| 12 | PENDING_DIRECTOR → REJECTED | Applicant, IT Supervisor | both | `[ITCRMS] CR #{cr_number} rejected by Director` | `CR "{title}" rejected by {director}. Reason: {notes}` |
| 13 | PENDING_COST_ESTIMATE → PENDING_DESIGN | IT Supervisor | both | `[ITCRMS] Cost estimate submitted for CR #{cr_number}` | `{it_staff} submitted cost estimate (HKD {total_cost}) for "{title}".` |
| 14 | PENDING_DESIGN → PENDING_DEVELOPMENT | IT Supervisor | both | `[ITCRMS] System design submitted for CR #{cr_number}` | `Design submitted for "{title}". Awaiting development.` |
| 15 | PENDING_DEVELOPMENT → PENDING_SIT_TEST_CASE | IT Supervisor | both | `[ITCRMS] Development complete for CR #{cr_number}` | `{it_staff} marked development complete. Submit SIT test cases.` |
| 16 | PENDING_SIT_TEST_CASE → PENDING_SIT_EXECUTION | IT Staff, SIT Tester | both | `[ITCRMS] SIT test cases approved for CR #{cr_number}` | `SIT test cases approved. Execute tests.` |
| 17 | PENDING_SIT_EXECUTION → PENDING_UAT_TEST_CASE | UAT Tester | both | `[ITCRMS] SIT complete for CR #{cr_number} — submit UAT cases` | `SIT passed. Submit UAT test cases for "{title}".` |
| 18 | PENDING_UAT_TEST_CASE → PENDING_UAT_EXECUTION | UAT Tester | both | `[ITCRMS] UAT test cases approved for CR #{cr_number}` | `UAT test cases approved. Execute tests.` |
| 19 | PENDING_UAT_EXECUTION → PENDING_COMMITTEE | Committee | both | `[ITCRMS] UAT complete — CR #{cr_number} ready for committee` | `UAT passed for "{title}". Submit for committee review.` |
| 20 | PENDING_COMMITTEE → PENDING_DEPLOYMENT | Deployment Executor | both | `[ITCRMS] CR #{cr_number} approved — ready for deployment` | `CR "{title}" approved by committee. Execute deployment.` |
| 21 | PENDING_COMMITTEE → REJECTED | Applicant, IT Supervisor | both | `[ITCRMS] CR #{cr_number} rejected by committee` | `CR "{title}" rejected by committee. Reason: {notes}` |
| 22 | PENDING_DEPLOYMENT → PENDING_DEPLOYMENT_CHECK | Deployment Checker 1 & 2 | both | `[ITCRMS] Deployment complete — check required for CR #{cr_number}` | `{executor} completed deployment. Verify and check.` |
| 23 | PENDING_DEPLOYMENT_CHECK → COMPLETED | Applicant, IT Director | both | `[ITCRMS] CR #{cr_number} COMPLETED` | `CR "{title}" has been successfully deployed and checked.` |
| 24 | @mention in Chatroom | Mentioned user | both | `[ITCRMS] @{user} mentioned in CR #{cr_number}` | `{mentioner} mentioned you in "{title}": {message_excerpt}` |

---

## 6. RBAC Per-Page Access Matrix

| Page | URL | Who Can ACCESS | Who Sees Nav Link | Who Can EDIT |
|------|-----|---------------|-----------------|-----------------|
| Dashboard | `/` | All authenticated | All authenticated | — (read-only stats) |
| Submit CR | `/cr/new` | `user`, `user_supervisor`, `it_staff`, `it_supervisor`, `it_section_head`, `it_director`, `admin` | Same as ACCESS | `user` submit button only |
| My CRs | `/cr/my` | All authenticated | All authenticated | — (read-only list) |
| All CRs | `/cr/all` | `it_staff`, `it_supervisor`, `it_section_head`, `it_director`, `committee_member`, `deployment_executor`, `deployment_checker`, `admin` | IT+ roles | — (read-only list) |
| CR Detail | `/cr/[id]` | RBAC-filtered: own CRs for User; team CRs for Supervisor; all for IT+ | RBAC-filtered | Action buttons (role + state dependent) |
| Admin Users | `/admin/users` | `admin` only | `admin` only | `admin` — role assignment form |
| Admin Roles | `/admin/roles` | `admin` only | `admin` only | `admin` — role CRUD |
| Admin CR Types | `/admin/cr-types` | `admin` only | `admin` only | `admin` — CR type + workflow config |
| Login | `/auth/login` | Public (unauthenticated) | — | — |
| SSO Callback | `/auth/callback` | Public (OAuth redirect) | — | — |

### Nav Items (sidebar or top nav)
- **Dashboard** — always visible to authenticated users
- **My CRs** — always visible to authenticated users
- **All CRs** — visible to IT+ roles
- **Admin ▼** — only visible to `admin` role (collapsible section)

---

## 7. Recommended Database Schema Changes

### 7.1 New Tables/Columns Needed

```sql
-- 1. CR Attachments (new table)
create table cr_attachments (
    id              uuid primary key default gen_random_uuid(),
    cr_id           uuid references change_requests(id) on delete cascade,
    file_name       text not null,
    file_url        text not null,
    file_size       integer,
    mime_type       text,
    uploaded_by     uuid references auth.users(id),
    created_at      timestamptz default now()
);

-- 2. User supervisory relationship (for User Supervisor filtering)
alter table auth.users add column supervisor_id uuid references auth.users(id);
create index idx_users_supervisor on auth.users(supervisor_id);

-- 3. Deployment check split (checker 1 and 2 separate fields)
alter table cr_deployment_record add column check_1_completed_at timestamptz;
alter table cr_deployment_record add column check_1_notes text;
alter table cr_deployment_record add column check_2_completed_at timestamptz;
alter table cr_deployment_record add column check_2_notes text;
alter table cr_deployment_record rename column check_completed_at to check_1_completed_at; -- backwards compat

-- 4. CR claimed_by (IT Staff assignment)
alter table change_requests add column claimed_by uuid references auth.users(id);

-- 5. CR assignee tracking (current IT staff responsible)
alter table change_requests add column assigned_to uuid references auth.users(id);

-- 6. UAT Tester assignment
alter table change_requests add column uat_tester_id uuid references auth.users(id);

-- 7. SIT Tester assignment
alter table change_requests add column sit_tester_id uuid references auth.users(id);

-- 8. Committee vote tracking (new table)
create table cr_committee_votes (
    id              uuid primary key default gen_random_uuid(),
    cr_id           uuid references change_requests(id) on delete cascade,
    committee_member_id uuid references auth.users(id),
    vote            text check (vote in ('approve', 'reject')),
    notes           text,
    voted_at        timestamptz default now(),
    unique (cr_id, committee_member_id)
);
```

### 7.2 Index Additions

```sql
create index idx_cr_deployment_record_check1 on cr_deployment_record(check_by_1) where check_by_1 is not null;
create index idx_cr_deployment_record_check2 on cr_deployment_record(check_by_2) where check_by_2 is not null;
create index idx_cr_committee_votes_cr on cr_committee_votes(cr_id);
create index idx_change_requests_claimed_by on change_requests(claimed_by) where claimed_by is not null;
create index idx_change_requests_assigned_to on change_requests(assigned_to) where assigned_to is not null;
```

### 7.3 Trigger for Auto-creating User Profile

```sql
create or replace function handle_new_user()
returns trigger as $$
begin
    insert into public.user_profiles (id, display_name)
    values (new.id, new.raw_user_meta_data->>'display_name')
    on conflict (id) do nothing;
    return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure handle_new_user();
```

---

## 8. Recommended Edge Function Signatures

### 8.1 `submit-cr` (already in spec)
```typescript
// POST /functions/v1/submit-cr
// Body: { cr_id: uuid }
// Action: Change DRAFT → PENDING_USER_SUPERVISOR
// Side effects:
//   - Update status, current_step_key, current_step_order
//   - Set submitted_at
//   - Insert cr_audit_log
//   - Trigger notifications to IT Staff + Supervisor
```

### 8.2 `pickup-cr` (NEW — not yet implemented)
```typescript
// POST /functions/v1/pickup-cr
// Body: { cr_id: uuid }
// Action: PENDING_IT_PICKUP → PENDING_IT_IMPACT
// Auth: requires it_staff role
// Side effects:
//   - Set claimed_by = auth.uid()
//   - Set assigned_to = auth.uid()
//   - Update status
//   - Insert cr_audit_log
```

### 8.3 `approve-cr` (already in spec — needs notification triggers)
```typescript
// POST /functions/v1/approve-cr
// Body: { cr_id: uuid, step_key: string, notes?: string }
// Auth: role must match requires_role for this step
// Action: advance to next step based on routing logic
// Side effects:
//   - Append to approvals JSONB
//   - Update status, current_step_key, current_step_order
//   - Insert cr_audit_log
//   - Send notifications per notification matrix
```

### 8.4 `reject-cr` (already in spec)
```typescript
// POST /functions/v1/reject-cr
// Body: { cr_id: uuid, step_key: string, reason: string }
// Action: status → REJECTED
// Side effects:
//   - Update status
//   - Insert cr_audit_log with reason
//   - Notify applicant
```

### 8.5 `advance-cr` (already in spec)
```typescript
// POST /functions/v1/advance-cr
// Body: { cr_id: uuid, step_key: string }
// Used by IT Staff to submit step data (impact analysis, cost estimate, etc.)
// Auth: requires it_staff role
// Action: submit current step data → advance to next IT step
// Side effects:
//   - Upsert into step-specific table (cr_impact_analysis, cr_cost_estimate, etc.)
//   - Update status, current_step_key
//   - Insert cr_audit_log
```

### 8.6 `chat-message` (NEW — not yet implemented)
```typescript
// POST /functions/v1/chat-message
// Body: { cr_id: uuid, body: string, mentions: string[] }
// Auth: must have access to this CR (RBAC)
// Action: insert chat message + parse @mentions
// @mention format:
//   @user@domain.com → notify specific user
//   @it-staff → notify all users with it_staff role
// Side effects:
//   - Insert into cr_chat_messages
//   - For each @mention: insert into notifications + send email
//   - Insert cr_audit_log
```

### 8.7 `cr-stats` (NEW — replaces ad-hoc dashboard queries)
```typescript
// GET /functions/v1/cr-stats
// Query: { user_id: uuid }
// Returns: {
//   my_total: number,
//   my_pending: number,
//   my_completed: number,
//   my_rejected: number,
//   pending_my_approval: number,  (for supervisors)
//   team_cr_count: number,         (for supervisors)
//   it_pending_pickup: number,     (for it_staff)
//   ... per-role stats
// }
// Auth: authenticated user
```

### 8.8 `execute-deployment` (NEW)
```typescript
// POST /functions/v1/execute-deployment
// Body: { cr_id: uuid, deployed_at: timestamptz, notes?: string, checklist: jsonb }
// Auth: requires deployment_executor role
// Action: status → PENDING_DEPLOYMENT_CHECK
// Side effects:
//   - Upsert cr_deployment_record (set deployed_by, deployed_at, deployment_notes, checklist)
//   - Update status
//   - Insert cr_audit_log
//   - Notify 2 deployment checkers
```

### 8.9 `check-deployment` (NEW)
```typescript
// POST /functions/v1/check-deployment
// Body: { cr_id: uuid, notes: string }
// Auth: requires deployment_checker role
// Action:
//   - If check_by_1 is null: set check_by_1, check_1_completed_at, check_1_notes
//   - Else if check_by_2 is null: set check_by_2, check_2_completed_at, check_2_notes
//   - If both checkers done: status → COMPLETED
// Side effects:
//   - Update cr_deployment_record
//   - Insert cr_audit_log
//   - If COMPLETED: notify applicant + director
```

### 8.10 `assign-roles` (NEW)
```typescript
// POST /functions/v1/assign-roles
// Body: { user_id: uuid, role_ids: number[] }
// Auth: requires admin role
// Action: replace user_app_roles for this user with new role_ids
// Side effects:
//   - Delete existing user_app_roles for user_id
//   - Insert new user_app_roles
//   - Insert cr_audit_log (admin action)
```

---

## 9. Gap Analysis: Current Implementation vs. Redesign

### Missing Forms (not yet implemented)
- ❌ Impact Analysis Form (standalone page or section in CR detail)
- ❌ Cost Estimate Form
- ❌ System Design Form
- ❌ SIT Test Case Form
- ❌ SIT Test Result Form
- ❌ UAT Test Case Form
- ❌ UAT Test Result Form
- ❌ Committee Review Form
- ❌ Deployment Record Form
- ❌ Deployment Check Form
- ❌ Chat @mention → notification trigger (Edge Function not implemented)

### Missing Features
- ❌ Pickup/Claim CR flow (no `claimed_by` field yet)
- ❌ IT Staff workload distribution on dashboard
- ❌ Committee vote tracking (multiple committee members)
- ❌ CR attachment upload (new table needed)
- ❌ User `supervisor_id` for team CR filtering
- ❌ UAT Tester assignment
- ❌ SIT Tester assignment
- ❌ Deployment checklist
- ❌ Step-specific form pages (currently all step data is JSONB-embedded)

### RBAC Issues (current)
- ⚠️ `cr/all.tsx` — no role filtering on which CRs to show (IT staff see all but need to filter by `it_staff` role)
- ⚠️ `cr/[id].tsx` — action buttons don't check `requires_role` from `workflow_steps` — any IT role can approve any step
- ⚠️ User Supervisor RBAC — `user_supervisor` sees all CRs in `/cr/all`, should only see team CRs

---

## 10. Priority Implementation Order

### Phase 1: Core Workflow Fixes
1. Fix `workflow_steps.requires_role` check in `approve-cr` edge function
2. Add `claimed_by` and `assigned_to` to `change_requests`
3. Implement `pickup-cr` edge function
4. Implement Impact Analysis Form + data flow
5. Add User Supervisor team filtering (via `supervisor_id`)

### Phase 2: Complete the Approval Chain
6. Implement Cost Estimate Form + data flow
7. Implement System Design Form + data flow
8. Add section_head → director routing logic in `approve-cr`
9. Add Director approval step

### Phase 3: Testing & Committee
10. Implement SIT/UAT Test Case + Result forms
11. Implement `sit_execution_approve` and `uat_execution_approve` logic
12. Implement Committee vote tracking (multiple members)
13. Implement `chat-message` edge function with @mention → notification

### Phase 4: Deployment
14. Implement Deployment Record Form
15. Implement Deployment Check Form (2-checker logic)
16. Add deployment checklist to form

### Phase 5: Polish
17. Dashboard stats per-role (new `cr-stats` edge function)
18. CR attachment upload
19. Full notification email integration (SMTP edge function)
20. Mobile-responsive chatroom UI