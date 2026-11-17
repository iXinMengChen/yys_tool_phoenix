import { useLocation } from 'react-router-dom'
import { PageTransition as SharedPageTransition } from '@phoenix/ui/components/page-transition'

export default function PageTransition({ children }: { children: React.ReactNode }) {
  return <SharedPageTransition pathname={useLocation().pathname}>{children}</SharedPageTransition>
}
