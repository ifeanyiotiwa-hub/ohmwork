# The simulation engine

Code: `OhmWork/packages/engine/src`. It knows nothing about the screen: the web app and the AI agent are two clients
of the same engine (ARCHITECTURE rule 1).

## 1. A circuit becomes a set of equations
**Idea.** Every point where wires meet is a *node* with an unknown voltage. Kirchhoff's current law says the currents
into a node add up to zero. Write that for every node and you get one equation per node: a matrix equation
`A · x = b`. Solve it and you have every voltage. This method is called *modified nodal analysis* (MNA), and it's what
SPICE, the industry-standard simulator, uses.

The "modified" part: a voltage source fixes a voltage instead of a current, so it can't be written as a current. MNA
adds one extra unknown (the source's current) and one extra equation (`V(+) − V(−) = 5 V`) per voltage source.

**Read:** `dc/mna.ts`.
- Rows 0…n are nodes (ground is left out: it's the 0 V reference); after them, one row per voltage source.
- Each part *stamps* its contribution. A resistor adds its conductance `1/R` to the four cells linking its two nodes.
  A current source only touches `b`. A voltage source fills its own row and column (`voltageRow`).
- `solveLinear` factors the matrix (LU decomposition with partial pivoting) and solves it.
- Then every part's current is worked out from the voltages.

**Before MNA runs**, `dc/branches.ts` turns each part into simple *branches*: resistor, voltage, current, or device.
A closed switch is a 0 V source; an inductor at DC is a wire; a capacitor at DC is nothing (an open gap). The table
`DC_MODELS` must list every part type, so a new part won't compile until someone decides how to model it.

**Before solving**, `dc/topology.ts` catches circuits the maths can't solve (a wire shorting a battery, a current
source with nowhere to go, a part floating with no ground) and turns them into plain-language messages. The engine
never shows "singular matrix" (ARCHITECTURE rule 8).

## 2. Diodes and transistors: solve, adjust, solve again
**Idea.** A resistor is linear: double the voltage, double the current. A diode isn't: its current grows
exponentially with voltage (the Shockley equation, `I = IS · (e^(V / n·Vt) − 1)`). MNA can only solve linear
equations, so we use *Newton–Raphson*:
1. Guess the voltages.
2. At the guess, replace each diode with the straight line that touches its curve there: a conductance plus a current
   source (a *linearization*).
3. Solve the now-linear circuit with MNA.
4. Use the result as the next guess. Stop when voltages move less than 1 µV + 0.1% (SPICE's tolerances).

**Read:**
- `dc/solve-dc.ts`, `solveIterating`: the loop. With no devices it's one linear solve. Otherwise up to 200
  iterations; if it never settles, the learner gets a message that points at the diodes or transistors.
- `nonlinear/diode.ts`, `linearize`: returns the conductance matrix and offset for the current guess.
- `nonlinear/junction.ts`, `limitJunction`: the exponential is so steep that a big jump in voltage gives an absurd
  current and the loop blows up. Limiting each step (SPICE's `pnjlim`) keeps it stable.

## 3. Simulating time
**Idea.** A capacitor's current depends on how fast its voltage changes (`i = C · dv/dt`). Cut time into small steps
and, over one step, a capacitor behaves like a resistor in parallel with a current source set by the previous step.
This is a *companion model*. Each step is then an ordinary DC solve.

**Read:** `dc/branches.ts`, `companion` and `capacitorModel`.
- Default rule: *trapezoidal* (conductance `2C/Δt`), accurate to second order.
- The first step after power arrives, or after a switch flips, uses *backward Euler* (`C/Δt`). The capacitor's
  starting current is unknown, and trapezoidal would carry that error forward as ringing. Measured: error at τ/100
  fell from 0.29% to 0.0024% (ADR-015).
- `transient/adaptive.ts`: the step size adapts. It takes one step and two half-steps and compares them; when they
  disagree, it shrinks the step (ADR-032). Square-wave edges are *breakpoints* it lands on exactly.

## 4. Digital logic in the same circuit
Logic gates are modelled as ideal voltage sources whose outputs change *between* solves, never within one: one time
step of delay per gate (ADR-018, `digital/`). That lets a counter drive an LED through a transistor in one simulation.

## 5. Frequency response
`ac/solve-ac.ts`: the same MNA with complex numbers. A capacitor becomes an impedance `1/(jωC)`. Solve at each
frequency and the result gives gain and phase: the oscilloscope's Frequency view.

## 6. How we know it's right
**Golden circuits:** circuits with known answers, run on every change (ARCHITECTURE rule 4).
- `test/golden/textbook.test.ts`: answers you can work out by hand.
- `test/golden/ngspice/*.cir`: the same circuits as ngspice netlists. `semiconductors.test.ts` checks the engine
  against ngspice's output within 1%. Example: a red LED with 220 Ω from 5 V; ngspice says 1.820098 V and
  14.4541 mA.

Where some of the maths came from: the stamps and junction limiting follow CircuitJS1, credited in each file, which
is why the project is GPL.

## Test yourself
<details><summary>Why does MNA add an extra unknown for every voltage source?</summary>
Nodal analysis writes current equations, but a voltage source's current is set by the rest of the circuit, not by
its voltage. So its current becomes an unknown, and the source adds the equation V(+) − V(−) = its voltage.
</details>

<details><summary>Why can't a diode circuit be solved in one pass?</summary>
Its current is an exponential of its voltage, so the equations aren't linear. Newton–Raphson replaces the curve with
its tangent at a guess, solves, and repeats until the guess stops moving.
</details>

<details><summary>What does voltage limiting protect against?</summary>
An overshoot: the exponential turns a jump of a volt into an astronomically large current, the next guess is worse,
and the loop diverges. Limiting moves to where the curve would give the predicted current.
</details>

<details><summary>What is a companion model, and why use backward Euler on the first step?</summary>
Over one time step a capacitor acts like a conductance with a current source from the last step, so each step is a
DC solve. At the first step its starting current is unknown; trapezoidal would keep that error as ringing, while
backward Euler damps it.
</details>

<details><summary>A user reports a wrong reading. How would you check whether the engine is wrong?</summary>
Write the same circuit as an ngspice netlist, compare, and if they differ add it as a golden test that fails before
fixing the model.
</details>

<details><summary>Why does the engine have no DOM or Angular code?</summary>
So the web app, the MCP server, the tests and a future server all run the same maths, and the engine can be tested on
its own.
</details>
