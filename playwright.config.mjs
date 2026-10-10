import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests',testMatch:'browser.spec.mjs',workers:1,timeout:60000,
  use:{channel:'chrome',headless:true,viewport:{width:1440,height:900},baseURL:'http://127.0.0.1:5173',screenshot:'only-on-failure'},
  webServer:{command:'npm.cmd run dev -- --host 127.0.0.1',url:'http://127.0.0.1:5173',reuseExistingServer:true,timeout:30000},
  reporter:[['list'],['json',{outputFile:'artifacts/browser-results.json'}]],
});
