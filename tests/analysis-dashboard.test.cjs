const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const A = require('../analysis-engine.js');
const source = fs.readFileSync(require.resolve('../analysis-dashboard.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../analysis.html'), 'utf8');

function dashboard({ chartAvailable = false } = {}) {
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    const elements = Object.fromEntries(ids.map(id => [id, { textContent: '', style: {}, value: id === 'analysisMode' ? 'live' : '', classList: { toggle() {} }, setAttribute() {}, addEventListener() {} }]));
    const notifications = [], charts = [];
    function Notification(title) { notifications.push(title); }
    Notification.permission = 'granted';
    const ctx = vm.createContext({ AcousticAnalysis: A, Date, console: { error() {}, warn() {} }, AbortController, setTimeout, clearTimeout,
        document: { getElementById: id => { assert.ok(elements[id], `Missing element ${id}`); return elements[id]; }, querySelectorAll: () => [], addEventListener() {} },
        localStorage: { getItem: () => null }, window: { Notification }, Notification,
        fetch: async () => { throw new Error('offline'); } });
    if (chartAvailable) {
        ctx.Chart = function(element, config) { this.data = config.data; this.options = config.options; this.update = () => {}; charts.push(this); };
        ctx.Chart.defaults = {};
    }
    vm.runInContext(source, ctx);
    const evaluate = code => vm.runInContext(code, ctx);
    const setRows = rows => { ctx.fixtureRows = rows; evaluate('allData = fixtureRows; loaded = true;'); };
    return { elements, notifications, charts, ctx, evaluate, setRows };
}
function row(energy, age = 0) {
    const d = new Date(Date.now() - age);
    return { 'DAQ Date': d.toISOString().slice(0, 10), 'DAQ Time (GMT)': d.toISOString().slice(11, 23), 'Energy (pJ)': energy * 1e6 };
}
test('green UI after old critical activity, and chart failure is nonfatal', () => {
    const d = dashboard(); d.setRows([row(600, 600000), row(.001)]); d.evaluate('renderAnalysis()');
    assert.equal(d.elements.lsStatus.textContent, 'LOW');
    assert.equal(d.elements.lsStatus.style.color, '#34d399');
    assert.match(d.elements.chartStatus.textContent, /unavailable/);
});
test('live warning sends one notification and historical review sends none', () => {
    const d = dashboard({ chartAvailable: true }); d.setRows([row(600)]); d.evaluate('renderAnalysis(); renderAnalysis()');
    assert.equal(d.notifications.length, 1); assert.equal(d.charts.length, 1);
    assert.equal(d.elements.lsStatus.textContent, 'CRITICAL');
    d.elements.analysisMode.value = 'history'; d.evaluate('renderAnalysis()');
    assert.equal(d.notifications.length, 1); assert.equal(d.elements.mlNotificationBanner.className, 'notification-banner');
});
test('fetch failure clears a previous green status', async () => {
    const d = dashboard(); d.setRows([row(0)]); d.evaluate('renderAnalysis()');
    await d.evaluate('fetchSheetData()');
    assert.equal(d.elements.lsStatus.textContent, 'UNAVAILABLE');
    assert.equal(d.elements.lsTotalEnergy.textContent, '—');
    assert.equal(d.elements.refreshAnalysis.disabled, false);
});
test('stale and empty responses clear warning UI and charts', () => {
    const d = dashboard({ chartAvailable: true }); d.setRows([row(600)]); d.evaluate('renderAnalysis()');
    d.setRows([row(600, 180000)]); d.evaluate('renderAnalysis()');
    assert.equal(d.elements.lsStatus.textContent, 'STALE DATA');
    assert.equal(d.charts[0].data.datasets[0].data.length, 0);
    assert.equal(d.elements.mlNotificationBanner.className, 'notification-banner');
    d.setRows([]); d.evaluate('renderAnalysis()'); assert.equal(d.elements.lsStatus.textContent, 'NO DATA');
});
test('successful fetch consumes raw GViz values and restores availability', async () => {
    const d = dashboard(); const r = row(.001);
    d.ctx.fetch = async () => ({ ok: true, text: async () => 'google.visualization.Query.setResponse(' + JSON.stringify({ table: { cols: Object.keys(r).map(label => ({ label })), rows: [{ c: Object.values(r).map(v => ({ v })) }] } }) + ');' });
    d.evaluate('fetchFailed = true'); await d.evaluate('fetchSheetData()');
    assert.equal(d.elements.lsStatus.textContent, 'LOW'); assert.equal(d.elements.statTotalRecords.textContent, '1');
});
