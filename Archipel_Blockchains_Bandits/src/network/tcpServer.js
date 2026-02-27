import net from 'node:net';

export class TcpServer {
  constructor({ port, logger }) {
    this.port = port;
    this.logger = logger;
    this.server = null;
  }

  start() {
    this.server = net.createServer((socket) => {
      socket.on('data', (chunk) => {
        const input = chunk.toString('utf8').trim();
        if (input.toUpperCase() === 'PING') {
          socket.write('PONG\n');
        } else {
          socket.write('ACK\n');
        }
      });
    });

    this.server.listen(this.port, () => {
      this.logger.info(`TCP server listening on 0.0.0.0:${this.port}`);
    });
  }

  stop() {
    if (this.server) {
      try {
        this.server.close();
      } catch {
        // no-op
      }
      this.server = null;
    }
  }
}
