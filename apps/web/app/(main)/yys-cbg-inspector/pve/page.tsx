import type { Metadata } from 'next'
import FeaturePage from '@/Haolai/FeaturePage'

export const metadata: Metadata = { title: 'PVE 预览 · 号来 Phoenix' }
export default function Page() { return <FeaturePage feature="pve" /> }
