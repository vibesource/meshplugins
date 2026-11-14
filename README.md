# MeshPulse plugins

Independent plugins for [MeshPulse](https://github.com/maxg10/meshpulse), the
mesh mapping and plugin platform created by Max Gieparda. These plugins are
maintained separately and are not official MeshPulse plugins.

| Plugin | Description | Compatibility |
| --- | --- | --- |
| [Map Chat](map-chat/README.md) | Channel and direct-message conversations on the map | Requires the [Map Chat integration branch](https://github.com/vibesource/meshpulse/tree/integration/map-chat-api) of our MeshPulse fork; not compatible with unmodified upstream 2.9.6 |
| [Device Metrics](device-metrics/README.md) | Device telemetry history and trends | Planning stage; not yet installable |

## Build and install

Requires Python 3 and `zip`:

```sh
./build.sh           # all plugins
./build.sh map-chat  # one plugin
```

Packages are created in `dist/`, which is not committed. Upload a package in
MeshPulse under **Config → Plugins**. See each plugin's README before installing.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
