*Evidence for downstream upstream tracking.*

# Fork upstream tracking proof

- Input/detection contracts (^tracking-inputs, ^tracking-detection): `test/repo/upstream-tracking.test.ts` compares against integrated SHA, checks relevant paths, changed stable releases and default branches.
- Draft preservation (^tracking-drafts): the same suite checks open-track deduplication and existing-branch refusal; create-only lease behavior is enforced by Git's transport, not emulated as a hosted service.
- Integration (^tracking-integration): synthetic repository tests preserve versions and dependency edits and cover ancestry/conflicts. The catch-up merge retains both real upstream/fork parents; conflicted stage tests retain both cases.
- Validation (^tracking-validation): workflow contract tests check permissions, credential persistence, forced tests and publisher gates. Final-SHA GitHub run links belong in the draft PR, never a self-referential manifest SHA.
