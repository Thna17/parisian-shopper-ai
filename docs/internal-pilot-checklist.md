# Internal Pilot Launch Checklist

**Document:** `/docs/internal-pilot-checklist.md`  
**Target Date:** Week of Launch  
**Duration:** 2 Weeks (10 Business Days)  
**Pilot Cohort:** 5 Staff Members (3 Marketing Editors, 2 Senior Marketing Approvers)  

---

## 1. Pilot Objectives & Guardrails

### Primary Objectives
1. Validate real-world editing and revision workflow ergonomics in Telegram.
2. Confirm 100% detection of factual inconsistencies on real retail catalogue items.
3. Quantify copy generation time reduction (target: > 60% reduction vs manual drafting).
4. Measure staff satisfaction and system usability.

### Strict Non-Functional Guardrails
- **Publishing Prohibition:** No content generated during the pilot will be automatically posted or published to social media.
- **Catalogue Isolation:** Uses staging environment with real catalogue snapshots or approved pilot product subsets.
- **Terminal State Discipline:** Once a draft is `APPROVED`, it is exported manually by staff into existing scheduling tools.

---

## 2. Participant Onboarding & Enrollment

### Cohort Roles
| Staff Name | Telegram Username | Assigned Role | Permissions |
|---|---|---|---|
| Pilot Lead | `@marketing_lead` | `MARKETING_APPROVER` | Full create, edit, regen, approve, reject |
| Senior Reviewer | `@senior_editor` | `MARKETING_APPROVER` | Full create, edit, regen, approve, reject |
| Copywriter 1 | `@copywriter_one` | `MARKETING_EDITOR` | Create, edit, regen only |
| Copywriter 2 | `@copywriter_two` | `MARKETING_EDITOR` | Create, edit, regen only |
| Copywriter 3 | `@copywriter_three` | `MARKETING_EDITOR` | Create, edit, regen only |

### Enrollment Procedure
Run the enrollment SQL script for each participant:
```sql
INSERT INTO users (id, display_name, status, created_at, updated_at)
VALUES (gen_random_uuid(), 'Pilot User Name', 'ACTIVE', NOW(), NOW())
RETURNING id;

-- Connect role
INSERT INTO user_roles (id, user_id, role_id, created_at)
VALUES (gen_random_uuid(), '<USER_ID>', (SELECT id FROM roles WHERE code = 'MARKETING_EDITOR'), NOW());

-- Connect Telegram Identity
INSERT INTO telegram_identities (id, user_id, telegram_user_id, telegram_username, created_at, updated_at)
VALUES (gen_random_uuid(), '<USER_ID>', <NUMERIC_TELEGRAM_ID>, 'username_handle', NOW(), NOW());
```

---

## 3. Daily Pilot Operating Cadence

1. **Morning Standup / Sync (10 Mins):**
   - Check daily catalogue items assigned for promotion.
   - Review any blocked drafts from previous day.
2. **Operations Monitoring (Twice Daily):**
   - Engineering on-call runs `pnpm queue:status` and `pnpm outbox:status`.
   - Monitor Sentry / application logs for unhandled errors.
3. **Feedback Capture:**
   - Dedicated Telegram support group `#parisian-ai-pilot-support`.
   - Log copy quality feedback in shared Pilot Feedback Sheet.

---

## 4. Pilot Success & Exit Criteria

| Metric | Target | Verification Method |
|---|---|---|
| **System Availability** | **> 99.5%** | Uptime monitoring during business hours (9am - 7pm). |
| **Factual Accuracy** | **100% Grounding** | 0 unverified prices or hallucinated claims escaping validation. |
| **Workflow Completion** | **> 90%** | Jobs initiated reach `APPROVED` or `REJECTED` within 2 revisions. |
| **User Satisfaction** | **>= 4.2 / 5.0** | Post-pilot survey across all 5 participants. |
| **Time Savings** | **>= 60%** | Average drafting time drops from 25 mins to < 5 mins per post. |
