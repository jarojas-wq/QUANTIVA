import { runBimRealtimeLoadTest } from "./bim-realtime-load-test-domain.mjs";

const result = runBimRealtimeLoadTest({
  jobCount: process.env.BIM_REALTIME_LOAD_TEST_JOBS || 4,
  eventsPerJob: process.env.BIM_REALTIME_LOAD_TEST_EVENTS_PER_JOB || 2500,
  eventIntervalMs: process.env.BIM_REALTIME_LOAD_TEST_EVENT_INTERVAL_MS || 5,
  flushMs: process.env.BIM_REALTIME_LOAD_TEST_FLUSH_MS || 120,
  minRenderReductionPercent: process.env.BIM_REALTIME_LOAD_TEST_MIN_RENDER_REDUCTION_PERCENT || 95,
});

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exitCode = 1;
}
