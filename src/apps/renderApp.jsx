import Files from './Files'
import Notepad from './Notepad'
import Terminal from './Terminal'
import AppCenter from './AppCenter'
import AIAssistant from './AIAssistant'
import Trash from './Trash'
import IframeApp from './IframeApp'
import Settings from './Settings'
import CodeEditor from './CodeEditor'
import Camera from './Camera'
import Recorder from './Recorder'
import PhotoViewer from './PhotoViewer'
import VideoPlayer from './VideoPlayer'
import MusicPlayer from './Music'
import ArchiveManager from './ArchiveManager'
import Browser from './Browser'
import Calculator from './Calculator'
import Paint from './Paint'
import DocumentViewer from './DocumentViewer'
import Calendar from './Calendar'
import WelcomeApp from './WelcomeApp'

export function renderApp(win) {
  const { appId, appType, context, id: windowId } = win
  switch (appType) {
    case 'files':        return <Files           windowId={windowId} context={context} />
    case 'notes':        return <Notepad         windowId={windowId} context={context} />
    case 'terminal':     return <Terminal        windowId={windowId} />
    case 'app-center':   return <AppCenter       windowId={windowId} />
    case 'ai':           return <AIAssistant     windowId={windowId} />
    case 'trash':        return <Trash           windowId={windowId} />
    case 'settings':     return <Settings        windowId={windowId} context={context} />
    case 'code-editor':  return <CodeEditor      windowId={windowId} context={context} />
    case 'camera':       return <Camera          windowId={windowId} />
    case 'recorder':     return <Recorder        windowId={windowId} />
    case 'photo-viewer': return <PhotoViewer     windowId={windowId} context={context} />
    case 'video-player': return <VideoPlayer     windowId={windowId} context={context} />
    case 'music':        return <MusicPlayer     windowId={windowId} />
    case 'archive-manager': return <ArchiveManager windowId={windowId} context={context} />
    case 'browser':      return <Browser         windowId={windowId} />
    case 'calculator':   return <Calculator      windowId={windowId} />
    case 'paint':        return <Paint           windowId={windowId} context={context} />
    case 'doc-viewer':   return <DocumentViewer  windowId={windowId} context={context} />
    case 'calendar':     return <Calendar        windowId={windowId} />
    case 'welcome':      return <WelcomeApp      windowId={windowId} context={context} />
    case 'iframe':       return <IframeApp       windowId={windowId} app={context?.app} />
    default:
      return (
        <div className="flex items-center justify-center h-full text-white/30 text-sm">
          Unknown app type: {appType}
        </div>
      )
  }
}
