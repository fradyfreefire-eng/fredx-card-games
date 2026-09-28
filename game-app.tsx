'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowLeftRight, ArrowRight, AudioLines, CircleHelp, Crown, Music2, RotateCcw, Settings2, Shield, Spade, UserRound, UsersRound, Volume2, VolumeX, X } from 'lucide-react'
import FriendHub from './friend-hub'
import ProfilePage from './profile-page'

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
type Card = { id: string; suit: Suit; rank: Rank }
type Player = { id: number; name: string; isHuman: boolean; hand: Card[]; avatar: string }
type Game = { players: Player[]; deck: Card[]; discard: Card[]; currentSuit: Suit; currentPlayer: number; direction: 1 | -1; status: 'playing' | 'won'; winner: number | null; message: string; penalty: number; turn: number }
type Settings = { sound: boolean; music: boolean; vibration: boolean }

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const SUIT_GLYPHS: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }
const SUIT_NAMES: Record<Suit, string> = { hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades' }
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const STORAGE_KEY = 'green-felt-settings-v1'
const STATS_KEY = 'green-felt-stats-v1'
const PROFILE_KEY = 'green-felt-profile-v1'
type Profile = { name: string; avatar: string; token: string }
const DEFAULT_SETTINGS: Settings = { sound: true, music: false, vibration: true }

function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: `${suit}-${rank}`, suit, rank })))
}
function shuffle<T,>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
// Aces and Jacks are wild; all other cards match the active suit or top rank.
function playable(card: Card, game: Game): boolean {
  const top = game.discard[game.discard.length - 1]
  return card.suit === game.currentSuit || card.rank === top.rank || card.rank === 'A' || card.rank === 'J'
}
function createGame(count: number, playerName = 'You', playerAvatar = ''): Game {
  const deck = shuffle(createDeck())
  const players: Player[] = Array.from({ length: count }, (_, index) => ({
    id: index,
    name: index === 0 ? playerName : ['Milo', 'Nova', 'Rex'][index - 1],
    isHuman: index === 0,
    hand: deck.splice(0, 5),
    avatar: index === 0 ? playerAvatar || playerName.trim().slice(0, 1).toUpperCase() || 'Y' : ['M', 'N', 'R'][index - 1],
  }))
  const firstIndex = deck.findIndex((card) => card.rank !== 'A' && card.rank !== 'J' && card.rank !== '7' && card.rank !== '10' && card.rank !== '9')
  const first = deck.splice(firstIndex, 1)[0]
  return { players, deck, discard: [first], currentSuit: first.suit, currentPlayer: 0, direction: 1, status: 'playing', winner: null, message: 'Your turn — play a matching card', penalty: 0, turn: 0 }
}

function CardFace({ card, back = false, playable: canPlay = false, onClick, small = false }: { card?: Card; back?: boolean; playable?: boolean; onClick?: () => void; small?: boolean }) {
  if (back) return <div className={`playing-card card-back${small ? ' card-small' : ''}`} aria-label="Face-down card"><div className="card-back-mark"><span>GF</span><i /></div></div>
  if (!card) return null
  const red = card.suit === 'hearts' || card.suit === 'diamonds'
  const className = `playing-card${red ? ' red-card' : ''}${canPlay ? ' card-playable' : ''}${small ? ' card-small' : ''}`
  return <button type="button" onClick={onClick} disabled={!onClick} className={className} aria-label={`${card.rank} of ${SUIT_NAMES[card.suit]}${canPlay ? ', playable' : ''}`}>
    <span className="corner corner-top"><b>{card.rank}</b><i>{SUIT_GLYPHS[card.suit]}</i></span>
    <span className="card-center-suit">{SUIT_GLYPHS[card.suit]}</span>
    <span className="corner corner-bottom"><b>{card.rank}</b><i>{SUIT_GLYPHS[card.suit]}</i></span>
  </button>
}

