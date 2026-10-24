import {defineConfig} from '@playwright/test';
const port=Number(process.env.AEGIS_TEST_PORT??5190);
const baseline=process.env.AEGIS_BASELINE==='1';
export default defineConfig({
  testDir:'tests',testMatch:baseline?'browser.spec.mjs':['browser.spec.mjs','environment.browser.spec.mjs','integration.browser.spec.mjs'],workers:1,timeout:60000,
  outputDir:'artifacts/phase6-integration/test-results',
  use:{channel:'chrome',headless:true,viewport:{width:1440,height:900},baseURL:`http://127.0.0.1:${port}`,screenshot:'only-on-failure'},
  webServer:{command:`npm.cmd run dev -- --host 127.0.0.1 --port ${port} --strictPort`,url:`http://127.0.0.1:${port}`,reuseExistingServer:false,timeout:45000},
  reporter:[['list'],['json',{outputFile:`artifacts/phase6-integration/${baseline?'baseline':'merged'}-browser-results.json`}]],
});
