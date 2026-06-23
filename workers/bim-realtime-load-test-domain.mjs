export const DEFAULT_BIM_REALTIME_LOAD_TEST_JOBS = 4;
export const DEFAULT_BIM_REALTIME_LOAD_TEST_EVENTS_PER_JOB = 2500;
export const DEFAULT_BIM_REALTIME_LOAD_TEST_EVENT_INTERVAL_MS = 5;
export const DEFAULT_BIM_REALTIME_LOAD_TEST_FLUSH_MS = 120;
export const DEFAULT_BIM_REALTIME_LOAD_TEST_MIN_RENDER_REDUCTION_PERCENT = 95;

export function runBimRealtimeLoadTest(options = {}) {
  const jobCount = clampInteger(
    options.jobCount,
    1,
    12,
    DEFAULT_BIM_REALTIME_LOAD_TEST_JOBS,
  );
  const eventsPerJob = clampInteger(
    options.eventsPerJob,
    1,
    100000,
    DEFAULT_BIM_REALTIME_LOAD_TEST_EVENTS_PER_JOB,
  );
  const eventIntervalMs = clampInteger(
    options.eventIntervalMs,
    1,
    60000,
    DEFAULT_BIM_REALTIME_LOAD_TEST_EVENT_INTERVAL_MS,
  );
  const flushMs = clampInteger(
    options.flushMs,
    16,
    1000,
    DEFAULT_BIM_REALTIME_LOAD_TEST_FLUSH_MS,
  );
  const minRenderReductionPercent = clampNumber(
    options.minRenderReductionPercent,
    0,
    100,
    DEFAULT_BIM_REALTIME_LOAD_TEST_MIN_RENDER_REDUCTION_PERCENT,
  );
  const events = createBimRealtimeLoadEvents({
    jobCount,
    eventsPerJob,
    eventIntervalMs,
  });
  const summary = summarizeBimRealtimeLoad(events, { flushMs });
  const ok = summary.withinCommitBudget
    && summary.renderReductionPercent >= minRenderReductionPercent
    && summary.terminalCommitCount === jobCount;

  return {
    ok,
    jobCount,
    eventsPerJob,
    eventIntervalMs,
    flushMs,
    minRenderReductionPercent,
    ...summary,
  };
}

export function createBimRealtimeLoadEvents(options = {}) {
  const jobCount = clampInteger(options.jobCount, 1, 12, DEFAULT_BIM_REALTIME_LOAD_TEST_JOBS);
  const eventsPerJob = clampInteger(
    options.eventsPerJob,
    1,
    100000,
    DEFAULT_BIM_REALTIME_LOAD_TEST_EVENTS_PER_JOB,
  );
  const eventIntervalMs = clampInteger(
    options.eventIntervalMs,
    1,
    60000,
    DEFAULT_BIM_REALTIME_LOAD_TEST_EVENT_INTERVAL_MS,
  );
  const terminalOffsetMs = clampInteger(options.terminalOffsetMs, 0, 60000, eventIntervalMs * 5);

  return Array.from({ length: jobCount }, (_, jobIndex) => {
    const jobId = `realtime-load-${jobIndex + 1}`;
    const targetMode = jobIndex % 2 === 0 ? "cloud-model" : "active-revit";
    const commandType = targetMode === "cloud-model" ? "cloud-model-analysis" : "active-revit-preview";
    const runningEvents = Array.from({ length: eventsPerJob }, (_, eventIndex) => ({
      elapsedMs: eventIndex * eventIntervalMs,
      jobId,
      status: "running",
      targetMode,
      commandType,
      percent: Math.min(95, (eventIndex / Math.max(1, eventsPerJob - 1)) * 95),
    }));
    return [
      ...runningEvents,
      {
        elapsedMs: eventsPerJob * eventIntervalMs + terminalOffsetMs + jobIndex,
        jobId,
        status: "completed",
        targetMode,
        commandType,
        percent: 100,
      },
    ];
  }).flat();
}

export function summarizeBimRealtimeLoad(events, options = {}) {
  const flushMs = clampInteger(options.flushMs, 16, 1000, DEFAULT_BIM_REALTIME_LOAD_TEST_FLUSH_MS);
  const orderedEvents = Array.isArray(events)
    ? events
      .filter((event) => Number.isFinite(Number(event?.elapsedMs)) && String(event?.jobId || "").trim())
      .map((event) => ({
        ...event,
        elapsedMs: Number(event.elapsedMs),
        jobId: String(event.jobId).trim(),
        status: String(event.status || "running").trim(),
      }))
      .sort((left, right) => left.elapsedMs - right.elapsedMs)
    : [];
  const eventsByJobId = new Map();

  orderedEvents.forEach((event) => {
    const current = eventsByJobId.get(event.jobId) || [];
    current.push(event);
    eventsByJobId.set(event.jobId, current);
  });

  const commits = Array.from(eventsByJobId.entries()).flatMap(([jobId, jobEvents]) => (
    planBimRealtimeCommits(jobEvents, flushMs).map((commit) => ({ ...commit, jobId }))
  )).sort((left, right) => {
    const timeDelta = left.elapsedMs - right.elapsedMs;
    return timeDelta !== 0 ? timeDelta : left.jobId.localeCompare(right.jobId);
  });
  const commitBudget = Array.from(eventsByJobId.values()).reduce((sum, jobEvents) => {
    const first = jobEvents[0]?.elapsedMs ?? 0;
    const last = jobEvents[jobEvents.length - 1]?.elapsedMs ?? first;
    return sum + Math.ceil((Math.max(0, last - first) + 1) / flushMs) + 2;
  }, 0);
  const firstEventAt = orderedEvents[0]?.elapsedMs ?? 0;
  const lastEventAt = orderedEvents[orderedEvents.length - 1]?.elapsedMs ?? firstEventAt;
  const commitsBySecond = new Map();

  commits.forEach((commit) => {
    const second = Math.floor(Math.max(0, commit.elapsedMs) / 1000);
    commitsBySecond.set(second, (commitsBySecond.get(second) || 0) + 1);
  });

  const eventCount = orderedEvents.length;
  const commitCount = commits.length;
  return {
    eventCount,
    commitCount,
    jobCount: eventsByJobId.size,
    terminalCommitCount: commits.filter((commit) => commit.reason === "terminal").length,
    durationMs: Math.max(0, lastEventAt - firstEventAt),
    commitBudget,
    maxCommitsPerSecond: Math.max(0, ...commitsBySecond.values()),
    eventReductionRatio: commitCount > 0 ? eventCount / commitCount : eventCount,
    renderReductionPercent: eventCount > 0 ? ((eventCount - commitCount) / eventCount) * 100 : 0,
    withinCommitBudget: commitCount <= commitBudget,
  };
}

function planBimRealtimeCommits(events, flushMs) {
  const commits = [];
  let nextFrameAt = Number.NEGATIVE_INFINITY;
  let pending = null;

  events.forEach((event) => {
    pending = event;
    const terminal = isTerminalBimJobStatus(event.status);
    if (commits.length === 0 || event.elapsedMs >= nextFrameAt || terminal) {
      commits.push({
        ...event,
        reason: terminal ? "terminal" : "frame",
      });
      pending = null;
      nextFrameAt = event.elapsedMs + flushMs;
    }
  });

  if (pending) {
    commits.push({
      ...pending,
      reason: "trailing",
    });
  }

  return commits;
}

function isTerminalBimJobStatus(status) {
  return ["completed", "failed", "cancelled"].includes(String(status || "").trim().toLowerCase());
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}
