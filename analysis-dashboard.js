'use strict';
const SPREADSHEET_ID = '1KWdzI955ltBbcBJWhAF4RTsh92IOi3D1rHnjIwKmHJA';
let allData = [], chart = null, loading = false, loaded = false, fetchFailed = false;
let lastNotificationTime = 0, lastNotifiedLevel = -1;
const el = id => document.getElementById(id);
const format = n => n.toLocaleString(undefined, { maximumFractionDigits: n > 0 && n < .01 ? 6 : 2 });
const sensorZone = () => el('sensorTimezone').value === '0' ? 'UTC' : 'Asia/Kolkata';
const sensorTime = t => new Date(t).toLocaleString(undefined, { timeZone: sensorZone() }) + (sensorZone() === 'UTC' ? ' UTC' : ' IST');

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    updateNavStatus(true);
    el('displaySheetName').textContent = localStorage.getItem('selectedSheet') || 'Sheet1';
    el('refreshAnalysis').addEventListener('click', fetchSheetData);
    el('analysisMode').addEventListener('change', renderAnalysis);
    el('showThresholds').addEventListener('change', renderAnalysis);
    el('sensorTimezone').value = localStorage.getItem('analysisUtcOffset') === '0' ? '0' : '330';
    el('sensorTimezone').addEventListener('change', () => {
        localStorage.setItem('analysisUtcOffset', el('sensorTimezone').value);
        renderAnalysis();
    });
    el('enableNotifications').addEventListener('click', async () => {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            el('enableNotifications').textContent = permission === 'granted' ? 'Notifications enabled' : 'Notifications unavailable';
        } else el('enableNotifications').textContent = 'Notifications unavailable';
    });
    fetchSheetData();
    const interval = AcousticAnalysis.number(localStorage.getItem('refreshInterval')) ?? 5;
    setInterval(fetchSheetData, Math.max(5, interval) * 1000);
    // Age and decay keep updating even when no new sheet rows arrive.
    setInterval(() => { if (loaded) renderAnalysis(); }, 1000);
});

