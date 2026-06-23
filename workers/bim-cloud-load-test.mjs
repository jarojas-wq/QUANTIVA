import { runBimCloudLoadTest } from "./bim-cloud-load-test-domain.mjs";

const result = runBimCloudLoadTest({
  sizes: process.env.BIM_WORKER_LOAD_TEST_SIZES || "10000,50000,100000",
  batchSize: process.env.BIM_WORKER_LOAD_TEST_BATCH_SIZE || 250,
});

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exitCode = 1;
}
