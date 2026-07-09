import { describe, expect, test } from "bun:test";
import {
  ComponentHandler,
  ParleyClient,
  flattenHandlers,
  isContextCommandHandler,
  isSlashCommandHandler,
  resetLogSink,
  setLogSinkForTests,
  type AnyHandler,
} from "@parley/runtime";
import { createApp } from "#/app";
import { workerHandlers } from "#/handlers";

function registryKeys(handler: ReturnType<typeof flattenHandlers>[number]): string[] {
  if (isSlashCommandHandler(handler) || isContextCommandHandler(handler)) {
    if (handler.isGuildCommand()) {
      return [...handler.guildIds].map((guildId) => `${guildId}:${handler.name}`);
    }
    return [handler.name];
  }
  const typed = handler as AnyHandler & { handlerType?: string; prefix?: string };
  if (typed.handlerType === "component") {
    const component = handler as { prefix: string; componentType: number };
    return [`${component.prefix}:${component.componentType}`];
  }
  if (typed.handlerType === "modal") {
    return [typed.prefix ?? ""];
  }
  return [];
}

describe("createApp", () => {
  test("registers worker handlers without duplicate registry keys", () => {
    const duplicates: string[] = [];
    const seen = new Map<string, number>();

    for (const handler of flattenHandlers(workerHandlers)) {
      for (const key of registryKeys(handler)) {
        const count = (seen.get(key) ?? 0) + 1;
        seen.set(key, count);
        if (count > 1) {
          duplicates.push(key);
        }
      }
    }

    expect(duplicates).toEqual([]);
  });

  test("does not emit discord.handler.duplicate warnings", () => {
    const duplicateEvents: string[] = [];
    setLogSinkForTests((record) => {
      if (record.event === "discord.handler.duplicate") {
        duplicateEvents.push(record.event);
      }
    });

    try {
      createApp();
      expect(duplicateEvents).toEqual([]);
    } finally {
      resetLogSink();
    }
  });

  test("throws when the same component handler key is registered twice", () => {
    const duplicate = new ComponentHandler("settings", 2).addHandler(async () => {});
    const client = new ParleyClient();

    expect(() => client.loadHandlers(duplicate, duplicate)).not.toThrow();
    expect(() =>
      client.loadHandlers(new ComponentHandler("settings", 2).addHandler(async () => {})),
    ).toThrow('Duplicate component handler registration for key "settings:2"');
  });
});