async function fetchSheetData() {
    if (loading) return;
    loading = true;
    el('refreshAnalysis').disabled = true;
    el('sourceStatus').textContent = 'Fetching sheet…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const sheet = localStorage.getItem('selectedSheet') || 'Sheet1';
        const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheet)}&_t=${Date.now()}`;
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Sheet returned HTTP ${response.status}`);
        const text = await response.text();
        const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
        if (!match) throw new Error('Unrecognized sheet response');
        const data = JSON.parse(match[1]);
        if (data.status === 'error') throw new Error('Sheet could not be read');
        allData = AcousticAnalysis.tableRows(data.table);
        loaded = true;
        fetchFailed = false;
        el('displaySheetName').textContent = sheet;
        el('statRecordsSub').textContent = `Fetched ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        fetchFailed = true;
        el('statRecordsSub').textContent = 'Fetch failed. Check connection and sheet access.';
        console.error('Analysis fetch failed:', error);
    } finally {
        clearTimeout(timeout);
        loading = false;
        el('refreshAnalysis').disabled = false;
        renderAnalysis();
    }
}

function renderAnalysis() {
    const result = AcousticAnalysis.analyze(allData, {
        decayRate: localStorage.getItem('energyDecayRate'),
        historical: el('analysisMode').value === 'history',
        utcOffsetMinutes: Number(el('sensorTimezone').value)
    });
    const state = fetchFailed ? 'offline' : result.state;
    const available = state === 'ready';
    const labels = { offline: 'UNAVAILABLE', stale: 'STALE DATA', invalid: 'CHECK DATA', empty: 'NO DATA' };
    const color = available ? result.color : '#a1b2c8';
    el('lsStatus').textContent = available ? result.label : labels[state];
    el('lsStatus').style.color = color;
    el('riskSummary').style.borderColor = color;
    el('statusContext').textContent = result.historical ? 'Historical acoustic status' : 'Current acoustic status';
    el('sourceStatus').textContent = fetchFailed ? 'Connection unavailable' : result.historical ? 'Historical review' : available ? 'Recent readings available' : labels[state];
    el('sourceStatus').style.color = color;
    const reasons = {
        empty: 'No readings are available. An empty sheet cannot confirm low activity.',
        offline: 'The sheet could not be refreshed. Current acoustic status is unavailable.',
        invalid: `${result.invalid} rows have missing or invalid energy, dates, or future timestamps. Check the sheet dates and sensor time zone before interpreting the status.`,
        stale: 'The latest event is over two minutes old. Without a sensor heartbeat, quiet conditions and a disconnected sensor cannot be distinguished.'
    };
    el('riskReason').textContent = available
        ? `${format(result.energy)} µJ of retained energy in the last five minutes. ${result.level === 0 ? 'Below the 30 µJ notice threshold.' : 'Meets the ' + AcousticAnalysis.THRESHOLDS[result.level - 1] + ' µJ threshold.'} Energy decays at ${result.decay} µJ/min; older events leave the window.`
        : reasons[state];
    el('lsTotalEnergy').textContent = available ? format(result.energy) : '—';
    el('lsTotalHits').textContent = available ? result.events.toLocaleString() : '—';
    el('eventRate').textContent = available ? format(result.eventRate) + ' / min' : '—';
    el('energyRate').textContent = available ? format(result.energyRate) + ' µJ/min' : '—';
    el('energyTrend').textContent = available ? result.trend : '—';
    el('latestReading').textContent = result.latest === null ? 'No valid timestamp' : sensorTime(result.latest);
    el('windowEnd').textContent = available ? `Window ends ${sensorTime(result.end)}` : 'Waiting for usable readings';
    el('rateContext').textContent = available ? `Rates cover ${format(result.minutes)} observed minutes (minimum one second). Each row counts as one event; HIT Count is the crossings within an event.` : 'Rates require valid, recent readings.';
    el('statTotalRecords').textContent = result.total.toLocaleString();
    el('validRecords').textContent = `${result.valid.toLocaleString()} valid · ${result.invalid.toLocaleString()} excluded`;
    document.querySelectorAll('[data-level]').forEach(node => {
        const active = available && Number(node.dataset.level) === result.level;
        node.classList.toggle('active', active);
        node.setAttribute('aria-current', active ? 'step' : 'false');
    });
    drawChart(available ? result.points : []);
    const alert = available && !result.historical && result.level >= 3;
    el('mlNotificationBanner').className = 'notification-banner' + (alert ? ' show ' + (result.level === 4 ? 'critical' : 'warning') : '');
    if (alert) {
        el('mlNotificationText').textContent = `${result.label}: acoustic energy is elevated (${format(result.energy)} µJ). Review sensor readings and site conditions.`;
        if (localStorage.getItem('mlPushNotifications') !== 'false' && 'Notification' in window && Notification.permission === 'granted' &&
            (Date.now() - lastNotificationTime > 30000 || result.level !== lastNotifiedLevel)) {
            try {
                new Notification(`Acoustics Labs — ${result.label}`, { body: el('mlNotificationText').textContent, icon: 'logo.webp', tag: 'acoustics-warning' });
                lastNotificationTime = Date.now();
                lastNotifiedLevel = result.level;
            } catch (error) { console.warn('Browser notification unavailable:', error); }
        }
    }
}

function drawChart(points) {
    if (typeof Chart === 'undefined') {
        el('chartStatus').textContent = 'Chart library unavailable. The status and metrics remain available.';
        return;
    }
    el('chartStatus').textContent = points.length ? 'Retained acoustic energy · µJ' : 'No current chart data';
    // Bucket extrema preserve short bursts while bounding rendering cost.
    const sampled = [];
    const size = Math.max(1, Math.ceil(points.length / 150));
    for (let i = 0; i < points.length; i += size) {
        const bucket = points.slice(i, i + size);
        const min = bucket.reduce((a, b) => b.energy < a.energy ? b : a);
        const max = bucket.reduce((a, b) => b.energy > a.energy ? b : a);
        sampled.push(...[...new Set([bucket[0], min, max, bucket.at(-1)])].sort((a, b) => a.time - b.time));
    }
    const data = {
        datasets: [{ label: 'Retained energy (µJ)', data: sampled.map(p => ({ x: p.time, y: p.energy })), borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,0.08)', fill: true, pointRadius: 0, borderWidth: 2, tension: 0 },
            ...AcousticAnalysis.THRESHOLDS.map((value, i) => ({ label: `${AcousticAnalysis.LEVELS[i + 1]} ${value} µJ`, hidden: !el('showThresholds').checked, data: points.length ? [{ x: points[0].time, y: value }, { x: points.at(-1).time, y: value }] : [], borderColor: AcousticAnalysis.COLORS[i + 1], borderDash: [5, 5], borderWidth: 1, pointRadius: 0 }))]
    };
    if (chart) { chart.data = data; chart.options.scales.x.title.text = 'Time (' + (sensorZone() === 'UTC' ? 'UTC' : 'IST') + ')'; chart.update('none'); return; }
    Chart.defaults.color = '#a1b2c8';
    chart = new Chart(el('energyChart'), { type: 'line', data, options: {
        responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
        scales: { x: { type: 'linear', ticks: { maxTicksLimit: 5, callback: v => new Date(v).toLocaleTimeString(undefined, { timeZone: sensorZone(), hour12: false }) }, title: { display: true, text: 'Time (' + (sensorZone() === 'UTC' ? 'UTC' : 'IST') + ')' } }, y: { beginAtZero: true, title: { display: true, text: 'Energy (µJ)' } } }
    } });
}
