import { mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"

const suits = ["hearts", "diamonds", "clubs", "spades"] as const
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const
const suitValidator = v.union(v.literal("hearts"), v.literal("diamonds"), v.literal("clubs"), v.literal("spades"))
const rankValidator = v.union(v.literal("A"), v.literal("2"), v.literal("3"), v.literal("4"), v.literal("5"), v.literal("6"), v.literal("7"), v.literal("8"), v.literal("9"), v.literal("10"), v.literal("J"), v.literal("Q"), v.literal("K"))
const cardValidator = v.object({ id: v.string(), suit: suitValidator, rank: rankValidator })
const publicRoomValidator = v.object({
  code: v.string(), status: v.union(v.literal("waiting"), v.literal("playing"), v.literal("won")),
  players: v.array(v.object({ seat: v.number(), name: v.string(), avatar: v.string(), hand: v.array(cardValidator), handCount: v.number(), isHost: v.boolean() })),
  currentPlayer: v.number(), direction: v.union(v.literal(1), v.literal(-1)), activeSuit: suitValidator,
  winner: v.union(v.number(), v.null()), message: v.string(), deckCount: v.number(), topCard: cardValidator,
  mySeat: v.number(),
  messages: v.array(v.object({
    id: v.string(), token: v.string(), name: v.string(),
    kind: v.union(v.literal("text"), v.literal("reaction")), text: v.string(), createdAt: v.number(),
  })),
})

function cleanProfile(name: string, avatar: string, token: string) {
  const normalizedName = name.trim().replace(/\s+/g, " ")
  if (normalizedName.length < 1 || normalizedName.length > 20) throw new Error("Choose a name between 1 and 20 characters.")
  if (avatar.length > 100_000) throw new Error("That profile picture is too large.")
  if (token.length < 16 || token.length > 128) throw new Error("This player profile could not be verified. Refresh and try again.")
  return { name: normalizedName, avatar, token }
}

function makeDeck() {
  const cards = suits.flatMap((suit) => ranks.map((rank) => ({ id: `${suit}-${rank}`, suit, rank })))
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

function isPlayable(card: { suit: string; rank: string }, room: Doc<"gameRooms">) {
  const top = room.discard[room.discard.length - 1]
  return card.rank === "A" || card.rank === "J" || card.suit === room.activeSuit || card.rank === top.rank
}

function drawFromPile(deck: Doc<"gameRooms">["deck"], discard: Doc<"gameRooms">["discard"]) {
  if (deck.length === 0 && discard.length > 1) {
    const top = discard.pop()!
    const recycled = discard.splice(0)
    for (let i = recycled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[recycled[i], recycled[j]] = [recycled[j], recycled[i]]
    }
    deck.push(...recycled)
    discard.push(top)
  }
  return deck.pop() ?? null
}

async function roomByCode(ctx: QueryCtx | MutationCtx, code: string) {
  return await ctx.db.query("gameRooms").withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase())).unique()
}

function findMember(room: Doc<"gameRooms">, token: string) {
  const seat = room.players.findIndex((player) => player.token === token)
  if (seat < 0) throw new Error("This device is not in that room. Join with the room code first.")
  return seat
}

export const create = mutation({
  args: { name: v.string(), avatar: v.string(), token: v.string() }, returns: v.string(),
  handler: async (ctx, args) => {
    const host = cleanProfile(args.name, args.avatar, args.token)
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    let code = ""
    for (let attempt = 0; attempt < 8; attempt += 1) {
      code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("")
      if (!await roomByCode(ctx, code)) break
      code = ""
    }
    if (!code) throw new Error("Could not make a room just now. Try again.")
    await ctx.db.insert("gameRooms", {
      code, hostToken: host.token, status: "waiting",
      players: [{ token: host.token, name: host.name, avatar: host.avatar, hand: [] }],
      deck: [], discard: [{ id: "spades-2", suit: "spades", rank: "2" }], currentPlayer: 0, direction: 1, activeSuit: "spades", winner: null,
      message: "Waiting for a friend to join", messages: [], createdAt: Date.now(),
    })
    return code
  },
})

export const join = mutation({
  args: { code: v.string(), name: v.string(), avatar: v.string(), token: v.string() }, returns: v.string(),
  handler: async (ctx, args) => {
    const profile = cleanProfile(args.name, args.avatar, args.token)
    const room = await roomByCode(ctx, args.code)
    if (!room) throw new Error("We could not find that room. Check the code and try again.")
    const existingSeat = room.players.findIndex((player) => player.token === profile.token)
    if (existingSeat >= 0) return room.code
    if (room.status !== "waiting") throw new Error("This game has already started.")
    if (room.players.length >= 4) throw new Error("This room is full. Start a new room for up to four players.")
    await ctx.db.patch(room._id, { players: [...room.players, { token: profile.token, name: profile.name, avatar: profile.avatar, hand: [] }] })
    return room.code
  },
})

