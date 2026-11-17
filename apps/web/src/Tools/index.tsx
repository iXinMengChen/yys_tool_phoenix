import { Wrench } from 'lucide-react'

export default function Tools() {
  return (
    <section
      aria-labelledby="tools-title"
      className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-5xl items-center py-8"
    >
      <div className="grid w-full overflow-hidden rounded-2xl border border-border bg-background sm:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-12">
          <p
            role="status"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
          >
            <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
            正在建设
          </p>
          <h1
            id="tools-title"
            className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
          >
            工具页正在建设中
          </h1>
          <p className="mt-4 max-w-[42ch] text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            工具与能力正在整理打磨。准备好后，会在这里和你见面。
          </p>
        </div>

        <div
          aria-hidden="true"
          className="flex min-h-56 items-center justify-center border-t border-border bg-primary/[0.04] sm:min-h-72 sm:border-l sm:border-t-0"
        >
          <div className="grid size-36 place-items-center rounded-[2rem] border border-primary/15 bg-background text-primary sm:size-40">
            <Wrench className="size-14 stroke-[1.4] sm:size-16" />
          </div>
        </div>
      </div>
    </section>
  )
}
