/* eslint-disable no-new */
const puppeteer = require('puppeteer-extra');
const {performance} = require('perf_hooks');
const scenes = require('../../scenes/scenes.json');

function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

class LoadTester {
  async addStat(type, stat) {
    if (!this.stats) {
      this.stats = {
        errors: [],
        network: [],
        performance: [],
      };
    }
    if (type === 'ERROR') {
      this.stats.errors.push(stat);
    } else if (type === 'NETWORK') {
      this.stats.network.push(stat);
    } else if (type === 'PERFORMANCE') {
      this.stats.performance.push(stat);
    } else {
      this.stats[type] = stat;
    }
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: false, // change to false for debug
      slowMo: this.config.slowMo,
      defaultViewport: null,
      args: ['--start-maximized'],
    });
    var self = this;

    this.page = await this.browser.newPage();
    await this.page.setDefaultNavigationTimeout(0);

    this.errorIndex = 0;
    this.page
      .on('console', message => {
        if (message.type().substr(0, 3).toUpperCase() === 'ERR') {
          this.addStat('ERROR', 'Page-Error: ' + message.text());
        }
      })
      .on('requestfailed', request => {
        this.addStat('NETWORK', `Request-Error: ${request.failure().errorText} ${request.url()}`);
      });
  }

  async testScene(sceneUrl) {
    const t0 = performance.now();

    await this.page.goto(sceneUrl, {
      waitUntil: 'networkidle0',
    });

    const t1 = performance.now();

    this.addStat('PERFORMANCE', `Street Scene Loaded in ${Number(t1 - t0).toFixed(0) / 1000}s`);

    await sleep(20);
  }

  async test() {
    for (const scene of scenes) {
      const sceneUrl = `${this.config.host}?src=${this.config.host}/scenes/${scene}`;
      await this.testScene(sceneUrl);
      console.log(scene, this.stats);
      this.stats = {
        errors: [],
        network: [],
        performance: [],
      };
    }

    this.finish();
  }

  async run() {
    await this.init();
    await this.test();
  }

  constructor(config) {
    this.config = config;
    this.run();
  }

  async finish() {
    console.log(this.stats);
    this.browser.close();
    this.browser = null;
  }
}

new LoadTester(
  {
    slowMo: 0,
    host: 'http://localhost:3000',
  },
);