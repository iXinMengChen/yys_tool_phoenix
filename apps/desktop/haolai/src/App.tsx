import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AccountProvider } from './features/account/context'
import FeaturePage from './pages/FeaturePage'
import AccountPage from './pages/AccountPage'
import { CbgWindowPage } from './pages/CbgWindow'
import AccountMatcher from './pages/AccountMatcher'
import Shell from './Workspace/Shell'
import Settings from './Workspace/Settings'

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/cbg-window" element={<CbgWindowPage />} />
        <Route element={<AccountProvider><Shell /></AccountProvider>}>
          <Route path="/" element={<AccountPage />} />
          <Route path="/speed" element={<FeaturePage feature="speed" />} />
          <Route path="/pve" element={<FeaturePage feature="pve" />} />
          <Route path="/hero-skills" element={<FeaturePage feature="hero-skills" />} />
          <Route path="/collections" element={<FeaturePage feature="collections" />} />
          <Route path="/calculator" element={<FeaturePage feature="calculator" />} />
          <Route path="/relics" element={<FeaturePage feature="relics" />} />
          <Route path="/account-matcher" element={<AccountMatcher />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<Navigate to="/settings" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
