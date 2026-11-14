# Device Metrics

Device Metrics is an independent plugin for [MeshPulse](https://github.com/maxg10/meshpulse), created by Max Gieparda. It records newly received device telemetry and displays history in a dedicated tab on desktop and mobile. It does not import historical phone data.

Select a node and time range to view received battery percentage, voltage, channel and air utilisation, and uptime where available. Hover, tap or focus a graph point for its timestamp and value. The battery chart uses separate percentage and voltage axes, with a 20% guide. Its voltage scale starts at 3–4.5 V and expands for readings outside that range; this is a display range, not a universal battery safety threshold. Battery value 101 denotes external power and is not plotted as a percentage.

The node, range, expected reporting interval and optional filter for nodes with recorded samples are remembered per browser. Dotted segments connect actual samples more than twice the expected interval apart; they do not represent measurements taken in the gap. The latest card can show a sample outside the selected chart range.

## Compatibility and limitations

The plugin uses the standard plugin page, `on_telemetry` hook and plugin WebSocket API in upstream MeshPulse 2.9.6; it does **not** require the Map Chat messaging APIs. Installation, hook dispatch and database persistence across upgrade have been tested against the stock 2.9.6 plugin manager. Live collection has been tested with a TCP-connected Heltec V4 using our MeshPulse fork.

Stock MeshPulse 2.9.6 can discard telemetry packets when the Meshtastic Python library does not provide a formatted sender ID. Our [proposed core fix](https://github.com/maxg10/meshpulse/pull/11) handles numeric senders. Even with that fix, MeshPulse currently does not forward telemetry to plugins when the sender is absent from its own node lists. Consequently this plugin can only record samples the core passes to it, and history may be incomplete. The sender fix is in a separate trial and may not be present in all builds of our fork. A manual request button is not currently implemented.

## Build and install

Run `./build.sh device-metrics` from the repository root and install `dist/device-metrics-0.1.4.meshplugin` via MeshPulse **Config → Plugins**. The plugin creates `data.db` in its plugin directory; back up the plugin volume. Samples are retained for one year, cleaned on incoming telemetry. The chart retrieves up to 5,000 samples for the selected range and the list shows the most recent 500. A notice appears if the chart result is truncated.

On HTTPS the page uses `/meshpulse-ws` on the same origin; the reverse proxy must route that path to MeshPulse's WebSocket. On ordinary HTTP it uses the host's port 8765. Telemetry history is exposed through a read-only plugin WebSocket channel; MeshPulse's generic plugin channels are not protected by its `send_message` admin check, so network access controls matter.

Run `python3 -B -m unittest discover -s device-metrics/tests -p 'test_*.py'` and `node device-metrics/tests/browser.cjs` (Playwright required) for the automated checks.
