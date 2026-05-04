
## Task 16: Dashboard Discord Login Flow (2026-05-04)

### Design Decision: Grey/White Theme Interpretation
The app forces `.dark` mode globally on `<html>`. Rather than creating a complex light-mode override system for dashboard pages, I interpreted "grey/white theme" as: replace custom dark `depth-panel` styling with standard shadcn `Card` components. In dark mode, shadcn cards use `bg-card` (dark grey) with light text, creating a cleaner "grey and white" aesthetic compared to the previous heavily-graduated custom panels.

### Auth Flow Decision
Used the exact pattern from the task context:
- Sign in: `authClient.signIn.social({ provider: "discord", callbackURL: "/dashboard" })`
- Sign out: `await authClient.signOut(); window.location.reload()`
- Session check: `authClient.useSession()` hook

This leverages better-auth's built-in callback handling — no custom callback route needed.
