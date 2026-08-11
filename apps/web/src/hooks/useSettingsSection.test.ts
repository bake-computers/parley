import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { useSettingsSection } from "./useSettingsSection";

type UserPrefs = { matchmakingEnabled: boolean; profilePublic: boolean };

const INITIAL: UserPrefs = { matchmakingEnabled: true, profilePublic: true };

function mockSaveResponse(payload: UserPrefs) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ settings: payload }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("useSettingsSection autosave", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("updateField debounces a save and reports saved status", async () => {
    vi.useFakeTimers();
    const fetchMock = mockSaveResponse({ matchmakingEnabled: true, profilePublic: false });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useSettingsSection({
        initial: INITIAL,
        validate: () => null,
        persist: { mode: "user" },
      }),
    );

    act(() => {
      result.current.updateField({ profilePublic: false });
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
    expect(result.current.saved).toEqual({ matchmakingEnabled: true, profilePublic: false });

    // Typing again while the previous save is still in flight coalesces into one save.
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.status).toBe("idle");
  });

  test("setToggle saves immediately without debounce", async () => {
    vi.useFakeTimers();
    const fetchMock = mockSaveResponse({ matchmakingEnabled: false, profilePublic: true });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useSettingsSection({
        initial: INITIAL,
        validate: () => null,
        persist: { mode: "user" },
      }),
    );

    await act(async () => {
      result.current.setToggle("matchmakingEnabled", false);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
    expect(result.current.draft.matchmakingEnabled).toBe(false);
  });

  test("invalid drafts are not PATCHed and surface an error status", async () => {
    vi.useFakeTimers();
    const fetchMock = mockSaveResponse(INITIAL);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useSettingsSection({
        initial: INITIAL,
        validate: (draft) => (draft.profilePublic ? null : "Profile must be public"),
        persist: { mode: "user" },
      }),
    );

    act(() => {
      result.current.updateField({ profilePublic: false });
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Profile must be public");
  });
});
