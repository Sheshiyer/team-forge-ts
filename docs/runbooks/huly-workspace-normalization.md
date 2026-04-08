# Huly Workspace Normalization Runbook

This runbook executes GitHub issue `#18` safely and manually. It is designed for the current state of TeamForge, where live Huly write-paths are not yet verified for destructive or structural mutations.

## Scope

This runbook covers:

- project renames and project creation
- issue redistribution
- department cleanup
- channel creation
- duplicate person cleanup
- document cleanup
- default board decision

This runbook does not cover:

- enums
- classes
- tag hierarchies
- relations
- training, sprint, or onboarding seeding

Those belong to later issues after the workspace shell is clean.

## Preflight

Complete these before changing anything:

- [ ] Confirm the rollout window and pause ad-hoc workspace edits during the session.
- [ ] Capture screenshots of current projects, departments, channels, people, docs, and board.
- [ ] Export or record the current list of project names.
- [ ] Export or record the 37 current issues and which project they belong to.
- [ ] Export or record the current departments and members.
- [ ] Export or record the current channel list.
- [ ] Identify both `Akshay Balraj` records and note which one is canonical.
- [ ] Confirm whether any untitled docs contain real content that must be preserved.

## Safety Rules

- Make one category of change at a time.
- Verify after each category before moving on.
- Prefer rename over delete when preserving history matters.
- If a step changes ownership or membership, record the before and after state.
- Do not start foundation data creation until this runbook is complete.

## Execution Order

### Step 1: Normalize Projects

Required end state:

- `HEYZA` -> `Axtech`
- `TIRAK` -> `Tirak-App` after confirmation
- `VIBRA` -> `Vibrasonix`
- create `Tuya clients`
- create `OASIS R&D`
- create `Internal Ops`

Checklist:

- [ ] Rename `HEYZA` to `Axtech`
- [ ] Confirm `TIRAK` naming and rename if needed
- [ ] Rename `VIBRA` to `Vibrasonix`
- [ ] Create `Tuya clients`
- [ ] Create `OASIS R&D`
- [ ] Create `Internal Ops`

Verification:

- [ ] Project list exactly matches the target names
- [ ] No legacy project names remain

Rollback:

- project rename can be reversed immediately if applied to the wrong container

### Step 2: Redistribute Existing Issues

Goal: the current 37 issues should no longer sit in the wrong container by default.

Checklist:

- [ ] Review all 37 existing issues
- [ ] Move Axtech-related issues into `Axtech`
- [ ] Move Tuya-related issues into `Tuya clients`
- [ ] Move internal/process issues into `Internal Ops`
- [ ] Leave only intentionally relevant items in each project

Verification:

- [ ] Every issue belongs to the correct target project
- [ ] No issue remains in a legacy container accidentally

Rollback:

- issue-to-project moves should be recorded in a change log so they can be reversed one by one

### Step 3: Replace the Default Department Structure

Required end state:

- `Engineering`
- `Marketing`
- `Leadership`

Checklist:

- [ ] Create `Engineering`
- [ ] Create `Marketing`
- [ ] Create `Leadership`
- [ ] Assign members to the correct department
- [ ] Assign department heads
- [ ] Archive or remove the default `Organization` department once replacements are verified

Verification:

- [ ] Every active member is mapped to the correct department
- [ ] No one is orphaned without a department
- [ ] The default department is no longer the active operating structure

Rollback:

- keep the default department until replacements are populated and verified

### Step 4: Create Operational Channels

Required channels:

- `#standups`
- `#axtech`
- `#tuya-clients`
- `#research-rnd`
- `#tech-resources`
- `#blockers-urgent`
- `#training-questions`

Checklist:

- [ ] Create each missing channel
- [ ] Set channel purpose text
- [ ] Add the correct default members
- [ ] Pin one starter message or operating note where useful

Verification:

- [ ] Channel list matches target set
- [ ] Channel names are consistent and not duplicated

Rollback:

- empty or incorrect channels can be archived and recreated cleanly

### Step 5: Resolve the Duplicate Person Record

Checklist:

- [ ] Identify the canonical `Akshay Balraj` record
- [ ] Move any memberships, issue assignments, or references from the duplicate to the canonical record
- [ ] Archive or delete the duplicate only after references are verified

Verification:

- [ ] Only one active `Akshay Balraj` record remains
- [ ] No tasks or memberships are left on the duplicate

Rollback:

- do not delete the duplicate until all references are moved

### Step 6: Normalize Documents

Checklist:

- [ ] Review all 8 untitled documents
- [ ] Rename documents that contain useful content
- [ ] Archive clearly empty placeholders
- [ ] Identify candidates for future `Knowledge_Article` migration

Verification:

- [ ] No untitled docs remain without an intentional reason
- [ ] Useful content is preserved under meaningful names

Rollback:

- archive before delete when uncertain

### Step 7: Decide the Default Board

Checklist:

- [ ] Inspect the default board and confirm whether it has real usage
- [ ] If useful, seed it with starter cards
- [ ] If not useful, archive it

Verification:

- [ ] The board is either intentionally used or intentionally removed

## Evidence Log

Capture evidence for each step:

| Step | Evidence to capture |
| :--- | :------------------ |
| Projects | final project list screenshot |
| Issues | issue distribution by project |
| Departments | department/member screenshot |
| Channels | channel list screenshot |
| Duplicate person | before/after people search |
| Documents | renamed docs list |
| Board | board screenshot or archive confirmation |

## Completion Criteria

Issue `#18` is complete only when:

- target project names exist
- active issues are distributed intentionally
- department structure matches the design
- required operational channels exist
- duplicate person record is resolved
- untitled documents are normalized
- the default board is intentionally used or removed

## Next Step After This Runbook

Once this runbook is complete, move immediately to the foundation issues:

1. `#1` enums
2. `#2` classes
3. `#3` tag hierarchies
4. `#4` relations

Do not seed operations or dashboards before those foundation layers exist.
