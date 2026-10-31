import { createContext, useContext } from "react";
import { trainingDb, type TrainingDatabase } from "@/infrastructure/db/TrainingDatabase";

export const TrainingDbContext = createContext<TrainingDatabase>(trainingDb);
export const useTrainingDb = () => useContext(TrainingDbContext);
