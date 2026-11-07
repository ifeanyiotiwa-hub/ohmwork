import { z } from "zod"
import { defineComponent } from "./define"

export const SWITCHES = [defineComponent("switch", { pins: ["a", "b"], params: { closed: z.boolean() } })] as const
