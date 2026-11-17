import type { Metadata } from 'next'
import FeaturePage from '@/Haolai/FeaturePage'

export const metadata: Metadata = { title: '收藏图鉴 · 号来 Phoenix', description: '查看藏宝阁账号典藏皮肤、庭院、头像框等收藏持有情况与官方目录。' }
export default function Page() { return <FeaturePage feature="collections" /> }
