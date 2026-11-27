export const SETS = 3;
export const TOP_REPS = 7;
export const REPS_LIMITS = { min: 0, max: 99, step: 1 };
export const WEIGHT_LIMITS = { min: 0, max: 2000, step: 0.25 };

export const LIFTS = [
  { id: "overhead-press", name: "Overhead press", step: 5 },
  { id: "pull-ups", name: "Pull-ups", step: 5, bodyweight: true },
  { id: "bench-press", name: "Bench press", step: 5 },
  { id: "standing-rows", name: "Standing rows", step: 5 },
  { id: "split-squats", name: "Bulgarian split squats", step: 5, eachLeg: true },
  { id: "hip-thrusts", name: "Hip thrusts", step: 5 },
];

export function findLift(id) {
  return LIFTS.find((lift) => lift.id === id) ?? null;
}

export function isAllowedWeight(weight) {
  return (
    typeof weight === "number" &&
    weight >= WEIGHT_LIMITS.min &&
    weight <= WEIGHT_LIMITS.max &&
    Number.isInteger(weight / WEIGHT_LIMITS.step)
  );
}

export function isAllowedReps(reps) {
  return Number.isInteger(reps) && reps >= REPS_LIMITS.min && reps <= REPS_LIMITS.max;
}

export function formatWeight(lift, weight) {
  if (!lift.bodyweight) {
    return `${weight} lb`;
  }
  return weight > 0 ? `Bodyweight + ${weight} lb` : "Bodyweight";
}

export function formatSets(lift, log) {
  const reps = log.reps.filter((count) => count !== null).join(", ");
  return `${formatWeight(lift, log.weight)} × ${reps}`;
}
