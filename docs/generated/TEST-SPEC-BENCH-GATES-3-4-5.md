# Spec/Bench Gate Template: #3 #4 #5

This defines anti-fake gates for the remaining high-impact items before implementation.

## Shared anti-fake rules (all three)

1. Semantic gate must pass first
- Workload must produce expected terminal output and exit code 0.

2. A/B must differ by exactly one feature toggle
- Keep command, rootfs, and all other query params identical.

3. Engagement proof required
- Add at least one metric proving the optimized path actually executed.

4. Impact gate must use distribution metrics
- Minimum: median and p95 across N>=3 runs.
- Gate must fail if impact threshold is not met.

5. Artifact required
- Write JSON output into `tests/perf/*.latest.json` for review.

---

## #3 Stream rootfs into Worker

### A/B toggle
- Control: `?nostreamrootfs=1`
- Candidate: `?streamrootfs=1`

### Engagement proof
- `stream_bytes_before_boot`
- `first_unpack_started_ms`

### Impact gate
- Improve `first_output_s` median by >= 15%.
- Improve `completion_s` p95 by >= 10%.

### Planned benchmark script
- `tests/bench_rootfs_streaming_impact.sh`

---

## #4 Delta checkpoints (dirty pages only)

### A/B toggle
- Control: `?checkpointfull=1`
- Candidate: `?checkpointdelta=1`

### Engagement proof
- `checkpoint_dirty_pages`
- `checkpoint_serialized_bytes`

### Impact gate
- Reduce checkpoint export time median by >= 30%.
- Reduce checkpoint size median by >= 40%.
- Restore-time p95 must not regress by > 5%.

### Planned benchmark script
- `tests/bench_checkpoint_delta_impact.sh`

---

## #5 Remove hot-loop JS overhead

### A/B toggle
- Control: `?legacyhotloop=1`
- Candidate: `?eventloophot=1`

### Engagement proof
- `main_thread_poll_wakeups`
- `stdout_copy_bytes`
- `jit_dispatch_alloc_count`

### Impact gate
- Improve `first_output_s` median by >= 8%.
- Improve `completion_s` median by >= 8%.
- Reduce JS wakeups per second median by >= 40%.

### Planned benchmark script
- `tests/bench_hotloop_overhead_impact.sh`

---

## Implementation rule

Do not mark #3/#4/#5 as DONE until their benchmark JSON shows all gates passing.
