import Image from 'next/image'

export default function SiteFooter() {
  return (
    <footer
      aria-label="备案信息"
      className="mt-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border/70 px-4 py-4 text-xs text-muted-foreground"
    >
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noreferrer"
        className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        鲁ICP备2026050817号-1
      </a>
      <a
        href="https://beian.mps.gov.cn/#/query/webSearch?code=37050202371677"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <Image
          src="/assets/icons/public-security-record.png"
          alt=""
          width={16}
          height={16}
          unoptimized
          aria-hidden="true"
        />
        鲁公网安备37050202371677号
      </a>
    </footer>
  )
}
