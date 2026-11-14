"""Run inside stock MeshPulse with a package mounted at /tmp/device-metrics.meshplugin."""
import asyncio
import tempfile
import time
from types import SimpleNamespace
from mapper.plugin_manager import PluginManager

async def run():
    with tempfile.TemporaryDirectory() as directory:
        mapper=SimpleNamespace(nodes={'!12345678':{'name':'Synthetic solar'}},nodes_no_position={})
        manager=PluginManager(mapper,plugins_dir=directory,mapper_version='2.9.6')
        manager._get_web_root=lambda: None
        package='/tmp/device-metrics.meshplugin'
        assert manager.install(package)['success']
        assert manager.enable('vibesource/device-metrics')['success']
        await manager.dispatch_hook('on_telemetry',{'node_id':'!12345678','timestamp':int(time.time()),'battery':94,'voltage':4.05})
        plugin=manager.plugins['vibesource/device-metrics']
        replies=[]
        async def reply(data): replies.append(data)
        await plugin.on_ws_request({'action':'history','node_id':'!12345678','seconds':86400,'req':'r1'},'',reply)
        assert replies[-1]['samples'][0]['battery']==94
        manager.disable('vibesource/device-metrics')
        assert manager.install(package)['success']
        assert manager.enable('vibesource/device-metrics')['success']
        plugin=manager.plugins['vibesource/device-metrics']
        await plugin.on_ws_request({'action':'history','node_id':'!12345678','seconds':86400,'req':'r2'},'',reply)
        assert replies[-1]['samples'][0]['voltage']==4.05
        print('Stock plugin manager: install, telemetry hook, request and upgrade persistence passed')
asyncio.run(run())