export const get = query({
  args: { code: v.string(), token: v.string() }, returns: v.union(publicRoomValidator, v.null()),
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code)
    if (!room) return null
    const mySeat = room.players.findIndex((player) => player.token === args.token)
    if (mySeat < 0) return null
    const topCard = room.discard[room.discard.length - 1]
    return {
      code: room.code, status: room.status,
      players: room.players.map((player, seat) => ({ seat, name: player.name, avatar: player.avatar, hand: seat === mySeat ? player.hand : [], handCount: player.hand.length, isHost: player.token === room.hostToken })),
      currentPlayer: room.currentPlayer, direction: room.direction, activeSuit: room.activeSuit,
      winner: room.winner, message: room.message, deckCount: room.deck.length, topCard,
      mySeat, messages: room.messages ?? [],
    }
  },
})

export const updateProfile = mutation({
  args: { code: v.string(), token: v.string(), name: v.string(), avatar: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const profile = cleanProfile(args.name, args.avatar, args.token)
    const room = await roomByCode(ctx, args.code)
    if (!room) return null
    const seat = findMember(room, profile.token)
    if (room.players[seat].name === profile.name && room.players[seat].avatar === profile.avatar) return null
    const players = [...room.players]
    players[seat] = { ...players[seat], name: profile.name, avatar: profile.avatar }
    await ctx.db.patch(room._id, { players })
    return null
  },
})

export const sendMessage = mutation({
  args: {
    code: v.string(), token: v.string(), kind: v.union(v.literal("text"), v.literal("reaction")), text: v.string(),
  }, returns: v.null(),
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code)
    if (!room || room.status !== "playing") throw new Error("Chat is available while a round is in progress.")
    const seat = findMember(room, args.token)
    const text = args.text.trim().replace(/[\u0000-\u001F\u007F]/g, "")
    const reactions = ["😂", "🤣", "❤️", "👏", "GG"] as const
    if (args.kind === "reaction" ? !reactions.includes(text as typeof reactions[number]) : text.length < 1 || text.length > 140) {
      throw new Error(args.kind === "reaction" ? "That reaction is not available." : "Messages must be 1–140 characters.")
    }
    const messages = room.messages ?? []
    const lastMessage = messages[messages.length - 1]
    const now = Date.now()
    if (lastMessage?.token === args.token && now - lastMessage.createdAt < 650) throw new Error("Wait a moment before sending another message.")
    const message = {
      id: `${now}-${Math.random().toString(36).slice(2)}`,
      token: args.token,
      name: room.players[seat].name,
      kind: args.kind,
      text,
      createdAt: now,
    }
    await ctx.db.patch(room._id, { messages: [...messages, message].slice(-36) })
    return null
  },
})

export const start = mutation({
  args: { code: v.string(), token: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code)
    if (!room) throw new Error("This room has expired.")
    findMember(room, args.token)
    if (room.hostToken !== args.token) throw new Error("Only the room host can deal the cards.")
    if (room.players.length < 2) throw new Error("Invite at least one friend before dealing.")
    if (room.status === "playing") throw new Error("This round is already underway.")
    const deck = makeDeck()
    const players = room.players.map((player) => ({ ...player, hand: deck.splice(0, 5) }))
    const starterIndex = deck.findIndex((card) => !["A", "J", "7", "10", "9"].includes(card.rank))
    const starter = deck.splice(starterIndex, 1)[0]
    await ctx.db.patch(room._id, {
      players, deck, discard: [starter], currentPlayer: 0, direction: 1,
      activeSuit: starter.suit, winner: null, status: "playing", message: "Cards are dealt — host goes first",
    })
    return null
  },
})

