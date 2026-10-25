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
// Minutes the server still lacks (an outage longer than the queue, the database
// unavailable, a reboot) are filled from the Shelly's own minute log (EM1Data,
// at least 10 days: docs/shelly.md, "Registo interno"), without per-second
// values. The script asks the server for the oldest gap after the minutes it has
// already checked (GET /v1/ingest/missing), reads the log and sends it
// FILL_WINDOW minutes at a time, only while its own queue is empty.
//
// Configuration (KVS, set once; restart the script after changing it):
//   wattometro.url      https://app.wattometro.workers.dev/v1/ingest
//   wattometro.token    the device token from Definições → Dispositivos
//   wattometro.channel  0 (default) or 1
// The EM Gen3 (firmware 2.1.0) empties its KVS on every reboot (docs/shelly.md,
// "KVS"), so pnpm shelly:install also writes the URL and token into the copy
// of this script it uploads (INSTALLED, empty here): used when KVS lacks them.
//
// Conservative JavaScript on purpose: the Shelly interpreter is a subset.
// Runs on a Shelly EM Gen3 since 2026-10-24 (docs/shelly.md).

let SCRIPT_VERSION = '0.4.0';
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
// On 2026-10-25 the EM Gen3 (firmware 2.1.0) lost the hour the clocks went back:
// its unixtime seemed an hour ahead and the server dropped the minutes as from
// the future (docs/shelly.md, "Hora"). Each answer carries the server's time; a
// clock further off than CLOCK_TOLERANCE follows it until the device's own
// clock jumps (it corrected itself), when it is trusted again.
let CLOCK_TOLERANCE = 60;
let CLOCK_JUMP = 30;
let LOG_DAYS = 10;
let FILL_EVERY = 3600; // seconds between asks for gaps, besides after a boot or an outage
let FILL_WINDOW = 10; // log minutes per request
let FILL_MEMORY = 15000; // free bytes needed to read the log and send it
let FILL_KEYS = [
  'total_act_energy',
  'max_act_power',
  'min_act_power',
  'max_aprt_power',
  'max_voltage',
  'min_voltage',
  'avg_voltage',
  'avg_current'
];

let cfg = { url: null, token: null, channel: 0 };
let INSTALLED = { url: '', token: '' };
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
let clockOffset = 0; // seconds added to the device's unixtime
let lastRaw = null; // the device's unixtime at the last tick
let sentRaw = 0; // and when the request in flight was sent
let bootAt = null; // epoch s of the last boot (unixtime − uptime), for outages
// Gaps: minutes before `cursor` are checked; `gap` is the one being filled, and
// carry/prev the Wh decimals carried between its minutes.
let fill = { cursor: null, nextAsk: 0, gap: null, carry: 0, prev: null };

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
  else followServerClock(result.body);
  let kept = [];
  for (let i = 0; i < queue.length; i++) if (queue[i].sent !== seq) kept.push(queue[i]);
  queue = kept;
  // The first answer since the boot, or after an outage: look for gaps soon.
  if (fill.cursor === null) {
    fill.cursor = lastNow - (lastNow % 60) - LOG_DAYS * 86400;
    fill.nextAsk = lastNow;
  } else if (failures > 0) {
    fill.nextAsk = lastNow;
  }
  failures = 0;
  nextSend = lastNow + SEND_GAP;
}

function followServerClock(body) {
  let answer = null;
  try {
    answer = JSON.parse(body);
  } catch (e) {
    return;
  }
  if (!answer) return;
  if (answer.rejected > 0) print('wattometro: server rejected', answer.rejected, 'minutes');
  if (typeof answer.now !== 'number') return;
  let off = answer.now - sentRaw;
  let next = Math.abs(off) > CLOCK_TOLERANCE ? off : 0;
  if (next !== clockOffset) print('wattometro: clock offset', next, 's');
  clockOffset = next;
}

// The oldest minute the script still holds itself: the log fills only before it.
function ownedFrom() {
  let to = cur === null ? lastNow - (lastNow % 60) : cur.t;
  if (done !== null && done.a.t < to) to = done.a.t;
  if (queue.length > 0 && queue[0].t < to) to = queue[0].t;
  return to;
}

function askGap(now) {
  let to = ownedFrom();
  let from = Math.max(fill.cursor, now - (now % 60) - LOG_DAYS * 86400);
  fill.nextAsk = now + FILL_EVERY;
  if (to - from < 60) return;
  sending = true;
  Shelly.call(
    'HTTP.Request',
    {
      method: 'GET',
      url: cfg.url + '/missing?c=' + cfg.channel + '&from=' + from + '&to=' + to + '&limit=1',
      headers: { Authorization: 'Bearer ' + cfg.token },
      timeout: 10
    },
    function (result, errorCode) {
      sending = false;
      nextSend = lastNow + SEND_GAP;
      // Not answered: asked again at nextAsk.
      if (errorCode !== 0 || !result || result.code !== 200) return;
      let answer = null;
      try {
        answer = JSON.parse(result.body);
      } catch (e) {
        return;
      }
      if (!answer || !answer.missing) return;
      if (answer.missing.length === 0) {
        fill.cursor = to;
        return;
      }
      fill.gap = { from: answer.missing[0][0], to: answer.missing[0][1] };
      fill.carry = 0;
      fill.prev = null;
      print('wattometro: filling', (fill.gap.to - fill.gap.from) / 60, 'minutes from the log');
    }
  );
}

function endGap() {
  fill.cursor = fill.gap.to;
  fill.gap = null;
  // The next gap, if any.
  fill.nextAsk = lastNow;
}

