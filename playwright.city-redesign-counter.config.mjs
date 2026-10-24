import config from './playwright.city-redesign.config.mjs';
export default {...config,testMatch:['browser.spec.mjs'],grep:/combat: a buffered/,repeatEach:2,outputDir:'artifacts/city-redesign/counter-test-results',reporter:[['list'],['json',{outputFile:'artifacts/city-redesign/browser-counter-focused.json'}]]};
