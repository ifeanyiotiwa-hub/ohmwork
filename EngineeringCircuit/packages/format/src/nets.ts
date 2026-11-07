import type { Circuit, PinRef } from "./circuit"
import { pinsOf } from "./components"

export type Net = { index: number; pins: PinRef[]; isGround: boolean }

export const pinKey = (ref: PinRef): string => `${ref.componentId}:${ref.pin}`

export function buildNets(circuit: Circuit): Net[] {
  const parent = new Map<string, string>()

  const root = (key: string): string => {
    let current = key
    while (parent.get(current) !== current) current = parent.get(current) ?? current
    parent.set(key, current)
    return current
  }

  const allPins: PinRef[] = circuit.components.flatMap((component) =>
    pinsOf(component.type).map((pin) => ({ componentId: component.id, pin })),
  )
  allPins.forEach((ref) => parent.set(pinKey(ref), pinKey(ref)))
  circuit.wires.forEach((wire) => parent.set(root(pinKey(wire.from)), root(pinKey(wire.to))))

  const groundIds = new Set(circuit.components.filter((c) => c.type === "ground").map((c) => c.id))
  const netsByRoot = new Map<string, Net>()

  for (const ref of allPins) {
    const key = root(pinKey(ref))
    let net = netsByRoot.get(key)
    if (!net) {
      net = { index: netsByRoot.size, pins: [], isGround: false }
      netsByRoot.set(key, net)
    }
    net.pins.push(ref)
    if (groundIds.has(ref.componentId)) net.isGround = true
  }

  return [...netsByRoot.values()]
}
