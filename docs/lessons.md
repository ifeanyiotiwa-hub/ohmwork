# Lessons and the tutor

## Take a lesson
**Lessons** → pick one → **Start** → build the circuit → **Check my circuit**. The check runs the simulation and
tells you which goals pass and which don't.

| Lesson | Level |
|---|---|
| Light an LED safely | beginner |
| Make 2.5 V from 5 V | beginner |
| Charge a capacitor in one millisecond | beginner |
| Switch an LED with a transistor | intermediate |
| Halve a clock with a flip-flop | intermediate |
| Build a half adder | intermediate |
| Amplify a signal ten times | intermediate |
| Make a 555 blink an LED | advanced |
| Challenge: blink once a second | advanced |
| Challenge: let 100 Hz through, stop 10 kHz | advanced |

## Learn with the AI tutor
With an agent connected (see [Working with an AI agent](ai-agent.md)), ask "tutor me through light-an-led", or use
the agent's **tutor** prompt. It starts the lesson, lets you build in the app over the live link, gives one hint at a
time, and checks your circuit when you're ready.

## Teaching with OhmWork
- Nothing to set up: students open the web address, with no accounts. Once installed it works offline.
- Hand out a starting circuit as a `.circuit.json` file and collect the students' files back.
- Each lesson's checks test behaviour (the LED lights and its current is safe; the filter is 3 dB down at 1 kHz), so
  any correct design passes.
- An agent can draft a new lesson for you. How lessons are written and checked:
  [`projectKnowledge/LESSONS.md`](../projectKnowledge/LESSONS.md).
