import type { Metadata } from 'next'
import FeaturePage from '@/Haolai/FeaturePage'

export const metadata: Metadata = { title: '御魂计算器 · 号来 Phoenix' }
export default function Page() { return <FeaturePage feature="calculator" /> }
