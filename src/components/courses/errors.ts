import type { TFunction } from "i18next";
import { CourseError } from "./model";

export function courseErrorMessage(error: unknown, t: TFunction): string {
    if (error instanceof CourseError) {
        const context = [
            error.details.file,
            error.details.game ? t("Courses.GameNumber", { number: error.details.game }) : "",
        ]
            .filter(Boolean)
            .join(" · ");
        const message = t("Courses.Error." + error.code, error.details);
        return context ? context + ": " + message : message;
    }
    return error instanceof Error ? error.message : String(error);
}
