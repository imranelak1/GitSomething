// Read-only live-account verification in the user's already approved release app.
// Reports counts/booleans only. No screenshots, names, URLs, credentials, consent,
// provider writes, or Git mutations. Restore the list controls before leaving.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = targets.find(
  (item) => item.type === 'page' && /^http:\/\/tauri\.localhost\//.test(item.url),
);
assert.ok(target, 'The packaged application must be running on loopback CDP9223.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error('Native diagnostic request failed.'));
  else request.resolve(message.result);
});
async function evaluate(expression) {
  const result = await new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Native diagnostic timed out.'));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }),
    );
  });
  assert.ok(!result.exceptionDetails, 'The counts-only diagnostic must not throw.');
  return result.result.value;
}
const delay = () => new Promise((resolve) => setTimeout(resolve, 100));
let proof;
try {
  proof = await evaluate(`(async () => {
    const status = await window.__TAURI_INTERNALS__.invoke('github_auth_status');
    return { configured: status.configured, connected: status.connected };
  })()`);
  assert.equal(proof.configured, true);
  assert.equal(proof.connected, true);
  await evaluate(`document.querySelector('.brand').click()`);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (
      await evaluate(
        `Boolean(document.querySelector('.github-repositories-row')) && !document.querySelector('.github-repositories-list[aria-busy="true"]')`,
      )
    )
      break;
    await delay();
  }
  const count = () => evaluate(`document.querySelectorAll('.github-repositories-row').length`);
  const clickFilter = async (name) => {
    assert.equal(
      await evaluate(`Boolean(document.querySelector('[aria-label="${name} repositories"]'))`),
      true,
    );
    await evaluate(`document.querySelector('[aria-label="${name} repositories"]').click()`);
    await delay();
  };
  await clickFilter('All');
  proof.rows = await count();
  assert.ok(proof.rows > 0);
  proof.firstPageCoversLoadedAccount = await evaluate(
    `!Array.from(document.querySelectorAll('.github-repositories button')).some(button => button.textContent.includes('Load more repositories'))`,
  );
  proof.filterCounts = await evaluate(
    `Object.fromEntries(['All','Public','Private'].map(name => [name.toLowerCase(), Number(document.querySelector('[aria-label="'+name+' repositories"] span').textContent)]))`,
  );
  assert.equal(proof.filterCounts.all, proof.rows);
  await clickFilter('Private');
  proof.privateRows = await count();
  assert.equal(proof.privateRows, proof.filterCounts.private);
  await clickFilter('Public');
  proof.publicRows = await count();
  assert.equal(proof.publicRows, proof.filterCounts.public);
  assert.equal(proof.publicRows + proof.privateRows, proof.rows);
  await clickFilter('All');
  await evaluate(
    `(() => { const control = document.querySelector('[aria-label="Sort GitHub repositories"]'); control.value='name'; control.dispatchEvent(new Event('change', {bubbles:true})); })()`,
  );
  await delay();
  proof.nameSortVerified = await evaluate(`(() => {
    const collator = new Intl.Collator('en', { sensitivity:'base', numeric:true });
    const names = [...document.querySelectorAll('.github-repositories-name')].map(row => row.textContent.trim().split('/').pop());
    return names.every((name,index) => !index || collator.compare(names[index-1],name) <= 0);
  })()`);
  assert.equal(proof.nameSortVerified, true);
  await evaluate(`(() => {
    const input = document.querySelector('[aria-label="Filter loaded GitHub repositories"]');
    const value = document.querySelector('.github-repositories-name').textContent.trim();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await delay();
  proof.exactSearchRows = await count();
  assert.equal(proof.exactSearchRows, 1);
  await evaluate(`document.querySelector('[aria-label="Clear repository search"]').click()`);
  await delay();
  proof.searchCleared = (await count()) === proof.rows;
  proof.searchFocusRestored = await evaluate(
    `document.activeElement === document.querySelector('[aria-label="Filter loaded GitHub repositories"]')`,
  );
  assert.equal(proof.searchCleared, true);
  assert.equal(proof.searchFocusRestored, true);
  proof.repositoryError = await evaluate(
    `Boolean(document.querySelector('.github-repositories-error'))`,
  );
  assert.equal(proof.repositoryError, false);
  proof.reauthorizationRequired = false;
  proof.checkedAt = new Date().toISOString();
} finally {
  // These operations affect only local controls. They never contact a provider.
  await evaluate(`(() => {
    document.querySelector('[aria-label="All repositories"]')?.click();
    document.querySelector('[aria-label="Clear repository search"]')?.click();
    const control=document.querySelector('[aria-label="Sort GitHub repositories"]');
    if(control){control.value='updated';control.dispatchEvent(new Event('change',{bubbles:true}));}
  })()`).catch(() => {});
  socket.close();
}
const destination = new URL('../artifacts/release/live-github.json', import.meta.url);
const previous = JSON.parse(await readFile(destination, 'utf8').catch(() => '{}'));
await writeFile(
  destination,
  `${JSON.stringify({ ...previous, rebuiltCandidate: proof }, null, 2)}\n`,
);
console.log(JSON.stringify(proof));
