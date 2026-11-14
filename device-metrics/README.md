# Device Metrics

**Planning stage — not yet an installable plugin.**

A proposed independent [MeshPulse](https://github.com/maxg10/meshpulse) plugin
for reviewing device telemetry, especially solar-powered nodes. The initial view
will be a plugin tab, with a node selector, current readings, a time-series graph
and a sample list. A compact map card can be considered later.

## Agreed direction

- Collect device metrics as MeshPulse receives them and retain history in the
  plugin's own storage. Historical data from the phone is not required.
- Show available battery level, voltage, channel utilisation, air utilisation
  and uptime, along with the age of the latest received sample. Values may be
  missing; do not invent them.
- Remember the last selected node and time range per browser.
- Use solid lines for expected sampling intervals and dotted lines across longer
  gaps. Dotted segments connect real samples and do not imply measurements
  were recorded in between. Make actual sample times and values inspectable.
- Account for the expected telemetry interval when identifying gaps. The
  operator's solar node currently reports approximately every six hours; a
  six-hour interval is normal for that node, not automatically a gap.
- Work on phones and desktop. Keep MeshPulse core unchanged unless a bug is
  found or an explicitly agreed upstream extension is needed.

## To decide during implementation

- How reporting interval and missed-report thresholds are configured or inferred.
- Retention, storage limits, sampling and behavior when the plugin is offline.
- Chart scales, accessible labels and the selected time ranges.
- Handling unknown nodes, delayed telemetry, replays and repeated samples.
- Whether an eventual map card adds value alongside the detailed tab.

MeshPulse's current node records expose latest values and its telemetry hook
provides incoming samples. A per-node device-metrics history table was not
found in the inspected core database, so the plugin should not assume earlier
samples are available. Actual hook and storage behavior still need testing.
