import asyncio
import importlib.util
import os
import sys
import tempfile
import time
import types
import unittest
from pathlib import Path
from unittest.mock import patch

api = types.ModuleType('mapper.plugin_api')
class MeshPlugin:
    def register_ws_channel(self, channel): self.channel = channel
    def get_nodes(self): return self.nodes
    def get_nodes_no_position(self): return {}
api.MeshPlugin = MeshPlugin
spec = importlib.util.spec_from_file_location('device_metrics', Path(__file__).resolve().parents[1] / 'backend/main.py')
module = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {'mapper': types.ModuleType('mapper'), 'mapper.plugin_api': api}):
    spec.loader.exec_module(module)

class Tests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.plugin = module.DeviceMetricsPlugin(); self.plugin.plugin_dir = self.tmp.name
        self.plugin.nodes = {'!12345678': {'name': 'Solar'}}; self.plugin.on_enable()
        self.now = int(time.time()); self.results = []
    async def reply(self, data): self.results.append(data)
    async def test_store_partial_values_and_merge_same_timestamp(self):
        await self.plugin.on_telemetry({'node_id':'!12345678','timestamp':self.now,'battery':50,'voltage':4.1})
        await self.plugin.on_telemetry({'node_id':'!12345678','timestamp':self.now,'channel_util':3})
        await self.plugin.on_ws_request({'action':'history','node_id':'!12345678','seconds':86400,'req':'1'},'',self.reply)
        sample = self.results[-1]['samples'][0]
        self.assertEqual((sample['battery'],sample['voltage'],sample['channel_util']), (50,4.1,3))
        self.assertIsNone(sample['air_util_tx']); self.assertEqual(self.results[-1]['req'],'1')
    async def test_latest_outside_range_and_persistence(self):
        await self.plugin.on_telemetry({'node_id':'!12345678','timestamp':self.now-7200,'voltage':3.9})
        second = module.DeviceMetricsPlugin(); second.plugin_dir=self.tmp.name; second.nodes=self.plugin.nodes; second.on_enable()
        await second.on_ws_request({'action':'history','node_id':'!12345678','seconds':3600},'',self.reply)
        self.assertEqual(self.results[-1]['samples'],[]);self.assertEqual(self.results[-1]['latest']['voltage'],3.9)
    async def test_invalid_input_and_empty_telemetry(self):
        for msg in ({'node_id':'bad','timestamp':self.now,'battery':5},{'node_id':'!12345678','timestamp':self.now},{'node_id':'!12345678','timestamp':self.now,'battery':float('nan')}): await self.plugin.on_telemetry(msg)
        await self.plugin.on_ws_request({'action':'history','node_id':'!12345678','seconds':3600},'',self.reply)
        self.assertEqual(self.results[-1]['samples'],[])
        await self.plugin.on_ws_request({'action':'history','node_id':'bad','seconds':3600},'',self.reply)
        self.assertIn('error',self.results[-1])
    async def test_nodes_include_stored_node_after_node_expires(self):
        await self.plugin.on_telemetry({'node_id':'!abcdef01','timestamp':self.now,'battery':10})
        await self.plugin.on_ws_request({'action':'nodes','req':'2'},'',self.reply)
        self.assertEqual({n['id'] for n in self.results[-1]['nodes']},{'!12345678','!abcdef01'})
        self.assertEqual(self.results[-1]['req'],'2')

if __name__=='__main__': unittest.main()
