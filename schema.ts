import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

const suit = v.union(v.literal("hearts"), v.literal("diamonds"), v.literal("clubs"), v.literal("spades"))
const rank = v.union(v.literal("A"), v.literal("2"), v.literal("3"), v.literal("4"), v.literal("5"), v.literal("6"), v.literal("7"), v.literal("8"), v.literal("9"), v.literal("10"), v.literal("J"), v.literal("Q"), v.literal("K"))
const card = v.object({ id: v.string(), suit, rank })

export default defineSchema({
  gameRooms: defineTable({
    code: v.string(),
    hostToken: v.string(),
    status: v.union(v.literal("waiting"), v.literal("playing"), v.literal("won")),
    players: v.array(v.object({
      token: v.string(),
      name: v.string(),
      avatar: v.string(),
      hand: v.array(card),
    })),
    deck: v.array(card),
    discard: v.array(card),
    currentPlayer: v.number(),
    direction: v.union(v.literal(1), v.literal(-1)),
    activeSuit: suit,
    winner: v.union(v.number(), v.null()),
    message: v.string(),
    messages: v.optional(v.array(v.object({
      id: v.string(),
      token: v.string(),
      name: v.string(),
      kind: v.union(v.literal("text"), v.literal("reaction")),
      text: v.string(),
      createdAt: v.number(),
    }))),
    createdAt: v.number(),
  }).index("by_code", ["code"]),
})
