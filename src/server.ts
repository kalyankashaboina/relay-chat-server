import http from "http";
import { app } from "./app";
import { env } from "./config/env";
import { connectMongo } from "./db/mongo";
import { initSocket } from "./modules/socket";

async function bootstrap() {
  await connectMongo();

  // 1️⃣ Create HTTP server from Express
  const server = http.createServer(app);

  // 2️⃣ Attach Socket.IO to SAME server
initSocket(server);

  // 3️⃣ Start listening
  server.listen(env.PORT, () => {
    console.log(`🚀 Server running on port ${env.PORT}`);
    console.log(`🌐 Frontend URL: ${env.FRONTEND_URL}`);
  });
}

bootstrap();
