import { removeE2EEnvironment } from "./environment";

export default async function globalTeardown() {
  await removeE2EEnvironment();
}