export const play = mutation({
  args: { code: v.string(), token: v.string(), cardId: v.string(), chosenSuit: v.optional(suitValidator) }, returns: v.null(),
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code)
    if (!room || room.status !== "playing") throw new Error("This round is not active.")
    const seat = findMember(room, args.token)
    if (room.currentPlayer !== seat) throw new Error("Wait until it is your turn.")
    const hand = room.players[seat].hand
    const cardIndex = hand.findIndex((card) => card.id === args.cardId)
    if (cardIndex < 0 || !isPlayable(hand[cardIndex], room)) throw new Error("That card cannot be played here.")
    const played = hand[cardIndex]
    if ((played.rank === "A" || played.rank === "J") && !args.chosenSuit) throw new Error("Choose a suit for that card.")
    const players = room.players.map((player) => ({ ...player, hand: [...player.hand] }))
    players[seat].hand.splice(cardIndex, 1)
    const discard = [...room.discard, played]
    const deck = [...room.deck]
    let currentPlayer = room.currentPlayer
    let direction = room.direction
    let activeSuit = args.chosenSuit ?? played.suit
    let message = `${players[seat].name} played ${played.rank}`
    let status: "playing" | "won" = "playing"
    let winner: number | null = null

    if (players[seat].hand.length === 0) {
      status = "won"
      winner = seat
      message = `${players[seat].name} wins the round!`
    } else if (played.rank === "7" || played.rank === "10") {
      const penalty = played.rank === "7" ? 2 : 3
      const victim = (seat + direction + players.length) % players.length
      let drawn = 0
      for (let i = 0; i < penalty; i += 1) {
        const card = drawFromPile(deck, discard)
        if (!card) break
        players[victim].hand.push(card)
        drawn += 1
      }
      currentPlayer = (victim + direction + players.length) % players.length
      message = `Draw ${drawn} — ${players[victim].name} misses a turn`
    } else if (played.rank === "9") {
      direction = direction === 1 ? -1 : 1
      currentPlayer = players.length === 2 ? seat : (seat + direction + players.length) % players.length
      message = "Reverse — direction changed"
    } else {
      currentPlayer = (seat + direction + players.length) % players.length
      if (played.rank === "A" || played.rank === "J") message = `Choose ${activeSuit}`
    }

    await ctx.db.patch(room._id, { players, deck, discard, currentPlayer, direction, activeSuit, status, winner, message })
    return null
  },
})

export const draw = mutation({
  args: { code: v.string(), token: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code)
    if (!room || room.status !== "playing") throw new Error("This round is not active.")
    const seat = findMember(room, args.token)
    if (room.currentPlayer !== seat) throw new Error("Wait until it is your turn.")
    if (room.players[seat].hand.some((card) => isPlayable(card, room))) throw new Error("You already have a playable card.")
    const deck = [...room.deck]
    const discard = [...room.discard]
    const card = drawFromPile(deck, discard)
    const players = room.players.map((player) => ({ ...player, hand: [...player.hand] }))
    if (card) players[seat].hand.push(card)
    const playable = card ? isPlayable(card, { ...room, discard }) : false
    const currentPlayer = playable ? seat : (seat + room.direction + players.length) % players.length
    const message = !card ? "The draw pile is empty" : playable ? "Playable card drawn — tap it to play" : `${players[seat].name} drew one card`
    await ctx.db.patch(room._id, { deck, discard, players, currentPlayer, message })
    return null
  },
})

export const leave = mutation({
  args: { code: v.string(), token: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code)
    if (!room) return null
    const seat = room.players.findIndex((player) => player.token === args.token)
    if (seat < 0) return null
    const players = room.players.filter((player) => player.token !== args.token)
    if (players.length === 0) await ctx.db.delete(room._id)
    else await ctx.db.patch(room._id, {
      players,
      hostToken: room.hostToken === args.token ? players[0].token : room.hostToken,
      currentPlayer: room.currentPlayer > seat ? room.currentPlayer - 1 : Math.min(room.currentPlayer, players.length - 1),
      winner: room.winner === seat ? null : room.winner !== null && room.winner > seat ? room.winner - 1 : room.winner,
      status: players.length < 2 && room.status === "playing" ? "waiting" : room.status,
      message: `${room.players[seat].name} left the room`,
    })
    return null
  },
})

export const restart = mutation({
  args: { code: v.string(), token: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code)
    if (!room) throw new Error("This room has expired.")
    findMember(room, args.token)
    if (room.hostToken !== args.token) throw new Error("Only the host can start a new round.")
    if (room.status !== "won") throw new Error("Finish the current game before starting again.")
    const deck = makeDeck()
    const players = room.players.map((player) => ({ ...player, hand: deck.splice(0, 5) }))
    const starterIndex = deck.findIndex((card) => !["A", "J", "7", "10", "9"].includes(card.rank))
    const starter = deck.splice(starterIndex, 1)[0]
    await ctx.db.patch(room._id, { players, deck, discard: [starter], currentPlayer: 0, direction: 1, activeSuit: starter.suit, winner: null, status: "playing", message: "New round — host goes first" })
    return null
  },
})