// One log record as an ingest minute (scripts/shelly/backfill.ts does the same).
// `state` carries the Wh decimals; it is committed only when the request succeeds.
function logMinute(t, row, k, state) {
  let v = [];
  for (let i = 0; i < FILL_KEYS.length; i++) {
    let value = row[k[FILL_KEYS[i]]];
    if (typeof value !== 'number') return null;
    v.push(value);
  }
  if (state.prev === null || t !== state.prev + 60) state.carry = 0;
  state.prev = t;
  let before = Math.floor(state.carry);
  state.carry += Math.max(0, v[0]);
  let mean = clamp(Math.round(v[0] * 60));
  let vn = Math.max(0, Math.min(INT16, Math.round(v[5] * 10)));
  let vx = Math.max(vn, Math.min(INT16, Math.round(v[4] * 10)));
  let apparent = v[6] * v[7];
  return JSON.stringify({
    t: t,
    c: cfg.channel,
    n: 60,
    e: Math.min(1000, Math.floor(state.carry) - before),
    pa: mean,
    pn: Math.min(clamp(Math.round(v[2])), mean),
    px: Math.max(clamp(Math.round(v[1])), mean),
    va: Math.max(vn, Math.min(vx, Math.round(v[6] * 10))),
    vn: vn,
    vx: vx,
    pf: apparent > 0 ? Math.max(-100, Math.min(100, Math.round((6000 * v[0]) / apparent))) : 100,
    sx: Math.max(0, Math.min(INT16, Math.round(v[3])))
  });
}

function onLog(result, errorCode, start, end) {
  if (errorCode !== 0 || !result || !result.keys || !result.data) {
    print('wattometro: log not read:', errorCode);
    sending = false;
    endGap();
    return;
  }
  let k = {};
  for (let i = 0; i < result.keys.length; i++) k[result.keys[i]] = i;
  for (let i = 0; i < FILL_KEYS.length; i++) {
    if (k[FILL_KEYS[i]] === undefined) {
      print('wattometro: the log lacks', FILL_KEYS[i]);
      sending = false;
      endGap();
      return;
    }
  }
  // At most FILL_WINDOW records; `next` is where the following read starts: the
  // first record left out, else where the device says its answer stopped, else the gap's end.
  let next = null;
  let taken = 0;
  let state = { carry: fill.carry, prev: fill.prev };
  let parts = [];
  for (let b = 0; b < result.data.length; b++) {
    let block = result.data[b];
    if (block.period !== 60) continue;
    for (let i = 0; i < block.values.length; i++) {
      let t = block.ts + 60 * i;
      if (t < start || t >= end || next !== null) continue;
      if (taken === FILL_WINDOW) {
        next = t;
        continue;
      }
      taken++;
      let json = logMinute(t, block.values[i], k, state);
      if (json !== null) parts.push(json);
    }
  }
  let more = result.next_record_ts;
  if (next === null) next = typeof more === 'number' && more > start && more < end ? more : end;
  result = null;
  if (parts.length === 0) {
    sending = false;
    fill.gap.from = next;
    if (next >= fill.gap.to) endGap();
    return;
  }
  Shelly.call(
    'HTTP.Request',
    {
      method: 'POST',
      url: cfg.url,
      body: '{"v":' + FORMAT + ',"sv":' + JSON.stringify(SCRIPT_VERSION) + ',"min":[' + parts.join(',') + ']}',
      headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
      timeout: 10
    },
    function (answer, code) {
      sending = false;
      if (code !== 0 || !answer || answer.code === 401 || answer.code === 429 || answer.code >= 500) {
        // Read again from the same minute later.
        backoff(answer && answer.code === 429 ? 60 : 0);
        return;
      }
      failures = 0;
      nextSend = lastNow + SEND_GAP;
      fill.carry = state.carry;
      fill.prev = state.prev;
      fill.gap.from = next;
      if (next >= fill.gap.to) endGap();
    }
  );
}

function fillStep() {
  let free = memoryFree();
  if (free !== null && free < FILL_MEMORY) return;
  let start = fill.gap.from;
  let end = fill.gap.to;
  sending = true;
  Shelly.call('EM1Data.GetData', { id: cfg.channel, ts: start, end_ts: end - 60 }, function (result, errorCode) {
    onLog(result, errorCode, start, end);
  });
}

// With nothing of its own to send, and the clock right (the log keeps the device's own time).
function maybeFill(now) {
  if (fill.cursor === null || clockOffset !== 0) return;
  if (fill.gap !== null) fillStep();
  else if (now >= fill.nextAsk) askGap(now);
}

function maybeSend(now) {
  if (sending || now < nextSend || !cfg.url || !cfg.token) return;
  if (queue.length === 0) return maybeFill(now);
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
  sentRaw = lastRaw;
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
  let raw = Math.floor(sys.unixtime);
  // The device's clock jumped (it set itself again): trust it until the server says otherwise.
  if (lastRaw !== null && Math.abs(raw - lastRaw - 1) > CLOCK_JUMP) clockOffset = 0;
  lastRaw = raw;
  let now = raw + clockOffset;
  // Time that went back would hold the next request until it caught up again.
  if (now + CLOCK_JUMP < lastNow) nextSend = now;
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
  if (!cfg.url && INSTALLED.url) cfg.url = INSTALLED.url;
  if (!cfg.token && INSTALLED.token) cfg.token = INSTALLED.token;
  cfg.channel = Number(cfg.channel) === 1 ? 1 : 0;
  if (!cfg.url || !cfg.token) print('wattometro: set wattometro.url and wattometro.token in KVS');
  print('wattometro', SCRIPT_VERSION, 'channel', cfg.channel, info.model, info.ver);
  Timer.set(1000, true, tick);
});
