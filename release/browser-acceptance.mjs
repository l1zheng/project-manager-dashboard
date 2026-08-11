import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const options = parseArguments(process.argv.slice(2));
await mkdir(options.outputDirectory, { recursive: true });

const target = await waitForTarget(options.debugUrl);
const cdp = await connectCdp(target.webSocketDebuggerUrl);

try {
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  });
  await waitFor(
    'document.querySelectorAll("button").length > 0 && document.body.innerText.includes("添加模块")'
  );

  await step('create table from the real module composer', async () => {
    await clickButton('添加模块');
    await clickButton('▤ 表格');
    await setInput('input[placeholder="例如：关键事务跟踪"]', '浏览器验收表格');
    await clickButton('创建表格');
    await waitFor(
      '[...document.querySelectorAll(".v2-table-title input")].some((input) => input.value === "浏览器验收表格")'
    );
  });

  await step('create a record and a property', async () => {
    const tableId = await evaluate(`(() => {
      const title = [...document.querySelectorAll('.v2-table-title input')].find((input) => input.value === '浏览器验收表格');
      const table = title?.closest('.v2-table-block');
      if (!table?.id) throw new Error('Acceptance table ID was not found.');
      return table.id;
    })()`);
    await evaluate(`(() => {
      const input = document.querySelector('.v2-blank-row textarea[aria-label="名称"]');
      if (!input) throw new Error('Blank-row name editor was not found.');
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, '浏览器记录');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    })()`);
    await waitForAsync(
      `fetch('/api/databases/' + ${JSON.stringify(tableId)}).then((response) => response.json()).then((database) => database.records.length === 1)`
    );
    await waitFor(`(() => {
      const title = [...document.querySelectorAll('.v2-table-title input')].find((input) => input.value === '浏览器验收表格');
      const table = title?.closest('.v2-table-block');
      return table?.querySelectorAll('tbody tr:not(.v2-blank-row)').length === 1;
    })()`);
    await evaluate(`(() => {
      const title = [...document.querySelectorAll('.v2-table-title input')].find((input) => input.value === '浏览器验收表格');
      const table = title?.closest('.v2-table-block');
      const button = [...table.querySelectorAll('button')].find((item) => item.textContent.includes('属性'));
      if (!button) throw new Error('Add-property button was not found.');
      button.click();
    })()`);
    await waitFor('document.body.innerText.includes("新属性")');
  });

  await step('save and clear a table filter', async () => {
    await evaluate(`(() => {
      const title = [...document.querySelectorAll('.v2-table-title input')].find((input) => input.value === '浏览器验收表格');
      const table = title?.closest('.v2-table-block');
      const button = [...table.querySelectorAll('button')].find((item) => item.textContent.includes('筛选'));
      if (!button) throw new Error('Filter button was not found.');
      button.click();
    })()`);
    await setInput('input[placeholder="输入筛选内容"]', '浏览器');
    await clickButton('应用筛选');
    await waitFor('document.body.innerText.includes("当前筛选")');
    await evaluate(`(() => {
      const title = [...document.querySelectorAll('.v2-table-title input')].find((input) => input.value === '浏览器验收表格');
      const table = title?.closest('.v2-table-block');
      const button = [...table.querySelectorAll('button')].find((item) => item.textContent.includes('筛选'));
      button.click();
    })()`);
    await clickButton('清除');
    await waitFor('!document.body.innerText.includes("当前筛选")');
  });

  await step('create and edit text and image modules', async () => {
    await clickButton('添加模块');
    await clickButton('¶ 文字');
    await waitForSelector('input[aria-label="文字模块标题"]');
    await setInput('input[aria-label="文字模块标题"]', '浏览器验收摘要', true);
    await setInput(
      'textarea[aria-label="文字模块内容"]',
      '文字模块能够直接创建、编辑并持久化。',
      true
    );

    await clickButton('添加模块');
    await clickButton('▧ 图片');
    await waitForSelector('input[aria-label="图片模块标题"]');
    await setInput('input[aria-label="图片模块标题"]', '浏览器验收图片', true);
    await setInput('input[aria-label="图片说明"]', '未选择文件时模块仍可保存。', true);
    await waitForAsync(`fetch('/api/workspace/primary-dashboard', { method: 'POST' })
      .then((response) => response.json())
      .then((dashboard) => {
        const text = dashboard.blocks.find((block) => block.kind === 'text');
        const image = dashboard.blocks.find((block) => block.kind === 'image');
        return text?.config?.title === '浏览器验收摘要' &&
          text?.config?.body === '文字模块能够直接创建、编辑并持久化。' &&
          image?.config?.title === '浏览器验收图片' &&
          image?.config?.caption === '未选择文件时模块仍可保存。';
      })`);
  });

  await step('reload and verify persistence', async () => {
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(
      `[...document.querySelectorAll('.v2-table-title input')].some((input) => input.value === '浏览器验收表格')`
    );
    await waitFor(
      `document.querySelector('input[aria-label="文字模块标题"]')?.value === '浏览器验收摘要'`
    );
    await waitFor(
      `document.querySelector('textarea[aria-label="文字模块内容"]')?.value === '文字模块能够直接创建、编辑并持久化。'`
    );
    await waitFor(
      `document.querySelector('input[aria-label="图片模块标题"]')?.value === '浏览器验收图片'`
    );
    await waitFor(
      `document.querySelector('input[aria-label="图片说明"]')?.value === '未选择文件时模块仍可保存。'`
    );
    const summary = await evaluate(
      '[...document.querySelectorAll(".v2-page-summary")].map((item) => item.textContent).join(" ")'
    );
    assert.match(summary, /3 个模块 · 1 张表 · 1 条记录/);
  });

  await step('dismiss export menu by clicking blank page space', async () => {
    await clickButton('导出');
    await waitFor('document.body.innerText.includes("导出当前页面")');
    await evaluate(`(() => {
      const target = document.querySelector('.v2-page-header h1');
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    })()`);
    await waitFor('!document.body.innerText.includes("导出当前页面")');
  });

  await captureScreenshot('browser-acceptance-persisted.png');

  await step('delete all acceptance modules through their menus', async () => {
    await deleteContentModule('图片模块更多操作');
    await deleteContentModule('文字模块更多操作');
    await evaluate(`document.querySelector('button[aria-label="浏览器验收表格更多操作"]').click()`);
    await clickButton('删除表格');
    await clickButton('确认删除');
    await waitFor('document.body.innerText.includes("0 个模块 · 0 张表 · 0 条记录")');
    await waitForAsync(
      `fetch('/api/workspace/primary-dashboard', { method: 'POST' }).then((response) => response.json()).then((dashboard) => dashboard.blocks.length === 0)`
    );
  });

  console.log('Real-browser production acceptance passed.');
} catch (error) {
  const pageText = await evaluate('document.body.innerText.slice(0, 4000)').catch(
    () => 'Browser page text was unavailable.'
  );
  console.error(`Browser page at failure:\n${pageText}`);
  await captureScreenshot('browser-acceptance-failure.png').catch(() => undefined);
  throw error;
} finally {
  cdp.close();
}

