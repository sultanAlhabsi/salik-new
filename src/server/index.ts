import { config } from './config.js';
import { prisma } from './db.js';
import { createApp } from './app.js';

const app = createApp({ prisma });

app.listen(config.port, () => {
  console.log(`SALIK API listening on http://localhost:${config.port}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
