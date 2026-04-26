import { useStore } from '../store/useStore'
import Window from './Window'

export default function WindowManager() {
  const windows = useStore(s => s.windows)

  return (
    <>
      {windows.map(win => (
        <Window key={win.id} win={win} />
      ))}
    </>
  )
}
