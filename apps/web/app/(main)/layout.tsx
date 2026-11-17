// app/(main)/layout.tsx
import Layout from '@/Layout'

export default function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <Layout>{children}</Layout>
}
