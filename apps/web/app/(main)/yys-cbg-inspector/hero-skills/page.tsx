import type { Metadata } from 'next'
import FeaturePage from '@/Haolai/FeaturePage'

export const metadata: Metadata = { title: '式神技能 · 号来 Phoenix' }
export default function Page() { return <FeaturePage feature="hero-skills" /> }
