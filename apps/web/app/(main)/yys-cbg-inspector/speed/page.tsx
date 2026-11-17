import type { Metadata } from 'next'
import FeaturePage from '@/Haolai/FeaturePage'

export const metadata: Metadata = { title: '速度盘点 · 号来 Phoenix' }
export default function Page() { return <FeaturePage feature="speed" /> }
