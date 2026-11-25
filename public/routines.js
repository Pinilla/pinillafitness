export const DEFAULT_SECONDS = 60;
export const HOLD_LIMITS = { min: 5, max: 600, step: 5 };
const FIRST_GET_READY_SECONDS = 10;
const SWITCH_SIDES_SECONDS = 5;
const REST_SECONDS = 30;
const SETS = 2;
const SIDES = ["Left side", "Right side"];

export const ROUTINES = {
  lower: {
    name: "Lower body",
    stretches: [
      {
        id: "butterfly",
        name: "Butterfly",
        sides: false,
        cues: [
          "Sit tall with the soles of your feet together and your heels pulled in.",
          "Let your knees drop toward the floor.",
          "Hinge forward from the hips with a long back.",
        ],
      },
      {
        id: "straddle",
        name: "Straddle",
        sides: false,
        cues: [
          "Sit with your legs as wide as is comfortable, toes pointing up.",
          "Keep your back long and walk your hands forward.",
          "Fold from the hips instead of rounding your back.",
        ],
      },
      {
        id: "pigeon",
        name: "Pigeon glute stretch",
        sides: true,
        cues: [
          "Bring one shin forward across the mat, with the other leg straight behind you.",
          "Square your hips to the front.",
          "Walk your hands forward and lower your chest toward the front shin.",
        ],
      },
      {
        id: "lunge",
        name: "Kneeling lunge",
        sides: true,
        cues: [
          "Kneel on one knee with the other foot flat in front of you.",
          "Tuck your tailbone and squeeze the glute of the back leg.",
          "Shift your hips forward until the front of the back hip stretches.",
        ],
      },
      {
        id: "splits",
        name: "Splits training",
        sides: true,
        cues: [
          "Start in a kneeling lunge with your hands on blocks or the floor.",
          "Slide the front heel forward and the back knee back.",
          "Keep your hips square and stop at a strong stretch that doesn't hurt.",
        ],
      },
    ],
  },
  upper: {
    name: "Upper body",
    stretches: [
      {
        id: "chin-tucks",
        name: "Chin tucks",
        sides: false,
        cues: [
          "Sit or stand tall with your eyes level.",
          "Glide your chin straight back, making a double chin.",
          "Hold for 3 seconds, release, and repeat slowly until the timer ends.",
        ],
      },
      {
        id: "doorway",
        name: "Doorway chest stretch",
        sides: false,
        cues: [
          "Put your forearms on a door frame with your elbows at shoulder height.",
          "Step one foot through the doorway.",
          "Lean forward until your chest stretches. Keep your ribs down.",
        ],
      },
      {
        id: "pull-aparts",
        name: "Band pull-aparts",
        sides: false,
        cues: [
          "Hold a band in front of you at shoulder height with straight arms.",
          "Pull it apart by squeezing your shoulder blades together.",
          "Return slowly, with your shoulders down away from your ears. Repeat until the timer ends.",
        ],
      },
      {
        id: "face-pulls",
        name: "Band face pulls",
        sides: false,
        cues: [
          "Anchor a band at head height and hold one end in each hand.",
          "Pull toward your face with your elbows high and wide.",
          "Finish with your hands beside your ears, return slowly, and repeat until the timer ends.",
        ],
      },
      {
        id: "wall-angels",
        name: "Wall angels",
        sides: false,
        cues: [
          "Stand with your head, upper back and hips against a wall.",
          "Raise your arms into a goalpost shape with the backs of your hands on the wall.",
          "Slide your arms up and down slowly while keeping them on the wall.",
        ],
      },
    ],
  },
};

export function buildSteps(routineId, times) {
  return ROUTINES[routineId].stretches.flatMap((stretch) =>
    stepsFor(stretch, holdSeconds(stretch, times)),
  );
}

export function routineSeconds(routineId, times) {
  return buildSteps(routineId, times).reduce((sum, step) => sum + step.getReady + step.hold, 0);
}

export function isAllowedHold(seconds) {
  return (
    Number.isInteger(seconds) &&
    seconds >= HOLD_LIMITS.min &&
    seconds <= HOLD_LIMITS.max &&
    seconds % HOLD_LIMITS.step === 0
  );
}

export function stretchIds() {
  return Object.values(ROUTINES).flatMap((routine) =>
    routine.stretches.map((stretch) => stretch.id),
  );
}

function stepsFor(stretch, hold) {
  return setNumbers().flatMap((set) => setSteps(stretch, set, hold));
}

function setNumbers() {
  return Array.from({ length: SETS }, (_, index) => index + 1);
}

function setSteps(stretch, set, hold) {
  const sides = stretch.sides ? SIDES : [null];
  return sides.map((side, sideIndex) => ({
    id: stretch.id,
    name: stretch.name,
    cues: stretch.cues,
    side,
    set,
    sets: SETS,
    rest: set > 1 && sideIndex === 0,
    getReady: getReadySeconds(set, sideIndex),
    hold,
  }));
}

function getReadySeconds(set, sideIndex) {
  if (sideIndex > 0) {
    return SWITCH_SIDES_SECONDS;
  }
  return set === 1 ? FIRST_GET_READY_SECONDS : REST_SECONDS;
}

function holdSeconds(stretch, times) {
  return times?.[stretch.id] ?? DEFAULT_SECONDS;
}
