# Device Metrics

**Early test version.** It collects new telemetry after installation; it does not import historical phone data.

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

## Compatibility target

Target **unmodified upstream MeshPulse 2.9.6** as well as the local fork; this
plugin is not intended to depend on the Map Chat fork-only messaging or delivery
APIs. A read-only review of upstream commit `a0e090e` found the plugin page,
`on_telemetry` hook and plugin WebSocket request/response mechanisms needed for
the proposed design. This is a feasibility assessment, not a compatibility
claim: implementation and tests against stock upstream are still required.

The upstream telemetry hook is dispatched for nodes already present in its node
lists and the packet parser requires a usable formatted sender ID. Missing or
unrecognised senders can therefore mean a sample never reaches the plugin;
this is a core limitation to document and test, not something to hide by
assuming every radio packet was recorded. The plugin should capture only values
actually supplied by the hook. Network access from a phone also depends on the
host's WebSocket proxy and is separate from plugin compatibility.

This concerns the MeshPulse application, not a requirement for a custom
Meshtastic radio firmware. Device firmware and hardware must provide the
telemetry values, and their compatibility remains to be tested.

## Build and test

Run `./build.sh device-metrics` from the repository root and install
`dist/device-metrics-0.1.3.meshplugin` via MeshPulse Config → Plugins. The
plugin creates `data.db` in its plugin directory; back up the plugin volume.
Samples are retained for one year, cleaned on incoming telemetry. The chart
retrieves up to 5,000 samples for the selected range and the list shows the
most recent 500. A notice is displayed if the chart result is truncated.

The optional node filter shows only nodes with samples recorded by this plugin,
including samples outside the selected time range. The filter and last selection
are saved per browser. A manual telemetry request is a possible future feature;
the current plugin does not send requests to nodes.

The expected interval selector is stored per browser; a gap longer than twice
that interval is shown dotted. The latest card shows the most recent stored
sample even when it falls outside the chosen graph range. On HTTPS the page
uses `/meshpulse-ws` on the same origin; the reverse proxy must route that path
to MeshPulse's WebSocket. On ordinary HTTP it uses the host's port 8765.
Telemetry history is exposed through a read-only plugin WebSocket channel;
MeshPulse's generic plugin channels are not protected by its `send_message`
admin check, so network access controls matter.

Automated checks: `python3 -B -m unittest discover -s device-metrics/tests -p
"test_*.py"` and `node device-metrics/tests/browser.cjs` (Playwright required).
