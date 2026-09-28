/* Shared, deterministic acoustic indicators. Thresholds are provisional, not
 * calibrated landslide probabilities. Timestamp offsets are explicit. */
(function (root) {
    'use strict';
    const LEVELS = ['LOW', 'NOTICE', 'CAUTION', 'WARNING', 'CRITICAL'];
    const COLORS = ['#34d399', '#34d399', '#fbbf24', '#fb923c', '#f87171'];
    const THRESHOLDS = [30, 100, 300, 500]; // microjoules
    const WINDOW_MS = 5 * 60 * 1000;
    const STALE_MS = 2 * 60 * 1000;

    function number(value) {
        if (typeof value !== 'number' && typeof value !== 'string') return null;
        const text = String(value).trim();
        if (!text || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.replace(/,/g, ''))) return null;
        const n = Number(text.replace(/,/g, ''));
        return Number.isFinite(n) && n >= 0 ? n : null;
    }

    function dateParts(value) {
        const text = String(value ?? '').trim();
        let m = text.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})(?:,.*)?\)$/);
        if (m) return [+m[1], +m[2] + 1, +m[3]];
        m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m) return [+m[1], +m[2], +m[3]];
        m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        return m ? [+m[3], +m[2], +m[1]] : null;
    }

    function timestamp(row, utcOffsetMinutes = 0) {
        const date = dateParts(row['DAQ Date'] ?? row.Date);
        let time = row['DAQ Time (GMT)'] ?? row.Time;
        const gvizTime = String(time ?? '').match(/^Date\(\d+,\d+,\d+,(\d+),(\d+),(\d+)(?:,(\d+))?\)$/);
        if (gvizTime) time = [+gvizTime[1], +gvizTime[2], +gvizTime[3], +(gvizTime[4] ?? 0)];
        // GViz timeofday cells can contain [hour, minute, second, millisecond].
        if (Array.isArray(time)) time = `${time[0]}:${time[1]}:${time[2] ?? 0}.${String(time[3] ?? 0).padStart(3, '0')}`;
        const m = String(time ?? '').trim().match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,4}))?$/);
        if (!date || !m) return null;
        // DAQ firmware formats integer milliseconds with four digits (e.g. .0123).
        const ms = m[4]?.length === 4 ? +m[4] : +(m[4] ?? '').padEnd(3, '0');
        if (+m[1] > 23 || +m[2] > 59 || +m[3] > 59 || ms > 999) return null;
        const t = Date.UTC(date[0], date[1] - 1, date[2], +m[1], +m[2], +m[3], ms);
        const d = new Date(t);
        return d.getUTCFullYear() === date[0] && d.getUTCMonth() === date[1] - 1 && d.getUTCDate() === date[2] ? t - utcOffsetMinutes * 60000 : null;
    }

    function tableRows(table) {
        if (!Array.isArray(table?.cols) || !Array.isArray(table?.rows)) throw new Error('Missing sheet columns or rows');
        // Keep original column indices, including unlabeled columns; use raw values.
        return table.rows.filter(r => r?.c?.some(c => c?.v != null)).map(r => {
            const row = {};
            table.cols.forEach((col, i) => {
                if (col?.label?.trim()) row[col.label.trim()] = r.c[i]?.v ?? '';
            });
            return row;
        });
    }

    function analyze(rows, options = {}) {
        const now = options.now ?? Date.now();
        const historical = options.historical === true;
        const decay = number(options.decayRate) ?? 5;
        let invalid = 0;
        const records = [];
        for (const row of rows) {
            const time = timestamp(row, options.utcOffsetMinutes ?? 0);
            const energy = number(row['Energy (pJ)'] ?? row.Energy);
            if (time === null || energy === null || time > now) { invalid++; continue; }
            records.push({ time, energy: energy / 1e6 });
        }
        records.sort((a, b) => a.time - b.time);
        const latest = records.at(-1)?.time ?? null;
        const end = historical && latest !== null ? latest : now;
        const start = end - WINDOW_MS;
        const recent = records.filter(r => r.time > start && r.time <= end);
        const previous = records.filter(r => r.time > start - WINDOW_MS && r.time <= start);
        let energy = 0, last = start;
        const points = [{ time: start, energy: 0 }];
        for (const r of recent) {
            energy = Math.max(0, energy - decay * (r.time - last) / 60000);
            points.push({ time: r.time, energy });
            energy += r.energy;
            last = r.time;
            points.push({ time: last, energy });
        }
        energy = Math.max(0, energy - decay * (end - last) / 60000);
        points.push({ time: end, energy });
        const age = latest === null ? null : now - latest;
        let state = 'ready';
        if (rows.length === 0) state = 'empty';
        else if (invalid > 0 || latest === null) state = 'invalid';
        else if (!historical && age > STALE_MS) state = 'stale';
        const level = THRESHOLDS.filter(t => energy >= t).length;
        const minutes = Math.max(1 / 60, Math.min(WINDOW_MS, end - (records[0]?.time ?? end)) / 60000);
        const rawEnergy = recent.reduce((sum, r) => sum + r.energy, 0);
        const previousEnergy = previous.reduce((sum, r) => sum + r.energy, 0);
        const fullHistory = records.length > 0 && records[0].time <= start - WINDOW_MS;
        return { state, historical, level, label: LEVELS[level], color: COLORS[level], energy,
            rawEnergy, events: recent.length, eventRate: recent.length / minutes,
            energyRate: rawEnergy / minutes, minutes, latest, age, end, invalid,
            total: rows.length, valid: records.length, decay, points,
            trend: !fullHistory ? 'More history needed' : rawEnergy > previousEnergy * 1.1 ? 'Rising' : rawEnergy < previousEnergy * 0.9 ? 'Falling' : 'Steady' };
    }
    const api = { analyze, tableRows, timestamp, number, LEVELS, COLORS, THRESHOLDS, WINDOW_MS, STALE_MS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.AcousticAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
