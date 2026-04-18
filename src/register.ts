import { registerCommands } from "honocord";
import * as interactions from "./interactions";

await registerCommands(
  process.env.DISCORD_TOKEN,
  process.env.DISCORD_APPLICATION_ID,
  ...Object.values(interactions),
);
