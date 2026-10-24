import {defineConfig} from '@playwright/test';
const label=process.env.PHASE8_TEST_LABEL??'final';
process.env.AEGIS_GAMEPLAY_ARTIFACTS=`artifacts/phase8/live-2026-10-18/gameplay-tests-${label}`;
export default defineConfig({
 testDir:'tests',testMatch:['browser.spec.mjs','environment.browser.spec.mjs','integration.browser.spec.mjs','architecture.browser.spec.mjs','city-redesign.browser.spec.mjs','visibility-destruction.browser.spec.mjs','world-realism.browser.spec.mjs','phase8.browser.spec.mjs'],
 workers:1,timeout:180000,expect:{timeout:15000},
 outputDir:`artifacts/phase8/live-2026-10-18/test-results-${label}`,
 use:{channel:'chrome',headless:true,viewport:{width:1440,height:900},baseURL:'http://127.0.0.1:5192',screenshot:'only-on-failure'},
 reporter:[['list'],['json',{outputFile:`artifacts/phase8/live-2026-10-18/browser-${label}.json`}]],
});
