import { AboutSection } from '@/pages/Settings/AboutSection'
import { useAccount } from '@/features/account/context'

export default function Settings() {
  const { cbgSyncEnabled, setCbgSyncEnabled, history, clearHistory, isLoading, historyWarning } = useAccount()
  return <div className="page-stack desktop-settings">
    <section className="work-panel p-4">
      <h2 className="section-heading">本机数据</h2>
      <label className="my-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={cbgSyncEnabled} onChange={event => setCbgSyncEnabled(event.target.checked)} />自动读取藏宝阁窗口中的商品</label>
      <p className="mb-4 text-sm text-muted-foreground">账号解析与御魂计算在本机完成，最近查询保存在此设备。</p>
      <button className="quiet-button" disabled={isLoading || !history.length} onClick={() => void clearHistory()}>清除本机查询记录</button>
      {historyWarning && <p role="status" className="mt-3 text-sm text-destructive">{historyWarning}</p>}
    </section>
    <AboutSection />
  </div>
}
