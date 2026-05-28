# ITCRMS Security Audit Report

**Date:** 2026-05-28
**Auditor:** Batch D — Security Audit Agent
**Project:** IT Change Request Management System (ITCRMS)
**Tech Stack:** Next.js + TypeScript + Supabase Edge Functions + PostgreSQL (RLS)

---

## Executive Summary

The ITCRMS codebase was reviewed for security vulnerabilities across 7 categories. **9 findings** were identified across severity levels Critical to Low. Most concerning: XSS in the audit log JSON rendering, missing ownership check in `advance-cr`, and lack of RLS policies for `auth.users` writes. No hardcoded secrets were found.

---

## 1. SQL Injection

**Finding:** None

All 7 Edge Functions use the Supabase JS client's typed `.from().select/insert/update()` API. No raw SQL strings or string interpolation in queries is present.

| File | Auth Token | Query Method |
|------|-----------|-------------|
| `submit-cr/index.ts` | ✅ | Supabase client |
| `approve-cr/index.ts` | ✅ | Supabase client |
| `reject-cr/index.ts` | ✅ | Supabase client |
| `advance-cr/index.ts` | ✅ | Supabase client |
| `add-note/index.ts` | ✅ | Supabase client |
| `send-email/index.ts` | ⚠️ No auth required (internal use) | Supabase client |
| `cr-dashboard/index.ts` | ✅ | Supabase client |

---

## 2. XSS (Cross-Site Scripting)

### Finding XSS-1: Audit Log Renders Raw JSON Without Sanitization
- **Severity:** Medium
- **File:** `web/pages/cr/[id].tsx:391`
- **Description:** The audit log section renders `JSON.stringify(entry.details)` directly as inner text. While `JSON.stringify` escapes `<` and `>` by default, if `entry.details` contains a `__proto__` or constructor-based payload (through JSON object pollution), or if a future code change renders this as HTML, XSS could occur. The bigger risk is that developers may change this from `{String(...)}` to `{...}` (raw JSX interpolation) which would be directly exploitable.
- **Code:**
  ```tsx
  {entry.details && typeof entry.details === 'object' ? (
    <div style={{ fontSize: 12, marginTop: 2, color: 'var(--text-secondary)' }}>
      {String(JSON.stringify(entry.details as Record<string, unknown>))}
    </div>
  ) : null}
  ```
- **Recommended Fix:** Use a safe JSON serializer that explicitly escapes HTML, or render each key/value pair individually with React auto-escaping:
  ```tsx
  <pre style={{ fontSize: 12, marginTop: 2, color: 'var(--text-secondary)' }}>
    {JSON.stringify(entry.details, null, 2)}
  </pre>
  ```
  Alternatively, use `dangerouslySetInnerHTML` with a sanitized output only if absolutely necessary, and mark it explicitly.

### Finding XSS-2: Chatroom Mention Highlighter Uses split/map Without HTML Injection Prevention
- **Severity:** Low
- **File:** `web/components/CRChatroom.tsx:52-59`
- **Description:** The `highlightMentions` function splits on regex and maps parts to `<span className="mention">`. The matched pattern correctly identifies `@mentions` but if a message body contains payloads like `<img src=x onerror=alert(1)>`, React renders them as text (not executing JS) since they go through `{part}` JSX expression. This is safe *unless* the span wrapping logic or className injection could somehow be exploited. Current implementation is React-safe.
- **Code:**
  ```tsx
  function highlightMentions(text: string): React.ReactNode {
    const parts = text.split(/(@[\w.-]+@[\w.-]+\.\w+|@\w+)/g)
    return parts.map((part, i) => {
      if (part.match(/^@[\w.-]+@[\w.-]+\.\w+$/) || part.match(/^@\w+$/)) {
        return <span key={i} className="mention">{part}</span>
      }
      return part
    })
  }
  ```
- **Recommended Fix:** The current implementation is safe against XSS because React auto-escapes string values in JSX expressions. No change required unless the rendering approach changes.

### Finding XSS-3: No `dangerouslySetInnerHTML` or `innerHTML` Usage Found
- **Severity:** Informational
- **Description:** Grep searches confirmed zero usage of `dangerouslySetInnerHTML`, direct `innerHTML` assignments, or `textContent` assignments in `web/pages/`. This is positive — the codebase avoids the most dangerous XSS patterns.

---

## 3. IDOR (Insecure Direct Object Reference)

### Finding IDOR-1: `advance-cr` Does Not Verify User Has IT Staff Role
- **Severity:** High
- **File:** `supabase/functions/advance-cr/index.ts:21-24`
- **Description:** The function checks that the CR exists and is at the claimed step, but does NOT verify the caller has the `it_staff` role. Any authenticated user could advance any CR to the next step by calling this function with the correct `cr_id` and `step_key`.
- **Code:**
  ```ts
  const { data: cr } = await supabase.from('change_requests').select('id, current_step_key').eq('id', cr_id).single()
  if (!cr) throw new Error('CR not found')
  if (cr.current_step_key !== step_key) throw new Error(`CR is not at step ${step_key}`)
  // NO role check here
  ```
