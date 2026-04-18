import { Honocord } from "honocord";
import * as interactions from "./interactions";

export const client = new Honocord({
  isCFWorker: true,
});

client.loadHandlers(...Object.values(interactions));

export default client.getApp();
