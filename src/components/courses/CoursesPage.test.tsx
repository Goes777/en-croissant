import { MantineProvider } from "@mantine/core";
import { createInstance } from "i18next";
import { Provider } from "jotai";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pt from "@/translation/pt-PT.json";
import type { CourseProgress, StoredCourse } from "./model";

const native = vi.hoisted(() => ({
  list: vi.fn<() => Promise<{ courses: StoredCourse[]; warnings: string[] }>>(),
  create: vi.fn<(options: unknown) => Promise<StoredCourse>>(),
  progress: vi.fn<(...args: unknown[]) => Promise<CourseProgress>>(),
  open: vi.fn<(options: unknown) => Promise<string>>(),
  dialog: vi.fn<(options: unknown) => Promise<string[] | null>>(),
  navigate: vi.fn<(options: unknown) => Promise<void>>(),
}));
vi.mock("@tanstack/react-router", () => ({
  useLoaderData: () => ({ documentDir: "library" }),
  useSearch: () => ({}),
  useNavigate: () => native.navigate,
}));
vi.mock("@/state/atoms", async () => {
  const { atom } = await import("jotai");
  return { tabsAtom: atom([]), activeTabAtom: atom(null) };
});
vi.mock("./storage", () => ({
  listCourses: native.list,
  importCourse: native.create,
  updateCourseProgress: native.progress,
}));
vi.mock("./open", () => ({ openCourseLesson: native.open }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: native.dialog }));
vi.mock("@tauri-apps/api/path", () => ({
  basename: async (path: string) => path.split("/").pop(),
}));

import CoursesPage from "./CoursesPage";

let container: HTMLDivElement;
let root: Root;
let stored: StoredCourse;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // JSDOM has no FontFaceSet; Mantine's autosizing textarea listens to it.
  Object.defineProperty(document, "fonts", { configurable: true, value: new EventTarget() });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi
    .fn<(query: string) => MediaQueryList>()
    .mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return true;
      },
    }));
  stored = {
    course: {
      version: 1,
      id: "00000000-0000-4000-8000-000000000001",
      title: "Curso piloto",
      description: "Mate e desenvolvimento",
      createdAt: 0,
      sources: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "fundamentos.pgn",
          topic: "Mate",
          side: "auto",
        },
      ],
      lessons: [
        {
          id: "00000000-0000-4000-8000-000000000003",
          sourceId: "00000000-0000-4000-8000-000000000002",
          sourceGame: 0,
          title: "Lição piloto",
          topic: "Mate",
          introduction: "Procure um xeque.",
          pgn: "1. e4 *",
          trainingSide: "white",
          trainingPositions: 1,
          mainlineMoves: 1,
          variationMoves: 0,
        },
      ],
    },
    progress: { version: 1, courseId: "00000000-0000-4000-8000-000000000001", completed: {} },
  };
  native.list.mockResolvedValue({ courses: [stored], warnings: [] });
  native.create.mockResolvedValue(stored);
  native.open.mockResolvedValue("new-tab");
  native.navigate.mockResolvedValue(undefined);
  native.dialog.mockResolvedValue(["/selected/fundamentos.pgn"]);
  native.progress.mockResolvedValue({
    ...stored.progress,
    completed: { [stored.course.lessons[0].id]: 1 },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderPage() {
  const i18n = createInstance();
  await i18n.init({ lng: "pt-PT", resources: { "pt-PT": pt }, keySeparator: false });
  await act(async () =>
    root.render(
      <Provider>
        <I18nextProvider i18n={i18n}>
          <MantineProvider>
            <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false }}>
              <CoursesPage />
            </SWRConfig>
          </MantineProvider>
        </I18nextProvider>
      </Provider>,
    ),
  );
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(
    (entry) => entry.textContent?.trim() === label,
  );
  if (!found) throw new Error("Button not found: " + label);
  return found;
}

describe("Courses page with the existing Mantine interface", () => {
  it("shows imported lessons and opens the chosen study in the original board", async () => {
    await renderPage();
    expect(container.textContent).toContain("Cursos");
    expect(container.textContent).toContain("Curso piloto");
    expect(container.textContent).toContain("Lição piloto");
    await act(async () => button("Estudar").click());
    expect(native.open).toHaveBeenCalledWith(
      expect.objectContaining({
        course: stored.course,
        lesson: stored.course.lessons[0],
        mode: "study",
        libraryDir: "library",
      }),
    );
    expect(native.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("saves explicit lesson completion and updates visible progress", async () => {
    await renderPage();
    const complete = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Marcar lição como concluída"]',
    );
    expect(complete).not.toBeNull();
    await act(async () => complete!.click());
    expect(native.progress).toHaveBeenCalledWith(
      "library",
      stored.course.id,
      stored.course.lessons[0].id,
      "complete",
    );
    expect(container.textContent).toContain("100%");
    expect(
      container.querySelector('button[aria-label="Marcar como não concluída"]'),
    ).not.toBeNull();
  });

  it("imports a PGN through the native picker and displays the created course", async () => {
    native.list.mockResolvedValue({ courses: [], warnings: [] });
    await renderPage();
    await act(async () => button("Importar PGNs como curso").click());
    expect(document.body.textContent).toContain("Nome do curso");
    await act(async () => button("Adicionar PGNs").click());
    expect(native.dialog).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
    const form = document.querySelector("form")!;
    await act(async () =>
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(native.create).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryDir: "library",
        title: "fundamentos",
        sources: [
          {
            path: "/selected/fundamentos.pgn",
            name: "fundamentos.pgn",
            topic: "fundamentos",
            side: "auto",
          },
        ],
      }),
    );
    expect(container.textContent).toContain("Curso piloto");
  });
});