- **Recommended Fix:** Add role verification before allowing advancement:
  ```ts
  const callerRoles = await getUserRoles(supabase, user.id)
  const itRoles = ['it_staff', 'it_supervisor', 'it_section_head', 'it_director', 'admin']
  if (!callerRoles.some(r => itRoles.includes(r))) throw new Error('Insufficient permissions')
  ```

### Finding IDOR-2: `approve-cr` Allows Any Role-Matched User to Approve Without Ownership Check
- **Severity:** Medium
- **File:** `supabase/functions/approve-cr/index.ts:38-59`
- **Description:** The function checks if the user's role matches `stepRoleMap[currentStep]`, but does not verify that the CR is actually assigned to or manageable by the user. Any user with the matching role can approve any CR at that step — there is no ownership check or assignment verification. For example, a `committee_member` could theoretically approve a CR that isn't yet at the `committee_review` step if they call the function with that step_key.
- **Code:**
  ```ts
  const allowedRoles = stepRoleMap[currentStep] || []
  const hasPermission = callerRoles.some(r => allowedRoles.includes(r)) || allowedRoles.length === 0
  if (!hasPermission) throw new Error(`You do not have permission to approve at step: ${currentStep}`)
  ```
- **Recommended Fix:** Validate that the CR is actually at the step the caller claims AND that the caller is the intended approver (e.g., check the CR's `applicant_supervisor_id` for user_supervisor steps, or verify assignment).

### Finding IDOR-3: `add-note` Does Not Verify CR Access Before Posting Message
- **Severity:** Medium
- **File:** `supabase/functions/add-note/index.ts:21-22`
- **Description:** The function only verifies the CR exists (`select('id').eq('id', cr_id)`), but does not check whether the calling user has any relationship to the CR (applicant, IT role, etc.). Any authenticated user could post messages on any CR.
- **Code:**
  ```ts
  const { data: cr } = await supabase.from('change_requests').select('id').eq('id', cr_id).single()
  if (!cr) throw new Error('CR not found')
  ```
- **Recommended Fix:** Add access check — only the CR applicant, IT roles, or users with existing chat messages on this CR should be able to post.

### Finding IDOR-4: `reject-cr` Missing Step Authorization Check
- **Severity:** Medium
- **File:** `supabase/functions/reject-cr/index.ts:29-34`
- **Description:** The function only checks the CR exists and requires a non-empty `reason`. It does NOT verify that the caller has the appropriate role to reject at the current step. Any authenticated user could reject any CR.
- **Recommended Fix:** Add step-based role check similar to `approve-cr`.

---

## 4. RLS (Row Level Security) Policies

**Status:** 17 of 18 tables have RLS enabled. 1 table missing write policies.

### Tables with RLS enabled (17):
`auth.user_profiles`, `app_roles`, `user_app_roles`, `cr_types`, `workflow_steps`, `system_tiers`, `change_requests`, `cr_impact_analysis`, `cr_cost_estimate`, `cr_system_design`, `cr_sit_test_cases`, `cr_sit_results`, `cr_uat_test_cases`, `cr_uat_results`, `cr_deployment_record`, `cr_chat_messages`, `notifications`, `cr_audit_log`

### Finding RLS-1: `auth.users` Table Has No RLS Policies
- **Severity:** Critical
- **File:** `supabase/migrations/001_initial_schema.sql:527`
- **Description:** The migration enables RLS on `auth.user_profiles` but the `auth.users` table (managed by Supabase Auth) has no RLS policies defined. The migration file DROPs policies on `auth.users` (`DROP POLICY IF EXISTS "it_roles_full_access" ON auth.users;` at line 53) but never recreates them. This means direct access to `auth.users` is unrestricted.
- **Recommended Fix:** Add a select policy to `auth.users`:
  ```sql
  create policy "users_can_view_own"
      on auth.users for select
      using (auth.uid() = id);
  ```

### Finding RLS-2: `change_requests` — Missing Delete Policy
- **Severity:** Low
- **File:** `supabase/migrations/001_initial_schema.sql:682-707`
- **Description:** The `change_requests` table has policies for `select`, `insert`, and `update` operations, but no `delete` policy. If a delete operation is attempted, it will be denied by default. This is likely intentional (CRs should not be deleted), but should be explicitly documented.
- **Recommended Fix:** Add an explicit deny-all delete policy or a comment explaining why deletes are not supported.

### Finding RLS-3: `cr_chat_messages` — User Cannot Insert If Not IT Role
- **Severity:** Medium
- **File:** `supabase/migrations/001_initial_schema.sql:919-921`
- **Description:** The `users_can_post_messages` policy requires `sender_id = auth.uid()`, which is correct. However, the RLS policy is layered on top of the `it_roles_full_access` policy which grants ALL operations to IT roles. A non-IT user who is also the message sender should still be able to insert, but the `it_roles_full_access` for INSERT may conflict with the `users_can_post_messages` policy.
- **Recommended Fix:** Test that a non-IT user (the CR applicant) can successfully post a chat message. The insert policy `users_can_post_messages` with `sender_id = auth.uid()` should allow this, but the interaction with `it_roles_full_access` (which grants INSERT to IT roles) should be verified.

---

## 5. Authentication on Edge Functions

**Finding:** All Edge Functions validate auth token. ✅

| Function | Validates Auth | Method |
|----------|---------------|--------|
| `submit-cr` | ✅ | `getUser(token)` |
| `approve-cr` | ✅ | `getUser(token)` |
| `reject-cr` | ✅ | `getUser(token)` |
| `advance-cr` | ✅ | `getUser(token)` |
| `add-note` | ✅ | `getUser(token)` |
| `send-email` | ⚠️ | No auth header check (internal use only — called by other functions) |
| `cr-dashboard` | ✅ | `getUser(token)` |

`send-email` intentionally has no auth because it is called internally by other edge functions. This is an acceptable design pattern provided it is never exposed as a public API endpoint.

---

## 6. @mention Parsing / ReDoS

### Finding REDOS-1: Mention Regex Is Not Vulnerable to ReDoS
- **Severity:** Low (No ReDoS found)
- **File:** `supabase/functions/add-note/index.ts:28`
- **Code:** `/@([a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g`
- **Analysis:** The regex `@([a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})` uses:
  - `[a-zA-Z0-9_.+-]+` — possessive (no backtracking) character class
  - `[a-zA-Z0-9.-]+` — possessive character class
  - `[a-zA-Z]{2,}` — this is the only potential concern (`{2,}` could backtrack), but the email format requires a `.` before it and proper email structure makes catastrophic backtracking extremely unlikely in practice
  - The `g` (global) flag could cause issues with `exec()` in a loop if the regex has backtracking, but in this specific case, the regex is safe for typical input lengths
- **Recommended Fix (Defense in Depth):** Add input length limit:
  ```ts
  if (body.length > 5000) throw new Error('Message body too long')
  const mentionRegex = /@([a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
  ```
  Or use a non-backtracking regex:
  ```ts
  const mentionRegex = /@([a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?=\s|$|[.,;:!?])/g
  ```

---

## 7. Hardcoded Secrets

**Finding:** None.

All TypeScript files use `Deno.env.get()` or `process.env` to retrieve secrets from environment variables. No hardcoded credentials, API keys, or secrets were found in any `.ts` or `.tsx` file.

| File | Secret | Source |
|------|--------|--------|
| All Edge Functions | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `Deno.env.get()` |
| `send-email/index.ts` | `RESEND_API_KEY` | `Deno.env.get()` |
| `web/pages/_app.tsx` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `process.env` |
| `web/lib/supabase.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `process.env` |

---

## Summary Table

| ID | Category | Severity | File | Line | Title |
|----|---------|----------|------|------|-------|
| XSS-1 | XSS | Medium | `web/pages/cr/[id].tsx` | 391 | Audit log JSON.stringify renders unsanitized details |
| XSS-2 | XSS | Low | `web/components/CRChatroom.tsx` | 52-59 | Mention highlighter — currently safe (React auto-escapes) |
| XSS-3 | XSS | Info | `web/pages/` | — | No dangerouslySetInnerHTML/innerHTML/textContent found |
| IDOR-1 | IDOR | High | `supabase/functions/advance-cr/index.ts` | 21-24 | No IT staff role check before advancing CR |
| IDOR-2 | IDOR | Medium | `supabase/functions/approve-cr/index.ts` | 38-59 | No ownership check — any role-matched user can approve |
| IDOR-3 | IDOR | Medium | `supabase/functions/add-note/index.ts` | 21-22 | No CR access check before posting message |
| IDOR-4 | IDOR | Medium | `supabase/functions/reject-cr/index.ts` | 29-34 | No step-based role check before rejecting |
| RLS-1 | RLS | Critical | `001_initial_schema.sql` | 527 | `auth.users` has no RLS policies |
| RLS-2 | RLS | Low | `001_initial_schema.sql` | 682-707 | `change_requests` has no delete policy |
| RLS-3 | RLS | Medium | `001_initial_schema.sql` | 919-921 | `cr_chat_messages` insert policy interaction needs verification |
| REDOS-1 | ReDoS | Low | `supabase/functions/add-note/index.ts` | 28 | Regex is safe but input length limit recommended |
| SEC-1 | Secrets | Info | — | — | No hardcoded secrets found — all use env vars |

---

## Recommendations (Priority Order)

1. **CRITICAL:** Add RLS policy to `auth.users` table for select operation
2. **HIGH:** Add IT staff role check to `advance-cr` edge function
3. **MEDIUM:** Add ownership/assignment check to `approve-cr`
4. **MEDIUM:** Add CR access check to `add-note` before posting
5. **MEDIUM:** Add step authorization check to `reject-cr`
6. **MEDIUM:** Verify `cr_chat_messages` insert policy works for non-IT applicants
7. **MEDIUM:** Change `JSON.stringify` in audit log to safe renderer
8. **LOW:** Add input length limit to `add-note` body parameter
9. **LOW:** Document/explicitly deny `change_requests` delete operation