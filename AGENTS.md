# AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project context
This is NexHyr, a Next.js + Supabase hospitality staffing marketplace.

## Guardrails
- Do not alter authentication flows unless explicitly asked.
- Do not refactor signup/login/session handling.
- Do not rewrite routing or onboarding architecture.
- Preserve existing booking creation flow.
- Do not rename or remove existing core tables/columns unless absolutely necessary.
- Prefer additive changes over refactors.

## Critical rule
- If functionality already exists in the codebase, DO NOT recreate or duplicate it.
- Reuse existing logic, helpers, components, and database fields wherever possible.

## Coding approach
- First inspect the current implementation before making changes.
- Reuse existing patterns and naming conventions.
- Make minimal, safe, incremental changes.
- Avoid large rewrites.

## Feature scope rules
- Only modify code related to the feature being implemented.
- Do not introduce global UI or architectural changes.
- Keep styling consistent with existing design.

## Notifications
- Notification failures must never break booking success.
- Server-side scheduling only for reminders.
- Frontend countdown is display-only.
- WhatsApp logic must be abstracted behind a provider layer.

## Workflow
For every task:
1. Inspect existing code
2. Show affected files
3. Propose plan
4. Then implement
