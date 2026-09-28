export const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const
export type Suit = (typeof SUITS)[number]
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"

export type PlayingCard = { id: string; suit: Suit; rank: Rank }
export type Player = { id: number; name: string; hand: PlayingCard[]; human: boolean }
export type GameState = {
  players: Player[]
  deck: PlayingCard[]
  discard: PlayingCard[]
  currentPlayer: number
  direction: 1 | -1
  activeSuit: Suit
  status: "playing" | "won"
  winner: number | null
  message: string
  drawNotice: number | null
}

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]

export function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function createGame(playerCount: 2 | 3 | 4): GameState {
  const deck = shuffle(SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: `${suit}-${rank}`, suit, rank }))))
  const players: Player[] = Array.from({ length: playerCount }, (_, id) => ({
    id,
    name: id === 0 ? "You" : ["Milo", "Nova", "Rex"][id - 1],
    hand: [],
    human: id === 0,
  }))

  players.forEach((player) => {
    player.hand = deck.splice(0, 5)
  })
  const starter = deck.pop()!
  return {
    players,
    deck,
    discard: [starter],
    currentPlayer: 0,
    direction: 1,
    activeSuit: starter.suit,
    status: "playing",
    winner: null,
    message: "Your turn — play a matching card",
    drawNotice: null,
  }
}

export function topCard(game: GameState): PlayingCard {
  return game.discard[game.discard.length - 1]
}

export function isPlayable(card: PlayingCard, game: GameState): boolean {
  return card.rank === "A" || card.rank === "J" || card.suit === game.activeSuit || card.rank === topCard(game).rank
}

export function nextPlayerIndex(game: GameState, from = game.currentPlayer): number {
  return (from + game.direction + game.players.length) % game.players.length
}

function replenish(deck: PlayingCard[], discard: PlayingCard[]): void {
  if (deck.length > 0 || discard.length <= 1) return
  const top = discard.pop()!
  deck.push(...shuffle(discard.splice(0)))
  discard.push(top)
}

export function drawOne(game: GameState): { game: GameState; card: PlayingCard | null } {
  const next = structuredClone(game) as GameState
  replenish(next.deck, next.discard)
  const card = next.deck.pop() ?? null
  if (card) next.players[next.currentPlayer].hand.push(card)
  return { game: next, card }
}

function drawPenalty(game: GameState, playerIndex: number, count: number): void {
  for (let i = 0; i < count; i += 1) {
    replenish(game.deck, game.discard)
    const card = game.deck.pop()
    if (card) game.players[playerIndex].hand.push(card)
  }
}

export type PlayResult = { game: GameState; needsSuit: boolean }

export function playCard(game: GameState, playerIndex: number, cardId: string): PlayResult | null {
  if (game.status !== "playing" || game.currentPlayer !== playerIndex) return null
  const player = game.players[playerIndex]
  const handIndex = player.hand.findIndex((card) => card.id === cardId)
  if (handIndex < 0 || !isPlayable(player.hand[handIndex], game)) return null

  const next = structuredClone(game) as GameState
  const [card] = next.players[playerIndex].hand.splice(handIndex, 1)
  next.discard.push(card)
  next.drawNotice = null

  if (next.players[playerIndex].hand.length === 0) {
    next.status = "won"
    next.winner = playerIndex
    next.message = playerIndex === 0 ? "You won the round!" : `${next.players[playerIndex].name} wins the round!`
    return { game: next, needsSuit: false }
  }

  if (card.rank === "A" || card.rank === "J") {
    next.message = "Choose a suit"
    return { game: next, needsSuit: true }
  }

  if (card.rank === "7" || card.rank === "10") {
    const penalty = card.rank === "7" ? 2 : 3
    const victim = nextPlayerIndex(next, playerIndex)
    drawPenalty(next, victim, penalty)
    next.drawNotice = penalty
    next.message = `Draw ${penalty} — ${next.players[victim].name} loses their turn`
    next.currentPlayer = nextPlayerIndex(next, victim)
    return { game: next, needsSuit: false }
  }

  if (card.rank === "9") {
    next.direction = next.direction === 1 ? -1 : 1
    next.message = "Reverse — direction changed"
  } else {
    next.message = `${next.players[nextPlayerIndex(next, playerIndex)].name}'s turn`
  }

  next.currentPlayer = nextPlayerIndex(next, playerIndex)
  return { game: next, needsSuit: false }
}

export function chooseSuit(game: GameState, suit: Suit): GameState {
  const next = structuredClone(game) as GameState
  next.activeSuit = suit
  next.currentPlayer = nextPlayerIndex(next)
  next.message = `${suit[0].toUpperCase()}${suit.slice(1)} — ${next.players[next.currentPlayer].name}'s turn`
  return next
}

export function aiChooseSuit(hand: PlayingCard[]): Suit {
  const counts = SUITS.map((suit) => ({
    suit,
    count: hand.filter((card) => card.suit === suit).length,
  }))
  return counts.sort((a, b) => b.count - a.count)[0].suit
}

export function aiChooseCard(hand: PlayingCard[], game: GameState): PlayingCard | undefined {
  const playable = hand.filter((card) => isPlayable(card, game))
  if (playable.length === 0) return undefined
  return playable.sort((a, b) => {
    const score = (card: PlayingCard) => {
      let value = card.rank === "7" || card.rank === "10" || card.rank === "9" ? 4 : 0
      if (card.rank === "A" || card.rank === "J") value -= 2
      value += hand.filter((candidate) => candidate.suit === card.suit).length * 0.4
      return value
    }
    return score(b) - score(a)
  })[0]
}

export function scoreHand(hand: PlayingCard[]): number {
  return hand.reduce((total, card) => total + (card.rank === "A" || card.rank === "J" ? 20 : ["7", "9", "10"].includes(card.rank) ? 15 : Number(card.rank) || 10), 0)
}

export const SUIT_SYMBOL: Record<Suit, string> = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" }
export const SUIT_LABEL: Record<Suit, string> = { hearts: "Hearts", diamonds: "Diamonds", clubs: "Clubs", spades: "Spades" }
export const SUIT_COLOR: Record<Suit, string> = { hearts: "red", diamonds: "red", clubs: "black", spades: "black" }

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
