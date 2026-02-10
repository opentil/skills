# Auto-Detection Guide

This document details how the Agent proactively detects TIL-worthy moments during work sessions.

## Trigger Conditions

### Class A -- High Signal

**Debugging uncovered a non-obvious root cause**

Good example: "The memory leak was caused by a goroutine referencing a closure variable that held the entire HTTP request body, not just the header field we needed."

Bad example: "Fixed the null pointer error by adding a nil check." (Obvious fix, no insight.)

**Language/framework behavior contradicts common assumptions**

Good example: "Python's `defaultdict` calls the factory function even when you're just reading a key with `d[key]` -- it doesn't distinguish reads from writes."

Bad example: "JavaScript has both `==` and `===`." (Well-known, not surprising.)

### Class B -- Medium Signal

**Refactoring revealed a superior pattern**

Good example: "Replacing the chain of `if-else` handlers with a strategy map reduced the function from 80 lines to 15 and made adding new handlers a one-line change."

Bad example: "Renamed variables to be more descriptive." (Cosmetic, no pattern insight.)

**Performance optimization with measurable results**

Good example: "Adding a compound index on (user_id, created_at) reduced the dashboard query from 2.3s to 12ms."

Bad example: "Used caching to make things faster." (Vague, no specifics.)

**Obscure but useful tool flag or API parameter**

Good example: "git diff --word-diff=color shows inline character-level changes instead of full-line diffs, perfect for reviewing prose changes."

Bad example: "Used git log to see commit history." (Basic, widely known.)

### Class C -- Low Signal

**Two technologies interacting unexpectedly**

Good example: "When using PostgreSQL's `jsonb_path_query` with a Rails `where` clause, the query planner can't use the GIN index because Rails wraps the expression in a type cast."

Bad example: "Used Redis with Rails for caching." (Standard pattern, no surprise.)

**Upgrade/migration breaking changes**

Good example: "Ruby 3.2 changed `Struct` keyword arguments to be required by default -- all existing `Struct.new` calls with optional keyword args silently broke."

Bad example: "Updated Node from v18 to v20." (Fact, no insight.)

## What NOT to Detect

Do not suggest TIL capture for:

- Standard usage of tools/APIs (reading docs, running commands)
- Configuration that works as documented
- Bugs caused by typos or simple mistakes
- Widely known best practices (use environment variables, write tests, etc.)
- Anything the user already seems to know well
- Tasks where the user is actively frustrated or stressed -- wait for resolution

## Rate Limiting State Machine

```
[IDLE] ---(TIL-worthy moment detected)---> [EVALUATING]
  ^                                              |
  |                                    (check constraints)
  |                                              |
  |                              +-------+-------+
  |                              |               |
  |                        (constraints     (constraints
  |                          not met)          met)
  |                              |               |
  |                              v               v
  +----(stay idle)----------[IDLE]         [SUGGESTED]
                                              |
                                    +---------+---------+
                                    |                   |
                              (user accepts)      (user declines)
                                    |                   |
                                    v                   v
                               [CAPTURED]        [DONE_FOR_SESSION]
                                    |
                                    v
                             [DONE_FOR_SESSION]
```

**Constraints checked in EVALUATING state:**

1. Has a suggestion already been made this session? -> If yes, stay IDLE
2. Is the user in the middle of active problem-solving? -> If yes, stay IDLE
3. Has the conversation had at least 10 turns? (5 for Class A) -> If no, stay IDLE
4. Is this a natural pause point? -> If no, stay IDLE

Once in DONE_FOR_SESSION, the agent never suggests again until a new session starts.

## Suggestion Format

All classes use the same format. The classification only affects the trigger threshold -- the user does not need to know the class.

Append the suggestion at the end of your normal response. Never interrupt the workflow with a standalone suggestion message.

**Template:**
```
💡 [one sentence insight] -- worth a TIL? Just say /til to capture.
```

**Class A example** (debugging root cause):
```
...so the memory leak was caused by the goroutine holding a reference to the entire request body.

💡 Goroutine closures can silently retain large objects, causing memory leaks -- worth a TIL? Just say /til to capture.
```

**Class B example** (performance optimization):
```
...the compound index on (user_id, created_at) reduced the query from 2.3s to 12ms.

💡 Compound indexes with the right column order can yield 100x+ query speedups -- worth a TIL? Just say /til to capture.
```

**Class C example** (migration breaking change):
```
...Ruby 3.2 changed Struct keyword arguments to be required by default.

💡 Ruby 3.2 makes Struct keyword args required by default, silently breaking existing code -- worth a TIL? Just say /til to capture.
```

## Double Confirmation Flow

```
Agent: [normal response content]

       💡 [insight] -- worth a TIL? Just say /til to capture.

User:  /til

Agent: [Shows full draft: title, body, tags]
       Send this to OpenTIL as a draft?

User:  Yes / Looks good

Agent: [POST to API or save locally]
       [Show result message]
```

The first confirmation is the user typing `/til` -- this triggers the standard extract flow, which auto-selects the suggested insight as the primary candidate.

If the user ignores the suggestion or says "no", move on. Do not ask why or try to persuade.
