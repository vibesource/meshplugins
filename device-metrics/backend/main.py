"""Collect received device telemetry in the plugin's own SQLite database."""
import math
from contextlib import closing
import os
import re
import sqlite3
import threading
import time
from mapper.plugin_api import MeshPlugin

FIELDS = ('battery', 'voltage', 'channel_util', 'air_util_tx', 'uptime')
NODE_ID = re.compile(r'^![0-9a-fA-F]{8}$')
RETENTION = 365 * 86400
MAX_SAMPLES = 5000


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        return value if math.isfinite(value) else None
    except OverflowError:
        return None


class DeviceMetricsPlugin(MeshPlugin):
    def __init__(self):
        super().__init__()
        self._lock = threading.Lock()
        self._db_path = None
        self._last_cleanup = 0

    def on_enable(self):
        os.makedirs(self.plugin_dir, exist_ok=True)
        self._db_path = os.path.join(self.plugin_dir, 'data.db')
        with self._lock, closing(self._connect()) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS samples (node_id TEXT NOT NULL, ts INTEGER NOT NULL, battery REAL, voltage REAL, channel_util REAL, air_util_tx REAL, uptime REAL, PRIMARY KEY (node_id, ts))')
            db.execute('CREATE INDEX IF NOT EXISTS samples_ts ON samples(ts)')
        self.register_ws_channel('metrics')

    def _connect(self):
        db = sqlite3.connect(self._db_path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    async def on_telemetry(self, telemetry):
        node = telemetry.get('node_id')
        ts = number(telemetry.get('timestamp'))
        if not isinstance(node, str) or not NODE_ID.fullmatch(node) or ts is None or ts <= 0:
            return
        values = [number(telemetry.get(field)) for field in FIELDS]
        if all(value is None for value in values):
            return
        now = int(time.time())
        with self._lock, closing(self._connect()) as db, db:
            db.execute('INSERT INTO samples VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(node_id, ts) DO UPDATE SET battery=COALESCE(excluded.battery, samples.battery), voltage=COALESCE(excluded.voltage, samples.voltage), channel_util=COALESCE(excluded.channel_util, samples.channel_util), air_util_tx=COALESCE(excluded.air_util_tx, samples.air_util_tx), uptime=COALESCE(excluded.uptime, samples.uptime)', (node.lower(), int(ts), *values))
            if now - self._last_cleanup >= 86400:
                db.execute('DELETE FROM samples WHERE ts < ?', (now - RETENTION,))
                self._last_cleanup = now

    async def on_ws_request(self, data, channel, reply):
        if not isinstance(data, dict):
            return
        req = data.get('req')
        action = data.get('action')
        if action == 'nodes':
            nodes = {**self.get_nodes(), **self.get_nodes_no_position()}
            with self._lock, closing(self._connect()) as db, db:
                stored = {row['node_id']: row['last_sample'] for row in db.execute('SELECT node_id, MAX(ts) AS last_sample FROM samples GROUP BY node_id')}
            ids = set(stored) | {k for k in nodes if isinstance(k, str) and NODE_ID.fullmatch(k)}
            result = [{'id': node, 'name': (nodes.get(node) or {}).get('name') or node, 'last_sample': stored.get(node)} for node in ids]
            result.sort(key=lambda item: (item['name'].casefold(), item['id']))
            await reply({'req': req, 'nodes': result})
        elif action == 'history':
            node = data.get('node_id')
            seconds = data.get('seconds')
            if not isinstance(node, str) or not NODE_ID.fullmatch(node) or isinstance(seconds, bool) or not isinstance(seconds, int) or not 3600 <= seconds <= RETENTION:
                await reply({'req': req, 'error': 'Invalid node or time range'})
                return
            with self._lock, closing(self._connect()) as db, db:
                rows = db.execute('SELECT ts, battery, voltage, channel_util, air_util_tx, uptime FROM samples WHERE node_id = ? AND ts >= ? ORDER BY ts DESC LIMIT ?', (node.lower(), int(time.time()) - seconds, MAX_SAMPLES + 1)).fetchall()
                latest = db.execute('SELECT ts, battery, voltage, channel_util, air_util_tx, uptime FROM samples WHERE node_id = ? ORDER BY ts DESC LIMIT 1', (node.lower(),)).fetchone()
            truncated = len(rows) > MAX_SAMPLES
            await reply({'req': req, 'node_id': node.lower(), 'samples': [dict(row) for row in reversed(rows[:MAX_SAMPLES])], 'latest': dict(latest) if latest else None, 'truncated': truncated})
        else:
            await reply({'req': req, 'error': 'Unknown request'})
