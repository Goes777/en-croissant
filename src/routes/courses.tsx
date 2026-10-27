import { createFileRoute } from "@tanstack/react-router";
import CoursesPage from "@/components/courses/CoursesPage";
import { z } from "zod";
import { courseIdSchema } from "@/components/courses/model";

export const Route = createFileRoute("/courses")({
  component: CoursesPage,
  validateSearch: z.object({ course: courseIdSchema.optional().catch(undefined) }),
  loader: ({ context: { loadDirs } }) => loadDirs(),
});
