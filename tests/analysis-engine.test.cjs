const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../analysis-engine.js');
const now = Date.UTC(2026, 8, 28, 12);
function row(offset, energy, extra = {}) {
    const d = new Date(now + offset);
    return { 'DAQ Date': d.toISOString().slice(0, 10), 'DAQ Time (GMT)': d.toISOString().slice(11, 23), 'Energy (pJ)': energy * 1e6, ...extra };
}
test('quiet current data is green regardless of older high-energy history', () => {
    const r = A.analyze([row(-600000, 10000), row(-60000, .001), row(0, .001)], { now });
    assert.equal(r.label, 'LOW'); assert.equal(r.state, 'ready'); assert.equal(r.events, 2);
});
test('few events cannot hide a large energy burst', () => {
    const r = A.analyze([row(0, 501)], { now });
    assert.equal(r.label, 'CRITICAL');
});
test('large crossing counts do not inflate event counts', () => {
    const r = A.analyze([row(-60000, .001, { 'HIT Count': 60000 }), row(0, .001, { 'HIT Count': 60000 })], { now });
    assert.equal(r.events, 2); assert.equal(r.eventRate, 2); assert.equal(r.label, 'LOW');
});
test('decay continues from the last event to analysis time', () => {
    const rows = [row(-60000, 32)];
    assert.equal(A.analyze(rows, { now, decayRate: 5 }).label, 'LOW');
    assert.equal(A.analyze(rows, { now, decayRate: 0 }).label, 'NOTICE');
});
test('threshold equality moves into the upper band', () => {
    for (const [i, threshold] of A.THRESHOLDS.entries()) {
        assert.equal(A.analyze([row(0, threshold)], { now }).level, i + 1);
        assert.equal(A.analyze([row(0, threshold - .001)], { now }).level, i);
    }
});
test('stale, empty, invalid and future data never report ready', () => {
    assert.equal(A.analyze([], { now }).state, 'empty');
    assert.equal(A.analyze([row(-120001, 0)], { now }).state, 'stale');
    for (const energy of ['', -1, 'bad', '2x', Infinity, null]) {
        assert.equal(A.analyze([row(0, 0, { 'Energy (pJ)': energy })], { now }).state, 'invalid');
    }
    assert.equal(A.analyze([row(1, 0)], { now }).state, 'invalid');
    assert.equal(A.analyze([row(0, 0, { 'DAQ Date': '' })], { now }).state, 'invalid');
});
test('historical analysis is explicitly anchored to latest event', () => {
    const r = A.analyze([row(-3600000, 501)], { now, historical: true });
    assert.equal(r.state, 'ready'); assert.equal(r.label, 'CRITICAL'); assert.equal(r.end, now - 3600000);
});
test('sorts timestamps and handles UTC midnight and DAQ milliseconds', () => {
    assert.equal(A.timestamp({ 'DAQ Date': '28-09-2026', 'DAQ Time (GMT)': '00:00:00.0123' }), Date.UTC(2026, 8, 28, 0, 0, 0, 123));
    const midnight = Date.UTC(2026, 8, 28);
    const rows = [ { 'DAQ Date': '28-09-2026', Time: '00:00:00', Energy: 1e6 }, { 'DAQ Date': '27-09-2026', Time: '23:59:00', Energy: 40e6 } ];
    assert.equal(A.analyze(rows, { now: midnight }).energy, 36);
    assert.equal(A.timestamp({ Date: '31-02-2026', Time: '12:00:00' }), null);
    assert.equal(A.timestamp({ Date: '28-09-2026', Time: '24:00:00' }), null);
});
test('GViz dates/time arrays parse and blank headers do not shift columns', () => {
    const rows = A.tableRows({ cols: [{ label: 'DAQ Date' }, { label: '' }, { label: 'DAQ Time (GMT)' }, { label: 'Energy (pJ)' }], rows: [{ c: [{ v: 'Date(2026,8,28)', f: '09/28/2026' }, { v: 'ignore' }, { v: [12, 0, 0, 0] }, { v: 12e6, f: '12.00' }] }] });
    assert.equal(A.timestamp(rows[0]), now); assert.equal(A.analyze(rows, { now }).energy, 12);
});
test('rates use elapsed minutes and a bounded denominator for simultaneous hits', () => {
    const r = A.analyze([row(-300000, 0), row(-120000, 1), row(0, 2)], { now });
    assert.equal(r.events, 2); assert.equal(r.eventRate, .4); assert.equal(r.energyRate, .6);
    assert.ok(Number.isFinite(A.analyze([row(0, 1), row(0, 1)], { now }).eventRate));
});
test('energy trend needs a complete preceding window', () => {
    assert.equal(A.analyze([row(0, 2)], { now }).trend, 'More history needed');
    assert.equal(A.analyze([row(-600000, 0), row(-400000, 10), row(0, 1)], { now }).trend, 'Falling');
});
test('real sheet datetime time cells and IST offset use the confirmed sensor clock', () => {
    const r = { Date: 'Date(2026,8,28)', Time: 'Date(1899,11,30,11,0,53)', Energy: 322 };
    const utcNow = Date.UTC(2026, 8, 28, 5, 30, 53);
    assert.equal(A.timestamp(r, 330), utcNow);
    const result = A.analyze([r], { now: utcNow, utcOffsetMinutes: 330 });
    assert.equal(result.state, 'ready'); assert.equal(result.label, 'LOW');
    assert.equal(result.energy, .000322);
    assert.equal(A.analyze([r], { now: utcNow, utcOffsetMinutes: 0 }).state, 'invalid');
});
