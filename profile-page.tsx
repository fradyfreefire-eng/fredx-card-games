'use client'

import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Camera, Check, ImagePlus, ShieldCheck, UserRound } from 'lucide-react'

type Profile = { name: string; avatar: string; token: string }

export default function ProfilePage({ profile, stats, onBack, onSave }: { profile: Profile; stats: { wins: number; games: number }; onBack: () => void; onSave: (name: string, avatar: string) => void }) {
  const [name, setName] = useState(profile.name)
  const [avatar, setAvatar] = useState(profile.avatar)
  const [saved, setSaved] = useState(false)
  const [cropImage, setCropImage] = useState<{ image: HTMLImageElement; url: string } | null>(null)
  const [cropZoom, setCropZoom] = useState(1)
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
  const [imageError, setImageError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cropDrag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)
  const handleImage = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      setImageError('Choose an image smaller than 8 MB.')
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      setCropImage({ image, url })
      setCropZoom(1)
      setCropOffset({ x: 0, y: 0 })
      setImageError('')
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      setImageError('This image could not be opened. Try another photo.')
    }
    image.src = url
  }
  const closeCrop = () => {
    if (cropImage) URL.revokeObjectURL(cropImage.url)
    setCropImage(null)
    if (fileRef.current) fileRef.current.value = ''
  }
  const saveCrop = () => {
    if (!cropImage) return
    const size = 220
    const scale = size / Math.min(cropImage.image.naturalWidth, cropImage.image.naturalHeight) * cropZoom
    const renderWidth = cropImage.image.naturalWidth * scale
    const renderHeight = cropImage.image.naturalHeight * scale
    const left = (size - renderWidth) / 2 + cropOffset.x
    const top = (size - renderHeight) / 2 + cropOffset.y
    const sourceSize = size / scale
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 160
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(cropImage.image, -left / scale, -top / scale, sourceSize, sourceSize, 0, 0, 160, 160)
    setAvatar(canvas.toDataURL('image/jpeg', 0.78))
    setSaved(false)
    closeCrop()
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim().replace(/\s+/g, ' ')
    if (!cleanName) return
    onSave(cleanName.slice(0, 20), avatar)
    setName(cleanName.slice(0, 20))
    setSaved(true)
  }

  return <main className="app-shell profile-screen">
    <header className="friend-topbar"><button className="icon-button" onClick={onBack} aria-label="Back to menu"><ArrowLeft size={18}/></button><div className="game-wordmark"><span className="brand-mark"><UserRound size={14}/></span><span>PLAYER PROFILE</span></div><span className="profile-local-label"><ShieldCheck size={14}/> ON THIS DEVICE</span></header>
    <section className="profile-content">
      <div className="friend-kicker"><span className="kicker-line"/> YOUR CARD, YOUR NAME</div><h1>Make yourself<br/><em>at home.</em></h1><p className="friend-description">Your profile appears at the table when you play with friends.</p>
      <form className="profile-form" onSubmit={save}>
        <div className="profile-photo-row"><div className="profile-photo">{avatar ? <img src={avatar} alt="Your profile picture"/> : <span>{name.trim().slice(0, 1).toUpperCase() || 'P'}</span>}<button type="button" className="profile-photo-edit" onClick={() => fileRef.current?.click()} aria-label="Choose a profile picture"><Camera size={15}/></button></div><div><b>Profile picture</b><p>Position your photo just right.</p><button className="profile-upload-button" type="button" onClick={() => fileRef.current?.click()}><ImagePlus size={15}/> CHANGE PHOTO</button><input ref={fileRef} className="sr-only" type="file" accept="image/*" onChange={(event) => handleImage(event.target.files?.[0])}/>{imageError && <small className="profile-image-error" role="alert">{imageError}</small>}</div></div>
        <label className="profile-name-label" htmlFor="display-name">DISPLAY NAME</label><input className="profile-name-input" id="display-name" value={name} maxLength={20} autoComplete="nickname" onChange={(event) => { setName(event.target.value); setSaved(false) }} placeholder="Your name"/><small className="profile-character-count">{name.length} / 20</small>
        <button type="submit" className="primary-button" disabled={!name.trim()}>{saved ? 'PROFILE SAVED' : 'SAVE PROFILE'} {saved ? <Check size={17}/> : <ArrowLeft size={17} className="profile-save-arrow"/>}</button>
      </form>
      <div className="profile-stats"><div><b>{stats.games}</b><span>ROUNDS</span></div><i/><div><b>{stats.wins}</b><span>WINS</span></div></div>
      <div className="developer-card"><div><span>BUILT WITH CARE</span><b>Developed by Frady Lalhmunsiama</b></div><a href="https://wa.me/918837280440" target="_blank" rel="noreferrer"><span>WHATSAPP</span><b>+91 88372 80440</b><ArrowLeft size={15}/></a></div>
    </section>
    {cropImage && <div className="profile-crop-shade" role="dialog" aria-modal="true" aria-labelledby="crop-title"><section className="profile-crop-dialog"><span className="modal-kicker">PROFILE PHOTO</span><h2 id="crop-title">Make it yours.</h2><p>Drag to reposition, then zoom to frame your photo.</p><div className="profile-crop-window" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); cropDrag.current = { x: event.clientX, y: event.clientY, offsetX: cropOffset.x, offsetY: cropOffset.y } }} onPointerMove={(event) => { if (!cropDrag.current) return; const scale = 220 / Math.min(cropImage.image.naturalWidth, cropImage.image.naturalHeight) * cropZoom; const maxX = Math.max(0, (cropImage.image.naturalWidth * scale - 220) / 2); const maxY = Math.max(0, (cropImage.image.naturalHeight * scale - 220) / 2); setCropOffset({ x: Math.max(-maxX, Math.min(maxX, cropDrag.current.offsetX + event.clientX - cropDrag.current.x)), y: Math.max(-maxY, Math.min(maxY, cropDrag.current.offsetY + event.clientY - cropDrag.current.y)) }) }} onPointerUp={() => { cropDrag.current = null }} onPointerCancel={() => { cropDrag.current = null }}><img src={cropImage.url} alt="Adjustable profile photo preview" draggable={false} style={{ width: cropImage.image.naturalWidth * 220 / Math.min(cropImage.image.naturalWidth, cropImage.image.naturalHeight) * cropZoom, height: cropImage.image.naturalHeight * 220 / Math.min(cropImage.image.naturalWidth, cropImage.image.naturalHeight) * cropZoom, left: `calc(50% + ${cropOffset.x}px)`, top: `calc(50% + ${cropOffset.y}px)` }}/><span className="profile-crop-mask"/></div><label className="profile-zoom-label" htmlFor="profile-zoom">ZOOM <span>{Math.round(cropZoom * 100)}%</span></label><input id="profile-zoom" className="profile-zoom-slider" type="range" min="1" max="2.5" step="0.01" value={cropZoom} onChange={(event) => { setCropZoom(Number(event.target.value)); setCropOffset({ x: 0, y: 0 }) }}/><div className="profile-crop-actions"><button type="button" className="secondary-button" onClick={closeCrop}>CANCEL</button><button type="button" className="primary-button" onClick={saveCrop}><Check size={16}/> USE PHOTO</button></div></section></div>}
    <footer className="friend-room-footer"><span>YOUR PROFILE IS SAVED ON THIS DEVICE</span><button onClick={onBack}><ArrowLeft size={14}/> MAIN MENU</button></footer>
  </main>
}
