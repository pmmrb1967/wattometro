// SPDX-License-Identifier: AGPL-3.0-or-later
// Wattómetro — script for a Shelly energy meter (Gen2/Gen3, e.g. Shelly EM Gen3).
// Installation: shelly/README.md. API it relies on: docs/shelly.md.
//
// It only collects and sends (CLAUDE.md): every second it reads one channel,
// every minute it closes the minute and queues it, and it sends the queue to
// POST /v1/ingest (payload format 1, server/src/ingest.ts). If the internet is
// down, minutes wait in RAM; when memory runs low the per-second values of the
// oldest minutes go first, then the oldest minutes.
//
// Configuration (KVS, set once; restart the script after changing it):
//   wattometro.url      https://app.wattometro.workers.dev/v1/ingest
//   wattometro.token    the device token from Definições → Dispositivos
//   wattometro.channel  0 (default) or 1
//
// Conservative JavaScript on purpose: the Shelly interpreter is a subset.
// Runs on a Shelly EM Gen3 since 2026-10-24 (docs/shelly.md).

let SCRIPT_VERSION = '0.3.0';
let FORMAT = 1;
// A script has ~25 KB of memory in all (docs/shelly.md, measured on an EM Gen3).
// Sending a request needs about SEND_OVERHEAD + SEND_FACTOR × body bytes at its
// peak, so each request is sized to the memory free at the time.
let MAX_BODY = 2200; // about two minutes with their per-second values
let SEND_OVERHEAD = 6000;
let SEND_FACTOR = 4;
let MAX_MINUTES_PER_REQUEST = 20;
let QUEUE_MAX = 240; // minutes kept while offline, if memory allows
// Free memory (bytes) below which the queue is trimmed: room to send one aggregate.
let LOW_MEMORY = 8000;
let SEND_GAP = 5; // seconds between requests while catching up
let MAX_BACKOFF = 300;
let INT16 = 32767;
// The energy total moves once a minute, ~1.2 s after it (docs/shelly.md): a
// minute's energy is read this many seconds into the next one.
let COUNTER_SETTLE = 5;

let cfg = { url: null, token: null, channel: 0 };
let info = Shelly.getDeviceInfo();

let cur = null; // the minute being collected
let done = null; // the minute just closed, waiting for its energy
let base = null; // energy total (whole Wh) up to the start of `done`
let queue = []; // [{t, a: aggregate JSON, s: per-second JSON fragment or null, sent}]
let sending = false;
let sendSeq = 0;
let nextSend = 0;
let failures = 0;
let lastNow = 0;
let bootAt = null; // epoch s of the last boot (unixtime − uptime), for outages

function clamp(value) {
  if (value > INT16) return INT16;
  if (value < -INT16) return -INT16;
  return value;
}

function emptySeries() {
  let series = [];
  for (let i = 0; i < 60; i++) series.push(null);
  return series;
}

function energyFloor() {
  let data = Shelly.getComponentStatus('em1data', cfg.channel);
  if (!data || typeof data.total_act_energy !== 'number') return null;
  return Math.floor(data.total_act_energy);
}

function openMinute(start) {
  cur = { t: start, p: emptySeries(), q: emptySeries(), u: emptySeries() };
}

function sample(second) {
  let m = Shelly.getComponentStatus('em1', cfg.channel);
  if (!m || typeof m.act_power !== 'number' || typeof m.voltage !== 'number') return;
  let p = m.act_power;
  cur.p[second] = clamp(Math.round(p));
  cur.u[second] = clamp(Math.round(m.voltage * 10));
  if (typeof m.aprt_power === 'number') {
    let s = m.aprt_power;
    cur.q[second] = clamp(Math.round(Math.sqrt(Math.max(s * s - p * p, 0))));
  }
}

// Closes `cur` into `done` (null when it has no samples).
function closeMinute() {
  let n = 0,
    sumP = 0,
    sumS = 0,
    sumU = 0;
  let pn = INT16,
    px = -INT16,
    vn = INT16,
    vx = 0;
  for (let i = 0; i < 60; i++) {
    let p = cur.p[i];
    if (p === null) continue;
    let u = cur.u[i];
    let q = cur.q[i] === null ? 0 : cur.q[i];
    n++;
    sumP += p;
    sumS += Math.sqrt(p * p + q * q);
    sumU += u;
    if (p < pn) pn = p;
    if (p > px) px = p;
    if (u < vn) vn = u;
    if (u > vx) vx = u;
  }
  done = null;
  if (n > 0) {
    let aggregate = {
      t: cur.t,
      c: cfg.channel,
      n: n,
      e: 0,
      pa: Math.round(sumP / n),
      pn: pn,
      px: px,
      va: Math.round(sumU / n),
      vn: vn,
      vx: vx,
      pf: sumS > 0 ? Math.round((100 * sumP) / sumS) : 100
    };
    let seconds =
      ',"p":' +
      JSON.stringify(cur.p) +
      ',"q":' +
      JSON.stringify(cur.q) +
      ',"u":' +
      JSON.stringify(cur.u);
    done = { a: aggregate, s: seconds };
  }
}

// Gives `done` the energy the total gained since `base`, and queues it.
function settleMinute() {
  let counter = energyFloor();
  if (done !== null) {
    if (counter !== null && base !== null) {
      // A total that went down was reset: count what it holds now.
      done.a.e = counter >= base ? counter - base : counter;
    }
    queue.push({ t: done.a.t, a: JSON.stringify(done.a), s: done.s, sent: 0 });
    done = null;
    trimQueue();
  }
  base = counter;
}

