# ExecPlan: Workstream E+F — Wizer Snapshots + VFS Tar Export

## Progress

- [x] Design wizer_init() export interface for pre-initialization
- [x] Implement VFS tar serialization (save_tar function)
- [x] Serialize in-memory VFS to POSIX-compliant tar archive
- [x] Handle file metadata (mode, uid, gid, mtime) in tar headers
- [x] Support directories, symlinks, and regular files in export
- [x] Validate round-trip: load tar → modify VFS → export tar → reload
- [x] Build improvements for Wizer compatibility

## Surprises & Discoveries

- POSIX tar header checksum calculation is fiddly — the checksum field
  must be filled with spaces during calculation, then overwritten.
- Symlinks in tar need the linkname field in the header, not file content.
- Wizer integration depends on Emscripten exposing the right export — this
  requires careful build flag management.

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-02 | POSIX tar over custom format | Interop with standard tools; users can inspect with `tar tf` |
| 2025-02 | Combined E+F workstream | VFS export and Wizer snapshots share the serialization code |

## Outcomes & Retrospective

VFS tar serialization works correctly.  The round-trip test validates that
filesystem modifications survive export and reimport.  Wizer snapshot
support is architecturally ready but the actual Wizer build integration
is deferred to a future workstream (tracked in PLANS.md).
