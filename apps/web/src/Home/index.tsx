import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { MobileNavigation } from '@/Layout/PageHeader'

export default function Home() {
  return (
    <div className="welcome-wrap">
      <header className="welcome-intro">
        <h1 id="welcome-title">工具箱</h1>
        <div className="md:hidden"><MobileNavigation /></div>
      </header>
      <section aria-labelledby="welcome-title">
        <Link href="/yys-cbg-inspector/home" className="welcome-tool" aria-label="号来 Phoenix · 阴阳师账号查询与分析">
          <Image src="/yys-header.png" alt="" width={48} height={48} className="shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">号来 <span className="text-xs font-normal text-muted-foreground">Phoenix</span></h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">阴阳师账号查询与分析</p>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">账号概览 · 速度盘点 · 式神技能 · 御魂分析 · PVE 预览 · 搭配计算</p>
          </div>
          <ArrowRight size={20} className="shrink-0 text-primary" aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
