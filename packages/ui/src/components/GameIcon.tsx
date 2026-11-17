'use client'

import { createContext, useContext } from 'react'
import { useImageFallback } from '@phoenix/ui/hooks/use-image-fallback'
import type { RelicView } from '@phoenix/types'

type GameIconAssets = {
  assetUrl: (path: string) => string
  collectionImageUrl: (kind: 'suits' | 'heroes', id: number) => string
}

const defaultAssets: GameIconAssets = {
  assetUrl: path => `/assets/haolai/${path}`,
  collectionImageUrl: (kind, id) => `/cbg/images/${kind}/${id}.png`,
}
const GameIconAssetsContext = createContext<GameIconAssets>(defaultAssets)
export function useGameIconAssets() { return useContext(GameIconAssetsContext) }
export function GameIconProvider({ assets, children }: { assets: GameIconAssets; children: React.ReactNode }) {
  return <GameIconAssetsContext value={assets}>{children}</GameIconAssetsContext>
}

const slotAngles: Record<number, number> = { 1: 0, 2: -45, 3: -90, 4: -180, 5: -225, 6: -270 }

function GameIcon({ src, size, className = '' }: { src?: string; size: number; className?: string }) {
  const { failed, onError } = useImageFallback(src)
  if (!src || failed) return null
  return <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center overflow-hidden ${className}`} style={{ width: size, height: size }}>
    <img src={src} width={size} height={size} alt="" className="size-full object-contain" onError={onError} />
  </span>
}

export function SuitIcon({ id, size = 32 }: { id?: number; size?: number }) {
  const assets = useContext(GameIconAssetsContext)
  return <GameIcon key={id} src={id ? assets.collectionImageUrl('suits', id) : undefined} size={size} />
}

export function HeroPortrait({ heroId, grayscale = false, size = 56 }: { heroId: number; grayscale?: boolean; size?: number }) {
  const assets = useContext(GameIconAssetsContext)
  return <GameIcon key={heroId} src={assets.collectionImageUrl('heroes', heroId)} size={size} className={`rounded-full bg-muted ${grayscale ? 'grayscale' : ''}`} />
}

export function RelicIcon({ item }: { item: RelicView }) {
  const assets = useContext(GameIconAssetsContext)
  const angle = slotAngles[item.position ?? 0]
  const quality = Math.max(0, Math.min(6, item.quality ?? 0))
  return <div className="grid w-14 shrink-0 justify-items-center gap-0.5" aria-hidden="true">
    <div className="relative grid size-14 place-items-center">
      <div className="grid size-10 place-items-center overflow-hidden rounded-full"><SuitIcon id={item.suit?.id} size={40} /></div>
      {angle !== undefined && <img src={assets.assetUrl('relic-slot-pointer.png')} width={56} height={56} alt="" className="pointer-events-none absolute inset-0" style={{ transform: `rotate(${angle}deg)` }} />}
    </div>
    <div className="flex">{Array.from({ length: quality }, (_, index) => <img key={index} src={assets.assetUrl('relic-quality-gem.png')} width={8} height={10} alt="" className="h-2.5 w-2 object-contain" />)}</div>
  </div>
}
