const net = require('net');
const LOCAL_PORT = 5433;
const REMOTE_HOST = '2406:da18:e5c:b702:f0e9:bdc3:8b00:e47b';
const REMOTE_PORT = 5432;

const server = net.createServer((localSocket) => {
    const remoteSocket = new net.Socket();
    remoteSocket.connect(REMOTE_PORT, REMOTE_HOST, () => {
        localSocket.pipe(remoteSocket);
        remoteSocket.pipe(localSocket);
    });
    remoteSocket.on('error', (err) => { localSocket.destroy(); });
    localSocket.on('error', (err) => { remoteSocket.destroy(); });
});

server.listen(LOCAL_PORT, '0.0.0.0', () => {
    console.log('Proxy listening on 0.0.0.0:' + LOCAL_PORT);
});
