const assert=require('assert/strict'), fs=require('fs'),vm=require('vm');const ctx={window:{},document:{hidden:false},localStorage:{setItem(){}},console};
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../frontend/js/plugin.js'),'utf8'),ctx);
(async()=>{const chat=new ctx.window.MeshPlugin();let listener,sent;
Object.assign(chat,{tracker:'!00000001',messages:{},deliveryUpdates:{},names:{0:'Primary'},active:'ch:1',saved:{pins:[],unread:{},drafts:{}},panel:{classList:{contains:()=>false}},online:true,pending:false,input:{value:'hello'},status:{},render(){},api:{messages:{connected:()=>true,subscribe:cb=>(listener=cb,()=>{}),history:()=>({messages:{},channelNames:{1:'TAK'},tracker:{node_id:'!00000001'}}),sendTracked:(text,to,ch,id)=>(sent={text,to,ch,id},Promise.resolve({success:true}))}}});
chat.connect();chat.sendMessage();await Promise.resolve();assert.equal(sent.ch,1);assert.equal(chat.pending,false);assert.equal(chat.messages['ch:1'][0].delivery_status,'sending');
listener({type:'message',message:{from_id:'!00000001',to_id:'^all',is_dm:false,channel_index:1,text:'hello',message_id:sent.id,delivery_status:'submitted',delivery_revision:0}});
listener({type:'delivery',update:{message_id:sent.id,status:'delivered_mesh',revision:1}});
assert.equal(chat.messages['ch:1'].length,1);assert.equal(chat.messages['ch:1'][0].delivery_status,'delivered_mesh');
listener({type:'disconnected'});assert.equal(chat.online,false);console.log('Map Chat: shared API channel, result, update and disconnect passed');})().catch(e=>{console.error(e);process.exit(1)});
