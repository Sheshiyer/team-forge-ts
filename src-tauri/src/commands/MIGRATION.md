# Commands Module Migration Plan

## Current State

The `src-tauri/src/commands/mod.rs` file contains **123 Tauri commands** in a single
**13,720-line file**. This is a maintainability bottleneck that affects:
- Compile times (every change triggers full recompile)
- Code review (large diffs, merge conflicts)
- Testability (hard to isolate units)
- Onboarding (new developers face a wall of code)

## Target Structure

```
src-tauri/src/commands/
├── mod.rs              # Re-exports + module declarations (~50 lines)
├── clockify.rs         # 3 commands - Clockify integration
├── settings.rs         # 2 commands - App settings CRUD
├── vault.rs            # 5 commands - Filesystem operations
├── paperclip.rs        # 26 commands - Paperclip runtime/intake
├── intake.rs           # 5 commands - TeamForge inbox
├── hermes.rs           # 3 commands - Hermes messaging
├── teamforge.rs        # 9 commands - Projects/clients/onboarding
├── sync.rs             # 12 commands - Background sync orchestration
├── analytics.rs        # 10 commands - Overview/insights
├── team.rs             # 20 commands - Employees/org/leave
├── relations.rs        # 4 commands - Entity relations
├── milestones.rs       # 4 commands - Milestones/time accuracy
├── sprints.rs          # 7 commands - Sprints/issues
├── notifications.rs    # 2 commands - Notification feed
├── huly_normalization.rs # 3 commands - Huly workspace cleanup
├── onboarding.rs       # 1 command - Onboarding flows
├── local_vault.rs      # 2 commands - Local vault parity
└── identity.rs         # 6 commands - Identity review/agent feed
```

## Migration Strategy: Incremental, Not Big-Bang

### Phase 1: Foundation (DONE)
- [x] Create empty module files with module declarations
- [x] Create migration plan document
- [x] Verify build still works

### Phase 2: Self-Contained Modules (NEXT)
Migrate modules with no cross-dependencies first. These can be moved
without affecting other code:

1. **settings.rs** (2 functions) - Pure DB CRUD
2. **clockify.rs** (3 functions) - External API calls, no shared state
3. **notifications.rs** (2 functions) - Simple DB queries
4. **onboarding.rs** (1 function) - Single DB query
5. **local_vault.rs** (2 functions) - Filesystem + DB

### Phase 3: Isolated Domains
Modules that are domain-specific but may share some types:

6. **intake.rs** (5 functions) - Inbox routing
7. **hermes.rs** (3 functions) - Message dispatch
8. **relations.rs** (4 functions) - Entity graph
9. **vault.rs** (5 functions) - File operations

### Phase 4: Analytics & Team
Modules with many functions and shared types:

10. **milestones.rs** (4 functions)
11. **sprints.rs** (7 functions)
12. **huly_normalization.rs** (3 functions)
13. **team.rs** (20 functions)
14. **analytics.rs** (10 functions)

### Phase 5: Cross-Cutting (LAST)
Modules that touch many other parts of the system:

15. **teamforge.rs** (9 functions)
16. **sync.rs** (12 functions)
17. **identity.rs** (6 functions)
18. **paperclip.rs** (26 functions - LARGEST)

## How to Migrate One Function

Given a function `pub async fn get_settings(...)` in `mod.rs`:

### Step 1: Add to the target module file
```rust
// src-tauri/src/commands/settings.rs
use std::collections::HashMap;
use tauri::State;
use crate::db::models::Setting;
use crate::DbPool;

#[tauri::command]
pub async fn get_settings(db: State<'_, DbPool>) -> Result<HashMap<String, String>, String> {
    let pool = &db.0;
    // ... full implementation copied from mod.rs
}
```

### Step 2: Remove from mod.rs
Delete the function (and any now-unused imports/helpers).

### Step 3: Update mod.rs to declare the submodule
```rust
// src-tauri/src/commands/mod.rs
pub mod settings;
pub use settings::*;  // Re-export so lib.rs paths still work
```

### Step 4: Verify build
```bash
cd src-tauri && cargo check
```

### Step 5: Run tests
```bash
cd src-tauri && cargo test
```

## Why This Approach

1. **Zero-risk migration**: Each function can be migrated independently
2. **Build always works**: `cargo check` passes after each step
3. **No big-bang refactor**: No "migration branch" that needs to be merged
4. **Incremental review**: Each PR migrates one module
5. **Clear ownership**: One developer per module

## Estimated Effort

| Phase | Functions | Effort | Risk |
|-------|-----------|--------|------|
| 1 (Foundation) | 0 | 30 min | None |
| 2 (Self-contained) | 10 | 2-3 hrs | Low |
| 3 (Isolated) | 17 | 3-4 hrs | Low-Med |
| 4 (Analytics) | 34 | 6-8 hrs | Medium |
| 5 (Cross-cutting) | 53 | 10-15 hrs | Medium-High |
| **Total** | **114** | **22-30 hrs** | |

## Current Status

- **Phase 1**: COMPLETE
- **Phase 2**: settings.rs + clockify.rs scaffolded (proof of concept)
- **Next**: Migrate settings.rs (2 functions) as the first real migration
