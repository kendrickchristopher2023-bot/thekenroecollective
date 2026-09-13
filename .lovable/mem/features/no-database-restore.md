---
name: Never trigger a database restore
description: Permanent ban on agent-initiated Cloud database restores; only Christopher may execute one
type: constraint
---
Never trigger a database restore, under any circumstances, for any reason: not to undo a migration, recover from a mistake, or reset test state. If a restore looks like the right answer, STOP, explain what happened and why, and let Christopher decide and execute.

**Why:** Cloud restore is full-database, reverts schema as well as data, and is irreversible once confirmed. Preview and production share one database, so a restore would roll schema back under newer deployed code and cause an outage. Retention is ~14 days (shorter than the project's own 30-day export) and storage objects are not included, so songs and photos would not come back. A restore is a two-step last resort (restore, then publish a matching code version), never a quick fix.
