# Specs

Every piece of work in this repository starts as a spec: a short, public document that says what will be built, why, and how we will know it is done. Code follows the spec, and a review against the spec closes it.

## Lifecycle

Each spec carries a status at the top:

| Status | Meaning |
| --- | --- |
| **Draft** | Being written. Open questions may remain. |
| **Approved** | The owner has reviewed it. Work can start. |
| **Implemented** | The code is written, with a test or check for every acceptance criterion. |
| **Audited** | The work was checked against every acceptance criterion and passed. |

A spec only moves forward. If the requirements need to change during implementation, the change is written into the spec's Implementation notes and agreed before the work continues.

## Numbering

Specs are named `NNN-short-slug.md`, numbered in the order they are written (`001`, `002`, ...). Numbers are never reused. Work on a spec happens on a branch with the same name as the file, without the extension.

## Reading a spec

- **Summary** and **Goals and non-goals** tell you what the work is, and what it deliberately leaves out.
- **Context** describes the code as it was before the work, with file paths.
- **Requirements**, **Design** and **Security** describe what must be true afterwards and the decisions taken to get there, including the alternatives that were rejected.
- **Acceptance criteria** are the numbered, testable checks that define "done". The **Test plan** says how each one is verified.
- **Implementation notes** and **Audit** are filled in later: what changed during the build, and the result of checking the work against the criteria.

Specs describe security as requirements (for example, "admin routes require an authenticated admin"). They never contain secrets, infrastructure addresses, or credential details.

Start a new spec from [`_template.md`](_template.md).
