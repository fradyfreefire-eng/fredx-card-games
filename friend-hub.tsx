'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ArrowLeft, ArrowRight, Check, Crown, LoaderCircle, MessageCircle, Send, Share2, Spade, UsersRound } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Rank, Suit } from '@/lib/card-game'

type Props = { profileName: string; profileAvatar: string; token: string; onExit: () => void }
type SuitName = Suit
const suitMarks: Record<SuitName, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }
const suitNames: Record<SuitName, string> = { hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades' }
const suitOptions: SuitName[] = ['hearts', 'diamonds', 'clubs', 'spades']

export default function FriendHub({ profileName, profileAvatar, token, onExit }: Props) {
  const [code, setCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingWild, setPendingWild] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [chatText, setChatText] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const room = useQuery(api.rooms.get, code ? { code, token } : 'skip')
  const createRoom = useMutation(api.rooms.create)
  const joinRoom = useMutation(api.rooms.join)
  const startRoom = useMutation(api.rooms.start)
  const restartRoom = useMutation(api.rooms.restart)
  const playCard = useMutation(api.rooms.play)
  const drawCard = useMutation(api.rooms.draw)
  const leaveRoom = useMutation(api.rooms.leave)
  const updateProfile = useMutation(api.rooms.updateProfile)
  const sendRoomMessage = useMutation(api.rooms.sendMessage)

  useEffect(() => {
    const savedCode = window.sessionStorage.getItem('green-felt-friend-room')
    if (savedCode) setCode(savedCode)
  }, [])

  useEffect(() => {
    if (!room || !code) return
    void updateProfile({ code, token, name: profileName, avatar: profileAvatar }).catch(() => undefined)
  }, [room?.code, room?.mySeat, profileName, profileAvatar, token, code, updateProfile])

  const ownPlayer = useMemo(() => room?.players.find((player) => player.seat === room.mySeat), [room])
  const playableCards = useMemo(() => {
    if (!room || room.status !== 'playing' || room.currentPlayer !== room.mySeat || !ownPlayer) return []
    return ownPlayer.hand.filter((card) => card.rank === 'A' || card.rank === 'J' || card.suit === room.activeSuit || card.rank === room.topCard.rank)
  }, [room, ownPlayer])

  const keepRoom = (nextCode: string) => {
    window.sessionStorage.setItem('green-felt-friend-room', nextCode)
    setCode(nextCode)
    setError('')
  }

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try { await operation() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.') }
    finally { setBusy(false) }
  }

  const sendChat = async (kind: 'text' | 'reaction', text = chatText) => {
    if (!code || !room || chatSending) return
    setChatSending(true)
    setError('')
    try {
      await sendRoomMessage({ code, token, kind, text })
      if (kind === 'text') setChatText('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send your message.')
    } finally {
      setChatSending(false)
    }
  }

  const create = async () => {
    setBusy(true); setError('')
    try { keepRoom(await createRoom({ name: profileName, avatar: profileAvatar, token })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create a room.') }
    finally { setBusy(false) }
  }

  const join = async () => {
    const normalizedCode = inputCode.trim().toUpperCase()
    if (normalizedCode.length !== 6) { setError('Enter the six-letter room code your friend shared.'); return }
    await run(async () => keepRoom(await joinRoom({ code: normalizedCode, name: profileName, avatar: profileAvatar, token })))
  }

  const exitRoom = async () => {
    if (code) await run(async () => { await leaveRoom({ code, token }); window.sessionStorage.removeItem('green-felt-friend-room'); setCode(''); setPendingWild(null); onExit() })
    else onExit()
  }

  const shareInvite = async () => {
    if (!code) return
    const text = `Join my Green Felt card game! Room code: ${code}\n${window.location.origin}`
    try {
      if (navigator.share) await navigator.share({ title: 'Join my Green Felt game', text })
      else { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1700) }
    } catch { /* A cancelled share is not an error. */ }
  }

  if (code && room === undefined) return <main className="app-shell friend-screen"><div className="friend-loading"><LoaderCircle className="spin-icon" size={24}/><span>Connecting to your room…</span></div></main>

  if (code && room) {
    const isMyTurn = room.status === 'playing' && room.currentPlayer === room.mySeat
    const winner = room.winner === null ? null : room.players.find((player) => player.seat === room.winner)
    return <main className="app-shell friend-screen">
      <header className="friend-topbar"><button className="icon-button" onClick={() => void exitRoom()} aria-label="Leave room"><ArrowLeft size={18}/></button><div className="game-wordmark"><span className="brand-mark"><Spade size={14} fill="currentColor"/></span><span>FRIEND TABLE</span></div><span className="online-badge"><i/> LIVE</span></header>
      {room.status === 'waiting' ? <section className="room-lobby">
        <div className="friend-kicker"><span className="kicker-line"/> FRIENDS, DEALT IN</div><h1>Room <em>{room.code}</em></h1><p className="friend-description">Share this code with your friends. The table deals as soon as the host is ready.</p>
        <div className="room-code-card"><span>YOUR ROOM CODE</span><strong>{room.code}</strong><button className="secondary-button" onClick={() => void shareInvite()}>{copied ? <Check size={16}/> : <Share2 size={16}/>} {copied ? 'COPIED' : 'SHARE INVITE'}</button></div>
        <div className="room-roster-heading"><span>PLAYERS</span><span>{room.players.length} / 4 SEATS</span></div>
        <div className="room-roster">{room.players.map((player) => <div className="room-player" key={player.seat}><PlayerAvatar src={player.avatar} name={player.name}/><div><b>{player.name}{player.seat === room.mySeat ? ' (you)' : ''}</b><small>{player.isHost ? 'HOST' : 'READY'}</small></div>{player.isHost && <Crown size={15}/>}</div>)}</div>
        {room.players.length < 2 ? <p className="room-wait-note"><span className="live-dot"/> Waiting for at least one friend to join</p> : room.players[0]?.isHost ? <button className="primary-button" disabled={busy} onClick={() => void run(() => startRoom({ code, token }))}>{busy ? 'DEALING…' : 'DEAL THE CARDS'} <ArrowRight size={18}/></button> : <p className="room-wait-note"><span className="live-dot"/> Waiting for {room.players[0]?.name} to deal</p>}
        {error && <p className="friend-error" role="alert">{error}</p>}
      </section> : room.status === 'won' ? <section className="friend-result"><div className="winner-icon"><Crown size={25}/></div><span className="modal-kicker">ROUND COMPLETE</span><h1>{winner?.name ?? 'A player'} <em>wins.</em></h1><p className="friend-description">{winner?.name === profileName ? 'You emptied your hand first.' : 'Ready to try another round?'}</p><div className="room-roster">{room.players.map((player) => <div className="room-player" key={player.seat}><PlayerAvatar src={player.avatar} name={player.name}/><div><b>{player.name}</b><small>{player.handCount} CARDS LEFT</small></div>{player.seat === room.winner && <Crown size={15}/>}</div>)}</div>{ownPlayer?.isHost && <button className="primary-button" disabled={busy} onClick={() => void run(() => restartRoom({ code, token }))}>PLAY ANOTHER ROUND <ArrowRight size={18}/></button>}<button className="secondary-button full-button" onClick={() => void exitRoom()}>MAIN MENU</button>{error && <p className="friend-error" role="alert">{error}</p>}</section> : <section className="remote-match">
        <div className="remote-match-heading"><div><span className="friend-kicker"><span className="live-dot"/> ROOM {room.code}</span><h1>{isMyTurn ? 'Your turn.' : `${room.players[room.currentPlayer]?.name ?? 'Friend'}’s turn.`}</h1></div><div className="remote-direction">{room.direction === 1 ? 'CLOCKWISE' : 'REVERSED'}</div></div>
        <div className="remote-roster">{room.players.map((player) => <div className={`remote-player${player.seat === room.currentPlayer ? ' remote-player-active' : ''}`} key={player.seat}><PlayerAvatar src={player.avatar} name={player.name}/><span>{player.seat === room.mySeat ? 'YOU' : player.name}</span><small>{player.handCount} CARDS</small></div>)}</div>
        <div className="remote-table"><div className="remote-table-message" aria-live="polite"><i className="live-dot"/>{room.message}</div><div className="remote-piles"><div className="remote-pile"><button className="remote-card remote-card-back" disabled={!isMyTurn || playableCards.length > 0 || busy || !ownPlayer?.hand.length} aria-label="Draw one card" onClick={() => void run(() => drawCard({ code, token }))}><span>GF</span></button><small>DRAW · {room.deckCount}</small></div><div className="remote-pile"><span className="remote-suit">{suitMarks[room.activeSuit]}</span><PlayingCard rank={room.topCard.rank} suit={room.topCard.suit}/><small>ON THE TABLE</small></div></div><div className="remote-active-suit">ACTIVE SUIT: {suitNames[room.activeSuit]}</div></div>
        <div className="remote-hand-label"><span>YOUR HAND · {ownPlayer?.handCount ?? 0}</span><small>{isMyTurn ? playableCards.length ? 'TAP A MATCHING CARD' : 'DRAW ONE CARD' : 'WAIT FOR YOUR TURN'}</small></div>
        <div className="remote-hand" aria-label="Your hand">{ownPlayer?.hand.map((card) => { const canPlay = isMyTurn && playableCards.some((playable) => playable.id === card.id) && !busy; return <button key={card.id} type="button" className={`remote-card${card.suit === 'hearts' || card.suit === 'diamonds' ? ' remote-card-red' : ''}${canPlay ? ' remote-card-playable' : ''}`} style={{ zIndex: canPlay ? 20 : undefined }} disabled={!canPlay} onClick={() => { if (card.rank === 'A' || card.rank === 'J') setPendingWild(card.id); else void run(() => playCard({ code, token, cardId: card.id })) }} aria-label={`Play ${card.rank} of ${suitNames[card.suit]}`}><b>{card.rank}<i>{suitMarks[card.suit]}</i></b><span>{suitMarks[card.suit]}</span><b className="remote-corner-bottom">{card.rank}<i>{suitMarks[card.suit]}</i></b></button>})}</div>
        <section className="remote-chat" aria-label="Room chat"><div className="remote-chat-heading"><span><MessageCircle size={14}/> ROOM CHAT</span><small>{room.messages.length} / 36</small></div><div className="remote-chat-log" role="log" aria-live="polite" aria-relevant="additions text">{room.messages.length ? room.messages.slice(-4).map((message) => <p className={`remote-chat-message${message.kind === 'reaction' ? ' remote-chat-reaction' : ''}`} key={message.id}><b>{message.name}{message.token === token ? ' · YOU' : ''}</b><span>{message.text}</span></p>) : <p className="remote-chat-empty">Say hi to the table.</p>}</div><div className="remote-chat-reactions" aria-label="Quick reactions">{[['😂', 'LOL'], ['🤣', 'Laugh'], ['❤️', 'Heart'], ['👏', 'Clap'], ['GG', 'Good game']].map(([reaction, label]) => <button type="button" key={reaction} disabled={chatSending} onClick={() => void sendChat('reaction', reaction)} aria-label={`Send ${label} reaction`} title={label}>{reaction}</button>)}</div><form className="remote-chat-compose" onSubmit={(event) => { event.preventDefault(); void sendChat('text') }}><input aria-label="Write a chat message" maxLength={140} placeholder="Send a message…" value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => { if (event.key !== 'Enter') return; event.preventDefault(); if (event.nativeEvent.isComposing || event.keyCode === 229) return; void sendChat('text') }}/><button type="submit" disabled={chatSending || !chatText.trim()} aria-label="Send chat message"><Send size={15}/></button></form></section>
        {pendingWild && <div className="remote-suit-shade" role="dialog" aria-modal="true" aria-labelledby="remote-suit-title"><div className="remote-suit-dialog"><span className="modal-kicker">WILD CARD</span><h2 id="remote-suit-title">Choose a suit</h2><div className="suit-options">{suitOptions.map((suit) => <button className={`suit-option suit-option-${suit}`} key={suit} onClick={() => { const cardId = pendingWild; setPendingWild(null); void run(() => playCard({ code, token, cardId, chosenSuit: suit })) }}><span>{suitMarks[suit]}</span><small>{suitNames[suit]}</small></button>)}</div><button className="secondary-button full-button" onClick={() => setPendingWild(null)}>CANCEL</button></div></div>}
        {error && <p className="friend-error" role="alert">{error}</p>}
      </section>}
      {room.status === 'won' ? null : <footer className="friend-room-footer"><span>ROOM CODE <b>{room.code}</b></span><button onClick={() => void shareInvite()}>{copied ? <Check size={15}/> : <Share2 size={15}/>} {copied ? 'COPIED' : 'INVITE FRIEND'}</button></footer>}
    </main>
  }

  return <main className="app-shell friend-screen">
    <header className="friend-topbar"><button className="icon-button" onClick={onExit} aria-label="Back to menu"><ArrowLeft size={18}/></button><div className="game-wordmark"><span className="brand-mark"><Spade size={14} fill="currentColor"/></span><span>PLAY WITH FRIEND</span></div><span className="online-badge"><i/> ONLINE</span></header>
    <section className="friend-entry">
      <div className="friend-kicker"><span className="kicker-line"/> YOUR PEOPLE, YOUR TABLE</div><h1>Better with<br/><em>friends.</em></h1><p className="friend-description">Make a private room for up to four players, or join your friend with their room code.</p>
      <div className="friend-profile-note"><PlayerAvatar src={profileAvatar} name={profileName}/><span>Playing as <b>{profileName}</b></span><small>EDIT IN PROFILE</small></div>
      <button className="primary-button" disabled={busy} onClick={() => void create()}>{busy ? 'CREATING ROOM…' : 'CREATE A ROOM'} <UsersRound size={18}/></button>
      <div className="friend-or"><span/> OR JOIN A FRIEND <span/></div>
      <form className="join-room-form" onSubmit={(event) => { event.preventDefault(); void join() }}><label htmlFor="room-code">ROOM CODE</label><div><input id="room-code" inputMode="text" autoComplete="off" maxLength={6} placeholder="e.g. 4G7K2P" value={inputCode} onChange={(event) => setInputCode(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())}/><button className="primary-button" disabled={busy || inputCode.length !== 6} type="submit">JOIN <ArrowRight size={17}/></button></div></form>
      {error && <p className="friend-error" role="alert">{error}</p>}
      <p className="friend-privacy">Private room codes · No account needed · Live across devices</p>
    </section>
    <footer className="friend-room-footer"><span>SHARE A CODE. DEAL A HAND.</span><button onClick={onExit}><ArrowLeft size={14}/> MAIN MENU</button></footer>
  </main>
}

function PlayerAvatar({ src, name }: { src: string; name: string }) {
  return <span className="player-avatar">{src ? <img src={src} alt={`${name}'s profile`}/> : name.trim().slice(0, 1).toUpperCase()}</span>
}

function PlayingCard({ rank, suit }: { rank: Rank; suit: Suit }) {
  return <div className={`remote-card${suit === 'hearts' || suit === 'diamonds' ? ' remote-card-red' : ''}`}><b>{rank}<i>{suitMarks[suit]}</i></b><span>{suitMarks[suit]}</span><b className="remote-corner-bottom">{rank}<i>{suitMarks[suit]}</i></b></div>
}