async function deleteContentModule(label) {
  await evaluate(
    `document.querySelector(${JSON.stringify(`button[aria-label="${label}"]`)}).click()`
  );
  await clickButton('删除模块');
  await clickButton('确认删除');
  await waitFor(
    `document.querySelector(${JSON.stringify(`button[aria-label="${label}"]`)}) === null`
  );
}

async function clickButton(text) {
  await evaluate(`(() => {
    const expected = ${JSON.stringify(text)};
    const button = [...document.querySelectorAll('button')].find((candidate) =>
      candidate.textContent.replace(/\\s+/g, ' ').trim().includes(expected)
    );
    if (!button) throw new Error('Button was not found: ' + expected);
    button.click();
  })()`);
}

async function setInput(selector, value, blur = false) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Input was not found: ' + ${JSON.stringify(selector)});
    element.focus();
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    if (${JSON.stringify(blur)}) element.blur();
  })()`);
}

async function waitFor(expression, timeoutMilliseconds = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for browser condition: ${expression}`);
}

async function waitForSelector(selector, timeoutMilliseconds = 20_000) {
  await waitFor(
    `document.querySelector(${JSON.stringify(selector)}) !== null`,
    timeoutMilliseconds
  );
}

async function waitForAsync(expression, timeoutMilliseconds = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    if (await evaluate(`Promise.resolve(${expression}).then(Boolean)`)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for asynchronous browser condition: ${expression}`);
}

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'Browser evaluation failed.');
  }
  return result.result.value;
}

async function captureScreenshot(filename) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  });
  await writeFile(resolve(options.outputDirectory, filename), Buffer.from(result.data, 'base64'));
}

async function step(name, action) {
  process.stdout.write(`Browser: ${name}... `);
  await action();
  console.log('passed');
}

async function waitForTarget(debugUrl) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(new URL('/json/list', debugUrl));
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page');
        if (page?.webSocketDebuggerUrl) return page;
      }
    } catch {
      // Edge may still be starting.
    }
    await delay(100);
  }
  throw new Error(`Could not connect to the headless browser at ${debugUrl}.`);
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', () => rejectOpen(new Error('Browser WebSocket failed.')), {
      once: true
    });
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolveMessage, rejectMessage) => {
        pending.set(id, { resolve: resolveMessage, reject: rejectMessage });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    }
  };
}

function parseArguments(argumentsList) {
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    values.set(argumentsList[index], argumentsList[index + 1]);
  }
  return {
    debugUrl: values.get('--debug-url') ?? 'http://127.0.0.1:9222',
    outputDirectory: resolve(values.get('--output-dir') ?? 'artifacts/browser-acceptance')
  };
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
