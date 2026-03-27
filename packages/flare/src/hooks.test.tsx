import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useStyleEditor } from "./hooks";

function createElement() {
  const el = document.createElement("div");
  el.style.color = "rgb(0, 0, 0)";
  document.body.appendChild(el);
  return el;
}

describe("useStyleEditor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("acknowledges pushed changes as the new baseline", () => {
    const el = createElement();
    const { result } = renderHook(() => useStyleEditor(el));

    act(() => {
      result.current.setValue("color", "rgb(255, 0, 0)");
      result.current.setComment("Primary CTA color");
    });

    expect(result.current.totalStyleChangeCount).toBe(1);
    expect(result.current.totalCommentCount).toBe(1);
    expect(result.current.totalChangeCount).toBe(2);

    const submittedEntries = result.current.getAllChanges();

    act(() => {
      result.current.acknowledgeEntries(submittedEntries);
    });

    expect(result.current.totalStyleChangeCount).toBe(0);
    expect(result.current.totalCommentCount).toBe(0);
    expect(result.current.totalChangeCount).toBe(0);
    expect(result.current.getAllChanges()).toHaveLength(0);

    act(() => {
      result.current.setValue("color", "rgb(0, 0, 255)");
    });

    expect(result.current.totalStyleChangeCount).toBe(1);
    expect(result.current.totalChangeCount).toBe(1);
    expect(result.current.getAllChanges()).toHaveLength(1);
  });

  it("clears comment-only changes when acknowledged", () => {
    const el = createElement();
    const { result } = renderHook(() => useStyleEditor(el));

    act(() => {
      result.current.setComment("Tighten spacing intent");
    });

    expect(result.current.totalCommentCount).toBe(1);
    expect(result.current.totalChangeCount).toBe(1);

    const submittedEntries = result.current.getAllChanges();

    act(() => {
      result.current.acknowledgeEntries(submittedEntries);
    });

    expect(result.current.comment).toBe("");
    expect(result.current.totalCommentCount).toBe(0);
    expect(result.current.totalChangeCount).toBe(0);
    expect(result.current.getAllChanges()).toHaveLength(0);
  });

  it("does not acknowledge newer edits that were not part of the submitted snapshot", () => {
    const el = createElement();
    const { result } = renderHook(() => useStyleEditor(el));

    act(() => {
      result.current.setComment("First comment");
    });
    const submittedEntries = result.current.getAllChanges();

    act(() => {
      result.current.setComment("Second comment");
      result.current.acknowledgeEntries(submittedEntries);
    });

    expect(result.current.comment).toBe("Second comment");
    expect(result.current.totalCommentCount).toBe(1);
    expect(result.current.totalChangeCount).toBe(1);
  });
});
