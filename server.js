const { PeerServer } = require("peer");

const port = Number(process.env.PORT) || 9000;

PeerServer({
  port,
  host: "0.0.0.0",  
  path: "/peerjs",
  proxied: true,  
  allow_discovery: false,
  corsOptions: { origin: true },
});

console.log(`PeerServer jalan di port ${port}, path /peerjs`);