function SoundToggle({ enabled, onClick, label }: { enabled: boolean; onClick: () => void; label: string }) {
  return <button className={`sound-toggle ${enabled ? 'is-on' : ''}`} onClick={onClick} aria-label={`${label} ${enabled ? 'on' : 'off'}`} title={`${label} ${enabled ? 'on' : 'off'}`}>
    {enabled ? (label === 'Sound' ? <Volume2 size={17} /> : <Music2 size={17} />) : (label === 'Sound' ? <VolumeX size={17} /> : <Music2 size={17} />)}
  </button>
}

export default function GameApp() {
  const [screen, setScreen] = useState<'menu' | 'game' | 'friends' | 'profile'>('menu')
  const [modal, setModal] = useState<'players' | 'settings' | 'rules' | 'suit' | 'winner' | 'exit' | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [stats, setStats] = useState({ wins: 0, games: 0 })
  const [profile, setProfile] = useState<Profile>({ name: 'Player', avatar: '', token: '' })
  const [busy, setBusy] = useState(false)
  const [pendingCard, setPendingCard] = useState<Card | null>(null)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionLock = useRef(false)
  const musicTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const winnerRecorded = useRef(false)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    void navigator.serviceWorker.register('/sw.js').then(async (registration) => {
      await navigator.serviceWorker.ready
      const assets = Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"][href]'))
        .map((element) => element instanceof HTMLScriptElement ? element.src : element.href)
        .filter((url) => new URL(url).origin === window.location.origin)
      registration.active?.postMessage({ type: 'CACHE_ASSETS', assets })
    }).catch(() => { /* Offline caching is an enhancement; the game itself needs no network. */ })
  }, [])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) })
      const savedStats = window.localStorage.getItem(STATS_KEY)
      if (savedStats) setStats({ wins: 0, games: 0, ...JSON.parse(savedStats) })
      const savedProfile = window.localStorage.getItem(PROFILE_KEY)
      const parsedProfile = savedProfile ? JSON.parse(savedProfile) : {}
      const token = typeof parsedProfile.token === 'string' && parsedProfile.token.length >= 16 ? parsedProfile.token : window.crypto.randomUUID()
      const nextProfile = { name: typeof parsedProfile.name === 'string' && parsedProfile.name.trim() ? parsedProfile.name.slice(0, 20) : 'Player', avatar: typeof parsedProfile.avatar === 'string' ? parsedProfile.avatar : '', token }
      setProfile(nextProfile)
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile))
    } catch { /* Ignore unavailable or invalid local settings. */ }
  }, [])

  const playTone = useCallback((frequency = 520, duration = 0.075, type: OscillatorType = 'sine') => {
    if (!settings.sound) return
    try {
      const context = audioContext.current ?? new AudioContext()
      audioContext.current = context
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = type
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.045, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + duration)
    } catch { /* Audio is an optional enhancement. */ }
  }, [settings.sound])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 1900)
  }, [])

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    if (musicTimer.current) clearInterval(musicTimer.current)
    void audioContext.current?.close()
  }, [])

  useEffect(() => {
    if (!settings.music) {
      if (musicTimer.current) clearInterval(musicTimer.current)
      musicTimer.current = null
      return
    }
    let note = 0
    const notes = [196, 246.94, 293.66, 246.94]
    musicTimer.current = setInterval(() => {
      try {
        const context = audioContext.current ?? new AudioContext()
        audioContext.current = context
        const osc = context.createOscillator()
        const gain = context.createGain()
        osc.type = 'sine'
        osc.frequency.value = notes[note++ % notes.length]
        gain.gain.value = 0.008
        osc.connect(gain)
        gain.connect(context.destination)
        osc.start()
        osc.stop(context.currentTime + 1.2)
      } catch { /* Audio is optional on unsupported devices. */ }
    }, 1600)
    return () => { if (musicTimer.current) clearInterval(musicTimer.current); musicTimer.current = null }
  }, [settings.music])

  const updateSettings = (key: keyof Settings) => {
    setSettings((current) => {
      const next = { ...current, [key]: !current[key] }
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* Settings remain usable for this session. */ }
      return next
    })
    if (key === 'vibration' && !settings.vibration) navigator.vibrate?.(12)
  }

  const saveProfile = (name: string, avatar: string) => {
    setProfile((current) => {
      const next = { ...current, name, avatar }
      try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next)) } catch { /* The profile remains available for this session. */ }
      return next
    })
  }

  const startGame = (count: number) => {
    winnerRecorded.current = false
    actionLock.current = false
    setBusy(false)
    setGame(createGame(count, profile.name, profile.avatar))
    setScreen('game')
    setModal(null)
    setNotice('Cards are dealt — you go first')
    playTone(640, 0.11)
  }

  // Recycle every discard except the live top card before drawing from an empty deck.
  const drawOne = (current: Game): Game => {
    let next = { ...current, players: current.players.map((player) => ({ ...player, hand: [...player.hand] })), deck: [...current.deck], discard: [...current.discard] }
    if (next.deck.length === 0 && next.discard.length > 1) {
      const top = next.discard[next.discard.length - 1]
      next.deck = shuffle(next.discard.slice(0, -1))
      next.discard = [top]
    }
    if (!next.deck.length) return next
    const card = next.deck.pop()!
    next.players[next.currentPlayer].hand.push(card)
    return next
  }

  const advance = (current: Game, steps = 1): Game => ({ ...current, currentPlayer: (current.currentPlayer + current.direction * steps + current.players.length * 2) % current.players.length, turn: current.turn + 1 })

  const finishIfWon = (current: Game, playerIndex: number): Game => {
    if (current.players[playerIndex].hand.length !== 0) return current
    const result = { ...current, status: 'won' as const, winner: playerIndex, message: `${current.players[playerIndex].name} wins the round!` }
    if (!winnerRecorded.current) {
      winnerRecorded.current = true
      setStats((old) => {
        const next = { wins: old.wins + (playerIndex === 0 ? 1 : 0), games: old.games + 1 }
        try { window.localStorage.setItem(STATS_KEY, JSON.stringify(next)) } catch { /* Stats are a convenience, not required for play. */ }
        return next
      })
      setModal('winner')
      playTone(784, 0.32)
    }
    return result
  }

  const performPlay = (current: Game, cardId: string, chosenSuit?: Suit): Game => {
    const playerIndex = current.currentPlayer
    const player = current.players[playerIndex]
    const cardIndex = player.hand.findIndex((card) => card.id === cardId)
    if (cardIndex < 0 || !playable(player.hand[cardIndex], current) || current.status !== 'playing') return current
    const card = player.hand[cardIndex]
    const players = current.players.map((entry) => ({ ...entry, hand: [...entry.hand] }))
    players[playerIndex].hand.splice(cardIndex, 1)
    let next: Game = { ...current, players, deck: [...current.deck], discard: [...current.discard, card], currentSuit: chosenSuit ?? card.suit, penalty: 0 }
    if (card.rank === '9') {
      next.direction = current.direction === 1 ? -1 : 1
      next = advance(next, current.players.length === 2 ? 0 : 1)
      next.message = 'Reverse — direction changed'
    } else if (card.rank === '7' || card.rank === '10') {
      next.penalty = card.rank === '7' ? 2 : 3
      next = advance(next, 1)
      next.message = `Draw ${next.penalty} — ${next.players[next.currentPlayer].name} misses a turn`
    } else {
      next = advance(next, 1)
      next.message = card.rank === 'A' || card.rank === 'J' ? `Suit changed to ${SUIT_NAMES[next.currentSuit]}` : `${player.name} played ${card.rank}`
    }
    playTone(card.rank === '7' || card.rank === '10' ? 350 : card.rank === '9' || card.rank === 'A' || card.rank === 'J' ? 650 : 520, 0.09, 'triangle')
    if (settings.vibration) navigator.vibrate?.(card.rank === '7' || card.rank === '10' ? [12, 25, 12] : 10)
    next = finishIfWon(next, playerIndex)
    return next
  }

  const playHumanCard = (card: Card) => {
    if (!game || busy || actionLock.current || game.status !== 'playing' || game.currentPlayer !== 0 || game.penalty > 0) return
    if (!playable(card, game)) { showNotice('That card does not match'); return }
    if (card.rank === 'A' || card.rank === 'J') {
      setPendingCard(card)
      setModal('suit')
      playTone(580, 0.08)
      return
    }
    actionLock.current = true
    setBusy(true)
    setGame((current) => current ? performPlay(current, card.id) : current)
    setTimeout(() => { actionLock.current = false; setBusy(false) }, 220)
  }

  const chooseSuit = (suit: Suit) => {
    if (!game || !pendingCard || actionLock.current || busy) return
    actionLock.current = true
    setBusy(true)
    setGame((current) => current ? performPlay(current, pendingCard.id, suit) : current)
    setPendingCard(null)
    setModal(null)
    setTimeout(() => { actionLock.current = false; setBusy(false) }, 250)
  }

  const drawForHuman = async () => {
    if (!game || busy || actionLock.current || game.status !== 'playing' || game.currentPlayer !== 0) return
    if (game.penalty === 0 && game.players[0].hand.some((card) => playable(card, game))) return
    if (game.penalty > 0) {
      actionLock.current = true
      setBusy(true)
      let current = game
      const count = Math.min(current.penalty, current.deck.length + Math.max(0, current.discard.length - 1))
      for (let i = 0; i < count; i++) {
        current = drawOne(current)
        setGame(current)
        playTone(420, 0.05)
        await new Promise((resolve) => setTimeout(resolve, 130))
      }
      current = { ...current, penalty: 0, message: 'Penalty drawn — your turn is skipped' }
      current = advance(current, 1)
      setGame(current)
      actionLock.current = false
      setBusy(false)
      return
    }
    actionLock.current = true
    setBusy(true)
    const handSize = game.players[0].hand.length
    let current = drawOne(game)
    const newest = current.players[0].hand[current.players[0].hand.length - 1]
    const drewCard = current.players[0].hand.length > handSize
    const foundPlayable = Boolean(drewCard && newest && playable(newest, current))
    current.message = foundPlayable ? 'Playable card drawn — tap it to play' : drewCard ? 'One card drawn — your turn is over' : 'No cards left to draw — turn passed'
    if (!foundPlayable) current = advance(current)
    setGame(current)
    playTone(420, 0.05)
    showNotice(foundPlayable ? 'One card drawn — you can play it' : drewCard ? 'One card drawn — next player' : 'No cards left — next player')
    actionLock.current = false
    setBusy(false)
  }

  useEffect(() => {
    if (!game || game.status !== 'playing' || game.currentPlayer === 0 || modal === 'suit') return
    let cancelled = false
    const timeout = setTimeout(async () => {
      if (cancelled) return
      actionLock.current = true
      setBusy(true)
      let current = game
      if (current.penalty > 0) {
        const amount = current.penalty
        for (let i = 0; i < amount; i++) {
          current = drawOne(current)
          setGame(current)
          playTone(420, 0.05)
          await new Promise((resolve) => setTimeout(resolve, 160))
          if (cancelled) return
        }
        current = advance({ ...current, penalty: 0, message: `${current.players[current.currentPlayer].name} draws ${amount} and misses a turn` })
        setGame(current)
      } else {
        const player = current.players[current.currentPlayer]
        let choices = player.hand.filter((card) => playable(card, current))
        if (!choices.length) {
          const handSize = player.hand.length
          current = drawOne(current)
          setGame(current)
          playTone(420, 0.045)
          await new Promise((resolve) => setTimeout(resolve, 145))
          if (cancelled) return
          const drewCard = current.players[current.currentPlayer].hand.length > handSize
          choices = drewCard ? [current.players[current.currentPlayer].hand[current.players[current.currentPlayer].hand.length - 1]].filter((card) => playable(card, current)) : []
          if (!choices.length) {
            current = advance({ ...current, message: drewCard ? `${player.name} drew one card — turn passed` : `${player.name} has no playable card` })
            setGame(current)
          }
        }
        if (choices.length) {
          choices.sort((a, b) => {
            const value = (card: Card) => (card.rank === '7' || card.rank === '10' ? 4 : card.rank === '9' ? 3 : card.rank === 'A' || card.rank === 'J' ? 2 : 0)
            return value(b) - value(a)
          })
          const selected = choices[0]
          const suitChoice = selected.rank === 'A' || selected.rank === 'J'
            ? SUITS.map((suit) => ({ suit, count: current.players[current.currentPlayer].hand.filter((card) => card.id !== selected.id && card.suit === suit).length })).sort((a, b) => b.count - a.count)[0].suit
            : undefined
          await new Promise((resolve) => setTimeout(resolve, 300))
          if (cancelled) return
          current = performPlay(current, selected.id, suitChoice)
          setGame(current)
          if (suitChoice && current.status === 'playing') showNotice(`${player.name} chose ${SUIT_NAMES[suitChoice]}`)
        }
      }
      actionLock.current = false
      setBusy(false)
    }, 550)
    return () => { cancelled = true; clearTimeout(timeout); actionLock.current = false; setBusy(false) }
  }, [game?.currentPlayer, game?.turn, game?.status, modal, playTone, showNotice])

  const currentPlayer = game?.players[game.currentPlayer]
  const humanPlayableCards = useMemo(() => game?.currentPlayer === 0 && game.status === 'playing' && game.penalty === 0 ? game.players[0].hand.filter((card) => playable(card, game)) : [], [game])
  const opponents = game?.players.slice(1) ?? []
  const winner = game?.winner !== null && game?.winner !== undefined ? game.players[game.winner] : null
  const closeModal = () => setModal(null)

  if (screen === 'friends') return <FriendHub profileName={profile.name} profileAvatar={profile.avatar} token={profile.token} onExit={() => setScreen('menu')} />
  if (screen === 'profile') return <ProfilePage profile={profile} stats={stats} onBack={() => setScreen('menu')} onSave={saveProfile} />

  if (screen === 'menu') return <main className="app-shell menu-screen">
    <div className="menu-topline"><span className="brand-mark"><Spade size={16} fill="currentColor" /></span><span>GREEN FELT</span><span className="offline-label"><span /> FRIENDS ONLINE</span><button className="profile-menu-button" onClick={() => setScreen('profile')} aria-label="Open player profile"><span className="profile-menu-avatar">{profile.avatar ? <img src={profile.avatar} alt=""/> : profile.name.slice(0, 1).toUpperCase()}</span><span>{profile.name}</span><UserRound size={14}/></button></div>
    <section className="menu-hero">
      <div className="hero-kicker"><span className="kicker-line" /> THE CLASSIC, REDEALT</div>
      <h1>One more<br /><em>round.</em></h1>
      <p className="hero-description">A quick game of cards, clever turns, and just the right amount of luck.</p>
      <div className="hero-cards" aria-hidden="true"><div className="hero-card hero-card-one"><b>A</b><span>♥</span><small>A</small></div><div className="hero-card hero-card-two"><b>9</b><span>♠</span><small>9</small></div><div className="hero-card hero-card-three"><b>7</b><span>♦</span><small>7</small></div></div>
      <div className="menu-actions">
        <button className="primary-button" onClick={() => { setModal('players'); playTone(600, 0.08) }}>PLAY <ArrowRight size={18} /></button>
        <button className="menu-button friend-menu-button" onClick={() => setScreen('friends')}><UsersRound size={17} /> PLAY WITH FRIEND <ArrowRight size={15} className="menu-arrow" /></button>
        <button className="menu-button" onClick={() => setModal('rules')}><CircleHelp size={18} /> HOW TO PLAY <ArrowRight size={15} className="menu-arrow" /></button>
        <button className="menu-button" onClick={() => setModal('settings')}><Settings2 size={18} /> SETTINGS <ArrowRight size={15} className="menu-arrow" /></button>
        <button className="menu-button menu-exit" onClick={() => setModal('exit')}><X size={18} /> EXIT GAME</button>
      </div>
    </section>
    <footer className="menu-footer"><span><Shield size={13} /> PRIVATE BY DESIGN</span><a href="https://wa.me/918837280440" target="_blank" rel="noreferrer">DEVELOPED BY FRADY LALHMUNSIAMA · WHATSAPP</a><span>{stats.games} ROUNDS <i /> {stats.wins} WINS</span></footer>
    {modal && <Overlay modal={modal} close={closeModal} settings={settings} updateSettings={updateSettings} onStart={startGame} onExit={() => { try { window.close() } catch { /* The host may not permit closing the window. */ } setModal(null) }} />}
  </main>

  return <main className="app-shell game-screen">
    <header className="game-header">
      <button className="icon-button" onClick={() => setModal('exit')} aria-label="Back to main menu"><ArrowLeft size={19} /></button>
      <div className="game-wordmark"><span className="brand-mark"><Spade size={14} fill="currentColor" /></span><span>GREEN FELT</span></div>
      <div className="game-head-actions"><SoundToggle enabled={settings.sound} onClick={() => updateSettings('sound')} label="Sound"/><SoundToggle enabled={settings.music} onClick={() => updateSettings('music')} label="Music"/><button className="icon-button" onClick={() => setModal('settings')} aria-label="Settings"><Settings2 size={18}/></button></div>
    </header>
    <section className={`game-table${busy ? ' table-busy' : ''}`} aria-label="Game table">
      <div className="table-stamp"><span>GF</span></div>
      <div className="opponents-row">
        {opponents.map((player, index) => <div className={`opponent ${game?.currentPlayer === player.id ? 'opponent-active' : ''}`} key={player.id}>
          <div className="opponent-avatar-wrap"><div className={`opponent-avatar avatar-${index}`}>{player.avatar.startsWith('data:') ? <img src={player.avatar} alt={`${player.name}'s profile`} /> : <span>{player.avatar}</span>}</div>{game?.currentPlayer === player.id && <span className="turn-pulse"/>}</div>
          <div className="opponent-name">{player.name}<span>{game?.currentPlayer === player.id ? ' · PLAYING' : ' · CPU'}</span></div>
          <div className="opponent-cards">{player.hand.map((card, i) => <div key={card.id} className="mini-back" style={{ zIndex: i, transform: `translateX(${i * -6}px) rotate(${(i - player.hand.length / 2) * 4}deg)` }} />)}<span>{player.hand.length}</span></div>
        </div>)}
      </div>
      <div className="table-status-row"><span className="live-dot" />{currentPlayer ? currentPlayer.isHuman ? 'YOUR TURN' : `${currentPlayer.name.toUpperCase()}'S TURN` : 'DEALING'}<span className="status-divider" />ROUND {String((game?.turn ?? 0) + 1).padStart(2, '0')}</div>
      <div className="middle-play-area">
        <div className="draw-pile-wrap"><button className="pile-button" onClick={() => { if (game?.currentPlayer === 0) void drawForHuman() }} disabled={!game || game.currentPlayer !== 0 || busy || game.status !== 'playing' || (game.penalty === 0 && humanPlayableCards.length > 0)} aria-label={game?.penalty ? `Draw ${game.penalty} cards` : 'Draw one card'}><CardFace back /><span className="pile-count">{game?.deck.length ?? 0}</span></button><span className="pile-caption">{game?.penalty ? `DRAW ${game.penalty}` : 'DRAW PILE'}</span></div>
        <div className="active-card-area"><span className="active-suit-tag"><span className={`suit-glyph suit-${game?.currentSuit ?? 'clubs'}`}>{SUIT_GLYPHS[game?.currentSuit ?? 'clubs']}</span> ACTIVE SUIT</span><div className="discard-stack">{game?.discard.slice(-2, -1).map((card) => <div key={card.id} className="discard-shadow"><CardFace card={card} small /></div>)}{game?.discard.slice(-1).map((card) => <div key={card.id} className="top-card"><CardFace card={card} /></div>)}</div><span className="pile-caption">ON THE TABLE</span></div>
        <div className="turn-direction"><span><ArrowLeftRight size={14}/></span>{game?.direction === 1 ? 'CLOCKWISE' : 'COUNTER-CLOCKWISE'}</div>
      </div>
      <div className="game-message" aria-live="polite"><span className="message-icon"><AudioLines size={14}/></span>{game?.message}{notice && <strong>{notice}</strong>}</div>
      {game?.penalty ? <div className="penalty-chip"><span>{game.penalty}</span> CARDS TO DRAW</div> : null}
    </section>
    <section className="player-hand-section">
      <div className="hand-heading"><div><span className="your-hand-label">YOUR HAND</span><span className="hand-count">{game?.players[0].hand.length ?? 0} cards</span></div><span className="hand-hint">{busy ? 'PLEASE WAIT…' : game?.currentPlayer === 0 ? humanPlayableCards.length ? 'TAP A GLOWING CARD' : 'DRAW ONE CARD' : 'WAITING FOR YOUR TURN'}</span></div>
      <div className="hand-scroll" aria-label="Your cards">{game?.players[0].hand.map((card) => <div className="hand-card" key={card.id}><CardFace card={card} playable={humanPlayableCards.some((item) => item.id === card.id)} onClick={() => playHumanCard(card)} /></div>)}</div>
      <div className="hand-controls"><button className="draw-action" onClick={() => void drawForHuman()} disabled={!game || game.currentPlayer !== 0 || busy || game.status !== 'playing' || (game.penalty === 0 && humanPlayableCards.length > 0)}><span className="draw-action-icon"><RotateCcw size={15}/></span>{game?.penalty ? `DRAW ${game.penalty}` : 'DRAW ONE CARD'}{game?.penalty ? <span className="draw-badge">{game.penalty}</span> : null}</button><div className="game-controls-note"><span className="control-dot"/> {game?.currentPlayer === 0 ? game.penalty ? 'Draw to clear the penalty' : humanPlayableCards.length ? `${humanPlayableCards.length} playable` : 'No match — draw one card' : 'Opponent is thinking'}</div></div>
    </section>
    {modal && <Overlay modal={modal} close={closeModal} settings={settings} updateSettings={updateSettings} onStart={startGame} onExit={() => { setGame(null); setScreen('menu'); setModal(null) }} chooseSuit={chooseSuit} winner={winner?.name} results={game?.players} humanWon={winner?.isHuman} onReplay={() => game && startGame(game.players.length)} />}
  </main>
}

