# Acoustic analysis

The dashboard now uses a deterministic acoustic energy indicator. It does not
estimate the probability of a landslide. The previous live classifier trained on
random synthetic profiles and used lifetime energy as a feature, while the
threshold card used decaying energy. Those conflicting calculations could keep
the ML warning elevated after activity subsided.

## Current behavior

- Use the last five minutes relative to current UTC time. Historical view anchors
  the window to the latest valid reading and never sends notifications.
- Sensor timestamps default to India time (IST, UTC+05:30), confirmed by the
  operator. The visible time-zone control also supports UTC/GMT and persists the
  choice. The `DAQ Time (GMT)` label in some exports does not override this choice.
- Sort full DAQ dates and times before calculating energy. Dates support
  `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, and Google Visualization date cells.
  Google timeofday arrays and datetime time cells are supported too. Time-only
  records are not sufficient for live analysis.
- Convert pJ to µJ by dividing by 1,000,000. Retained energy decays linearly
  between events and from the final event to the analysis time. Decay defaults
  to 5 µJ/min and respects the existing Settings selection. Events older than
  five minutes leave the calculation completely.
- Bands are LOW <30, NOTICE 30–<100, CAUTION 100–<300, WARNING 300–<500,
  CRITICAL ≥500 µJ. These are inherited provisional thresholds, now applied to
  the same recent window throughout the dashboard. Window length and thresholds
  require site calibration; changing the window changes alert behavior.
- LOW and NOTICE are green. A small event count cannot override a large energy
  burst. Event and energy rates and the previous-window trend are context, not
  independent triggers with invented thresholds.
- Each row is one acoustic event. DAQ `HIT Count` is the threshold crossings
  within an event, not the number of events. Records from the selected sheet
  are pooled; use separate sheets for independently monitored sites/sensors.
- Rates divide by the observed span, capped at five minutes and floored at one
  second. Short recordings are explicitly identified in the dashboard.
- Empty, invalid, stale (>2 minutes), future-dated, or failed-fetch data cannot
  show a green live status. The source has no sensor heartbeat, so an unchanged
  sheet cannot distinguish a quiet sensor from a disconnected one. Historical
  view can inspect old recordings, but does not establish a current condition.
- Raw sheet values preserve numeric precision. Blank column labels do not shift
  data into the wrong fields. Malformed rows are counted and block interpretation
  until corrected. No row deduplication is attempted without a unique event ID.
- Permission for browser notifications is requested by the button. The existing
  notification preference and 30-second cooldown are preserved.

The old `ml-model/generate_model.html` remains an offline synthetic-data
experiment. Its validation score only measures synthetic-profile classification;
it must not be interpreted as landslide accuracy. Cached v2 models are not loaded
by the dashboard.

## Validation

Run with Node.js (no package installation needed):

```sh
node --test tests/*.test.cjs
```

Regression cases cover quiet recovery after old bursts, sparse strong bursts,
energy units, decay without new rows, threshold boundaries, UTC rollover,
unordered input, DAQ milliseconds, raw sheet values, blank headers, stale and
invalid data, historical analysis, and event rates.

## Measuring and improving landslide prediction

No labeled landslide dataset is available yet. Do not report model accuracy,
confidence, or probability from these rules. Preserve acoustic recordings with
site and sensor IDs, UTC timestamps, sensor health/heartbeat, and independently
verified event onset times. Include quiet periods and disturbances such as rain,
traffic, and sensor faults. Record rainfall, pore pressure, soil moisture, and
displacement where available.

Define a prediction horizon and what qualifies as a landslide before labeling
windows. Keep all windows from the same event together and hold out entire events,
later dates, and sites during evaluation to avoid overlapping-window leakage.
Compare a trained model against these provisional rules using event recall,
precision, false alarms per monitored day, missed events, and warning lead time.
Use a separate validation set to calibrate thresholds and probabilities, then
report the final results on untouched test data. Deploy a trained model only
after this comparison supports it.

Background: [USGS real-time monitoring](https://www.usgs.gov/programs/landslide-hazards/science/real-time-monitoring-potential-landslides)
describes monitoring rainfall, soil water content, and soil water pressure for
landslide early warning.