function memoryFree() {
  if (typeof Shelly.getCurrentScriptId !== 'function') return null;
  let status = Shelly.getComponentStatus('script', Shelly.getCurrentScriptId());
  return status && typeof status.mem_free === 'number' ? status.mem_free : null;
}

// Drops the per-second values of the oldest minute that has them, or the oldest
// minute; false when nothing is left to drop.
function dropOldest() {
  for (let i = 0; i < queue.length - 1; i++) {
    if (queue[i].s !== null) {
      queue[i].s = null;
      return true;
    }
  }
  if (queue.length > 1) {
    queue.splice(0, 1);
    return true;
  }
  return false;
}

// Oldest per-second values go first, then the oldest minutes.
function trimQueue() {
  while (queue.length > QUEUE_MAX) queue.splice(0, 1);
  let free = memoryFree();
  while (free !== null && free < LOW_MEMORY && dropOldest()) free = memoryFree();
}

function entryJson(entry) {
  return entry.s === null ? entry.a : entry.a.slice(0, entry.a.length - 1) + entry.s + '}';
}

function backoff(seconds) {
  failures++;
  let wait = seconds > 0 ? seconds : Math.min(MAX_BACKOFF, 10 * Math.pow(2, failures - 1));
  nextSend = lastNow + wait;
}

function onSent(result, errorCode, errorMessage) {
  sending = false;
  let seq = sendSeq;
  if (errorCode !== 0 || !result) {
    print('wattometro: send failed:', errorCode, errorMessage);
    backoff(0);
    return;
  }
  let code = result.code;
  if (code === 401 || code === 429 || code >= 500) {
    print('wattometro: server answered', code);
    backoff(code === 429 ? 60 : 0);
    return;
  }
  // 2xx stored them (or they were duplicates); another 4xx would fail again.
  if (code >= 300) print('wattometro: dropped minutes, server answered', code);
  let kept = [];
  for (let i = 0; i < queue.length; i++) if (queue[i].sent !== seq) kept.push(queue[i]);
  queue = kept;
  failures = 0;
  nextSend = lastNow + SEND_GAP;
}

function maybeSend(now) {
  if (sending || queue.length === 0 || now < nextSend || !cfg.url || !cfg.token) return;
  let free = memoryFree();
  let budget = MAX_BODY;
  if (free !== null) budget = Math.min(MAX_BODY, Math.floor((free - SEND_OVERHEAD) / SEND_FACTOR));
  let head =
    '{"v":' +
    FORMAT +
    ',"sv":' +
    JSON.stringify(SCRIPT_VERSION) +
    ',"m":' +
    JSON.stringify(info.model) +
    ',"fw":' +
    JSON.stringify(info.ver) +
    (bootAt === null ? '' : ',"b":' + bootAt) +
    ',"min":[';
  let size = head.length + 2;
  let parts = [];
  for (let i = 0; i < queue.length && parts.length < MAX_MINUTES_PER_REQUEST; i++) {
    let json = entryJson(queue[i]);
    if (size + json.length + 1 > budget) break;
    parts.push(json);
    size += json.length + 1;
  }
  if (parts.length === 0) {
    // Not even the oldest minute fits the memory free right now: give up its
    // per-second values if it has them, and try again next second. Whole
    // minutes are only dropped by trimQueue, when memory stays low.
    if (queue[0].s !== null) queue[0].s = null;
    return;
  }
  sendSeq++;
  for (let i = 0; i < parts.length; i++) queue[i].sent = sendSeq;
  sending = true;
  Shelly.call(
    'HTTP.Request',
    {
      method: 'POST',
      url: cfg.url,
      body: head + parts.join(',') + ']}',
      headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
      timeout: 10
    },
    onSent
  );
}

function tick() {
  let sys = Shelly.getComponentStatus('sys');
  if (!sys || typeof sys.unixtime !== 'number') return; // no time before NTP sync
  let now = Math.floor(sys.unixtime);
  lastNow = now;
  // Once, after the clock is set: the same value in every request until the next boot.
  if (bootAt === null && typeof sys.uptime === 'number') bootAt = Math.round(sys.unixtime - sys.uptime);
  let start = now - (now % 60);
  if (cur === null) {
    openMinute(start);
  } else if (start !== cur.t) {
    // A minute not settled yet (ticks were missed): settle it late.
    if (done !== null) settleMinute();
    // A clock that jumps back starts a new minute without queuing the old one.
    if (start > cur.t) closeMinute();
    openMinute(start);
  }
  sample(now - start);
  // Once the total has moved: the closed minute's energy, or the first base.
  if (now - start >= COUNTER_SETTLE && (done !== null || base === null)) settleMinute();
  maybeSend(now);
}

function loadConfig(keys, done) {
  if (keys.length === 0) return done();
  let key = keys[0];
  Shelly.call('KVS.Get', { key: 'wattometro.' + key }, function (result, errorCode) {
    if (errorCode === 0 && result && result.value !== undefined) cfg[key] = result.value;
    loadConfig(keys.slice(1), done);
  });
}

loadConfig(['url', 'token', 'channel'], function () {
  cfg.channel = Number(cfg.channel) === 1 ? 1 : 0;
  if (!cfg.url || !cfg.token) print('wattometro: set wattometro.url and wattometro.token in KVS');
  print('wattometro', SCRIPT_VERSION, 'channel', cfg.channel, info.model, info.ver);
  Timer.set(1000, true, tick);
});