function Overlay({ modal, close, settings, updateSettings, onStart, onExit, chooseSuit, winner, results, humanWon, onReplay }: { modal: 'players' | 'settings' | 'rules' | 'suit' | 'winner' | 'exit' | null; close: () => void; settings: Settings; updateSettings: (key: keyof Settings) => void; onStart: (count: number) => void; onExit: () => void; chooseSuit?: (suit: Suit) => void; winner?: string; results?: Player[]; humanWon?: boolean; onReplay?: () => void }) {
  if (!modal) return null
  const title = modal === 'players' ? 'Choose your table' : modal === 'settings' ? 'Your preferences' : modal === 'rules' ? 'The quick guide' : modal === 'suit' ? 'Choose a suit' : modal === 'winner' ? humanWon ? 'Nicely played.' : 'Next round?' : modal === 'exit' ? 'Take a break?' : 'Choose a suit'
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && modal !== 'suit') close() }}><section className={`modal-card ${modal === 'rules' ? 'rules-modal' : ''} ${modal === 'winner' ? 'winner-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <button className="modal-close" aria-label="Close" onClick={close}><X size={18}/></button>
    {modal === 'winner' && <div className="winner-icon"><Crown size={25}/></div>}
    <span className="modal-kicker">{modal === 'winner' ? 'ROUND COMPLETE' : modal === 'suit' ? 'YOUR CARD, YOUR CALL' : 'GREEN FELT'}</span>
    <h2 id="modal-title">{title}</h2>
    {modal === 'players' && <><p className="modal-copy">Pick a table size. You'll play against the others.</p><div className="player-count-options">{[2, 3, 4].map((count) => <button key={count} className="count-option" onClick={() => onStart(count)}><span className="count-avatars">{Array.from({ length: count }, (_, i) => <i key={i}>{['Y', 'M', 'N', 'R'][i]}</i>)}</span><span><b>{count} Players</b><small>You + {count - 1} {count === 2 ? 'opponent' : 'opponents'}</small></span><ArrowRight size={17}/></button>)}</div></>}
    {modal === 'settings' && <><p className="modal-copy">Make the table feel like yours.</p><div className="settings-options">{(['sound', 'music', 'vibration'] as const).map((key) => <button className="setting-row" key={key} onClick={() => updateSettings(key)}><span className="setting-icon">{key === 'sound' ? <Volume2 size={17}/> : key === 'music' ? <Music2 size={17}/> : <AudioLines size={17}/>}</span><span className="setting-name">{key === 'sound' ? 'Sound effects' : key === 'music' ? 'Background music' : 'Vibration'}<small>{key === 'sound' ? 'Cards and game feedback' : key === 'music' ? 'A little atmosphere' : 'Haptic feedback'}</small></span><span className={`switch ${settings[key] ? 'switch-on' : ''}`}><i/></span></button>)}</div><button className="secondary-button full-button" onClick={close}>DONE</button></>}
    {modal === 'rules' && <><p className="modal-copy">Be the first to play every card in your hand.</p><div className="rules-list"><RuleRow badge="MATCH" text="Play the same suit or rank as the card on top. Aces and Jacks can always be played."/><RuleRow badge="A / J" text="Choose any suit. The active suit changes to your pick."/><RuleRow badge="7" text="The next player draws 2 cards and loses their turn."/><RuleRow badge="10" text="The next player draws 3 cards and loses their turn."/><RuleRow badge="9" text="Reverse the direction of play. In a two-player game, it comes right back to you."/><RuleRow badge="DRAW" text="No match? Draw exactly one card. If it matches, you may play it; otherwise your turn passes."/><RuleRow badge="WIN" text="Empty your hand to win. The draw pile reshuffles the discards when needed."/></div><button className="secondary-button full-button" onClick={close}><ArrowLeft size={16}/> GOT IT</button></>}
    {modal === 'suit' && <><p className="modal-copy">What suit should everyone follow?</p><div className="suit-options">{SUITS.map((suit) => <button key={suit} onClick={() => chooseSuit?.(suit)} className={`suit-option suit-option-${suit}`} aria-label={SUIT_NAMES[suit]}><span>{SUIT_GLYPHS[suit]}</span><small>{SUIT_NAMES[suit]}</small></button>)}</div></>}
    {modal === 'exit' && <><p className="modal-copy">Head back to the menu, or leave the game when you're ready.</p><div className="exit-actions"><button className="primary-button" onClick={onExit}>MAIN MENU <ArrowRight size={17}/></button><button className="secondary-button full-button" onClick={() => { close(); try { window.close() } catch { /* Closing is controlled by the app host. */ } }}>LEAVE GAME</button></div></>}
    {modal === 'winner' && <><p className="winner-name">{winner ?? 'A player'} <span>{humanWon ? 'took the table' : 'won this round'}</span></p><div className="results-list">{results?.map((player) => <div className={`result-row ${player.name === winner ? 'result-winner' : ''}`} key={player.id}><span className="result-avatar">{player.avatar.startsWith('data:') ? <img src={player.avatar} alt="" /> : player.avatar}</span><span>{player.name}{player.name === winner ? <small>WINNER</small> : null}</span><b>{player.hand.length} <small>CARDS</small></b></div>)}</div><button className="primary-button full-button" onClick={onReplay}>PLAY AGAIN <RotateCcw size={16}/></button><button className="secondary-button full-button" onClick={onExit}>MAIN MENU</button></>}
  </section></div>
}

function RuleRow({ badge, text }: { badge: string; text: string }) { return <div className="rule-row"><span className="rule-badge">{badge}</span><p>{text}</p></div> }
