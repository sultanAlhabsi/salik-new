import { removeE2EEnvironment } from "./environment";

export default async function globalTeardown() {
  removeE2EEnvironment();
}
