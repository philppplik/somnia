// Deliberately hostile CI-only negative control. Reserved documentation endpoints only.
import net from 'node:net';import dgram from 'node:dgram';
for(const host of ['198.51.100.1','2001:db8::1','127.0.0.1','::1']){const socket=net.connect({host,port:45839});socket.on('error',()=>{});setTimeout(()=>socket.destroy(),600);}
for(const type of ['udp4','udp6']){const socket=dgram.createSocket(type);socket.on('error',()=>socket.close());socket.send(Buffer.from('synthetic DNS probe'),53,type==='udp4'?'198.51.100.1':'2001:db8::1',()=>socket.close());}
setTimeout(()=>{},800);
