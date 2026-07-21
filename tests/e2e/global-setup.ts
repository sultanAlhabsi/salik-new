import { prepareE2EDatabase } from "./environment";

export default async function globalSetup() {
  await prepareE2EDatabase();
}
