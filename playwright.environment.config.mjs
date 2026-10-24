import base from './playwright.integration.config.mjs';
export default {...base,testMatch:'environment.browser.spec.mjs',reporter:[['list'],['json',{outputFile:'artifacts/phase6-integration/environment-browser-results.json'}]]};
