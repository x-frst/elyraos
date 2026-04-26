import { BRANDING } from '../config.js'

export function generateWelcomeHtml(username) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to ${BRANDING.name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a18;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,Helvetica,Arial,sans-serif;line-height:1.65}
a{color:#818cf8;text-decoration:none}a:hover{color:#c4b5fd}
.hero{background:linear-gradient(145deg,#0f0a2e 0%,#180a3f 50%,#0a0a18 100%);padding:52px 40px 44px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07);position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(130,80,255,0.28) 0%,transparent 65%);pointer-events:none}
.hero-logo{font-size:72px;line-height:1;position:relative;filter:drop-shadow(0 0 30px rgba(130,80,255,0.6));margin-bottom:18px}
.hero h1{font-size:clamp(1.8rem,4vw,3rem);font-weight:800;letter-spacing:-0.03em;position:relative;margin-bottom:10px}
.hero h1 span{background:linear-gradient(90deg,#c4b5fd,#818cf8,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{color:rgba(255,255,255,0.5);font-size:1.05rem;max-width:520px;margin:0 auto;position:relative}
.badge{display:inline-flex;align-items:center;gap:6px;background:rgba(130,80,255,0.18);border:1px solid rgba(130,80,255,0.35);border-radius:20px;padding:4px 14px;font-size:12px;font-weight:600;color:#c4b5fd;margin-bottom:18px;position:relative}
section{max-width:860px;margin:0 auto;padding:36px 28px}
h2{font-size:1.25rem;font-weight:700;margin-bottom:20px;display:flex;align-items:center;gap:10px;color:#fff}
h2 .line{flex:1;height:1px;background:rgba(255,255,255,0.08)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin-bottom:16px}
.card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;transition:border-color 0.2s,background 0.2s}
.card:hover{background:rgba(255,255,255,0.07);border-color:rgba(130,80,255,0.35)}
.card-head{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.card-emoji{font-size:26px;line-height:1}
.card-title{font-weight:700;font-size:14px;color:#fff}
.card-desc{font-size:12.5px;color:rgba(255,255,255,0.5);line-height:1.6}
.start-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.start-item{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px}
.start-num{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,rgba(130,80,255,0.7),rgba(99,102,241,0.7));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-bottom:10px}
.start-title{font-weight:600;font-size:13px;margin-bottom:4px;color:#fff}
.start-desc{font-size:12px;color:rgba(255,255,255,0.45)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.35);border-bottom:1px solid rgba(255,255,255,0.08)}
td{padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.75)}
tr:hover td{background:rgba(255,255,255,0.03)}
kbd{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:5px;padding:2px 7px;font-family:monospace;font-size:12px;color:#e2e8f0}
.tips{display:flex;flex-direction:column;gap:10px}
.tip{display:flex;align-items:flex-start;gap:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px}
.tip-icon{font-size:20px;flex-shrink:0;margin-top:1px}
.tip-text{font-size:13px;color:rgba(255,255,255,0.65);line-height:1.55}
.tip-text strong{color:#fff}
.divider{height:1px;background:rgba(255,255,255,0.06);max-width:860px;margin:0 auto}
.footer{text-align:center;padding:30px 20px 40px;color:rgba(255,255,255,0.22);font-size:12.5px}
.footer span{color:#818cf8}
.tag{display:inline-block;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.35);border-radius:8px;padding:2px 10px;font-size:11px;font-weight:600;color:#a5b4fc;margin:2px}
.highlight{background:rgba(130,80,255,0.12);border-left:3px solid rgba(130,80,255,0.7);border-radius:0 10px 10px 0;padding:14px 18px;font-size:13px;color:rgba(255,255,255,0.7);line-height:1.65}
.mockup{background:#060614;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:0;overflow:hidden;margin-top:12px}
.mockup-bar{background:rgba(0,0,0,0.5);border-bottom:1px solid rgba(255,255,255,0.07);padding:8px 12px;display:flex;align-items:center;gap:8px}
.dot{width:10px;height:10px;border-radius:50%}
.mockup-content{padding:12px;font-family:monospace;font-size:12px;color:#a5f3fc}
</style>
</head>
<body>

<div class="hero">
  <div class="badge">${BRANDING.logoEmoji} ${BRANDING.name} — Cloud-Native Web OS</div>
  <div class="hero-logo">${BRANDING.logoEmoji}</div>
  <h1>Welcome to ${BRANDING.name}, <span>${username}</span>!</h1>
  <p>Your personal cloud-based operating system. Everything you need — files, apps, and your data — anywhere you go.</p>
</div>

<section>
  <h2>🚀 Getting Started <span class="line"></span></h2>
  <div class="start-grid">
    <div class="start-item">
      <div class="start-num">1</div>
      <div class="start-title">Open My Files</div>
      <div class="start-desc">Click the files icon in the Dock or right-click the Desktop to browse your cloud storage.</div>
    </div>
    <div class="start-item">
      <div class="start-num">2</div>
      <div class="start-title">Explore the Dock</div>
      <div class="start-desc">The Dock at the bottom holds your favourite apps. Hover to see names, click to launch.</div>
    </div>
    <div class="start-item">
      <div class="start-num">3</div>
      <div class="start-title">Right-Click Anywhere</div>
      <div class="start-desc">Right-click the Desktop or inside My Files for contextual actions like "New Folder" or "Open".</div>
    </div>
    <div class="start-item">
      <div class="start-num">4</div>
      <div class="start-title">Use the Start Menu</div>
      <div class="start-desc">Click the ${BRANDING.name} logo bottom-left to open the Start Menu — search and launch any app instantly.</div>
    </div>
    <div class="start-item">
      <div class="start-num">5</div>
      <div class="start-title">Customize Settings</div>
      <div class="start-desc">Head to Settings to change your wallpaper, accent colour, dock, and account preferences.</div>
    </div>
    <div class="start-item">
      <div class="start-num">6</div>
      <div class="start-title">Multi-Window Mode</div>
      <div class="start-desc">Drag, resize, minimize, and snap windows — work with as many apps open as you like.</div>
    </div>
  </div>
</section>

<div class="divider"></div>

<section>
  <h2>📱 Your Apps <span class="line"></span></h2>
  <div class="cards">
    <div class="card">
      <div class="card-head"><span class="card-emoji">🗂️</span><span class="card-title">My Files</span></div>
      <div class="card-desc">Full cloud file manager. Create folders, upload, rename, move, copy, delete. Grid &amp; list views, keyboard navigation, drag &amp; drop, and quick search.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">📝</span><span class="card-title">Notepad</span></div>
      <div class="card-desc">Write notes, journals, or plain text files. Auto-saved to your personal cloud. Supports UTF-8 encoding and word-wrap.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">💻</span><span class="card-title">Code Editor</span></div>
      <div class="card-desc">Syntax-highlighted code editor for JavaScript, TypeScript, Python, HTML, CSS, JSON, and more. Open any code file directly from My Files.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">⚡</span><span class="card-title">Terminal</span></div>
      <div class="card-desc">Shell-like terminal for power users. Commands: ls, cd, mkdir, touch, cat, rm, mv, cp, echo, clear, pwd, find, and more.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">🤖</span><span class="card-title">AI Assistant</span></div>
      <div class="card-desc">Ask anything — get answers, code snippets, writing help, explanations, or creative ideas. Powered by advanced AI models.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">🌐</span><span class="card-title">Browser</span></div>
      <div class="card-desc">Built-in web browser. Navigate to any URL, search the web, and return to previously visited pages. Runs right inside ${BRANDING.name}.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">🎨</span><span class="card-title">Paint</span></div>
      <div class="card-desc">Digital art application. Draw with pencil, fill areas, add shapes and text. Undo/redo history, colour picker, and save to cloud.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">🖼️</span><span class="card-title">Photo Viewer</span></div>
      <div class="card-desc">View JPG, PNG, GIF, WebP, and SVG images. Zoom, rotate, flip. Slideshow mode. Set any photo as your Desktop wallpaper instantly.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">🎵</span><span class="card-title">Music Player</span></div>
      <div class="card-desc">Play MP3, WAV, OGG files from your cloud storage, or tune into 6 built-in internet radio stations. Features an animated waveform visualizer.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">🎬</span><span class="card-title">Video Player</span></div>
      <div class="card-desc">Watch MP4, WebM, and OGG videos. Adjust playback speed, toggle Picture-in-Picture mode, loop, and browse your video library.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">📅</span><span class="card-title">Calendar</span></div>
      <div class="card-desc">Add events with titles, locations, and notes. Navigate months, jump to any date, and check your upcoming schedule at a glance.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">📄</span><span class="card-title">Doc Viewer</span></div>
      <div class="card-desc">Opens PDFs, HTML pages, Markdown, CSV, Excel-style spreadsheets, and plain text. This document is displayed using Doc Viewer!</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">📦</span><span class="card-title">Archive Manager</span></div>
      <div class="card-desc">Browse the contents of ZIP archives, extract files and folders, or compress selected files into a new archive with one click.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">📷</span><span class="card-title">Camera</span></div>
      <div class="card-desc">Capture photos or record video using your device camera. All captures save automatically to your cloud storage in My Files.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">🧮</span><span class="card-title">Calculator</span></div>
      <div class="card-desc">Clean, fast, and keyboard-friendly. Handles all standard arithmetic, percentages, and chain calculations with live result display.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">⚙️</span><span class="card-title">Settings</span></div>
      <div class="card-desc">Personalize your OS: pick wallpapers, accent colours, change dock size, update timezone display, and manage your account in Danger Zone.</div>
    </div>
  </div>
</section>

<div class="divider"></div>

<section>
  <h2>🏪 App Center <span class="line"></span></h2>
  <div class="highlight" style="margin-bottom:20px">
    <strong style="color:#fff">App Center is ${BRANDING.name}'s built-in app store</strong> — your gateway to extending the OS with third-party web apps. Browse categories, read descriptions, install apps to your Desktop, and uninstall them at any time. All apps run natively inside ${BRANDING.name} windows.
  </div>

  <!-- Category cards -->
  <div class="cards" style="margin-bottom:20px">
    <div class="card">
      <div class="card-head"><span class="card-emoji">🎮</span><span class="card-title">Games</span></div>
      <div class="card-desc">Browser-based games that run right inside a ${BRANDING.name} window — puzzles, arcades, strategy, and more.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">💼</span><span class="card-title">Productivity</span></div>
      <div class="card-desc">Task managers, kanban boards, timers, and other tools to help you stay focused and organized.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">🎨</span><span class="card-title">Photo &amp; Video</span></div>
      <div class="card-desc">Creative tools for editing images, creating slideshows, designing graphics, and video effects.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">💻</span><span class="card-title">Developer Tools</span></div>
      <div class="card-desc">JSON formatters, regex testers, diff viewers, API explorers, and other utilities for developers.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">✏️</span><span class="card-title">Graphics &amp; Design</span></div>
      <div class="card-desc">Whiteboards, diagramming tools, wireframe editors, and vector drawing apps.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-emoji">🔧</span><span class="card-title">Utilities</span></div>
      <div class="card-desc">Unit converters, password generators, color pickers, clocks, and other everyday helper apps.</div>
    </div>
  </div>

  <!-- How it works -->
  <div class="mockup">
    <div class="mockup-bar">
      <div class="dot" style="background:#ef4444"></div>
      <div class="dot" style="background:#f59e0b"></div>
      <div class="dot" style="background:#22c55e"></div>
      <span style="margin-left:8px;font-size:11px;color:rgba(255,255,255,0.3)">App Center — ${BRANDING.name}</span>
    </div>
    <div class="mockup-content" style="display:flex;gap:0;padding:0">
      <div style="width:110px;border-right:1px solid rgba(255,255,255,0.08);padding:10px 8px;font-size:11px;flex-shrink:0">
        <div style="color:rgba(130,80,255,1);background:rgba(130,80,255,0.2);border-radius:8px;padding:4px 8px;margin-bottom:4px">🏠 Home</div>
        <div style="color:rgba(255,255,255,0.4);padding:4px 8px;margin-bottom:2px">📥 My Apps</div>
        <div style="color:rgba(255,255,255,0.4);padding:4px 8px;margin-bottom:2px">🎮 Games</div>
        <div style="color:rgba(255,255,255,0.4);padding:4px 8px;margin-bottom:2px">💼 Productivity</div>
        <div style="color:rgba(255,255,255,0.4);padding:4px 8px;margin-bottom:2px">🎨 Design</div>
        <div style="color:rgba(255,255,255,0.4);padding:4px 8px">💻 Dev Tools</div>
      </div>
      <div style="flex:1;padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;align-content:start">
        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;margin-bottom:4px">🎮</div><div style="font-size:10px;color:#fff;font-weight:600">Pixel Quest</div>
          <div style="margin-top:6px;background:rgba(130,80,255,0.6);border-radius:6px;padding:2px 0;font-size:9px;color:#fff;font-weight:700">Install</div>
        </div>
        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;margin-bottom:4px">📊</div><div style="font-size:10px;color:#fff;font-weight:600">DataViz Pro</div>
          <div style="margin-top:6px;background:rgba(130,80,255,0.6);border-radius:6px;padding:2px 0;font-size:9px;color:#fff;font-weight:700">Install</div>
        </div>
        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;margin-bottom:4px">🌍</div><div style="font-size:10px;color:#fff;font-weight:600">GeoSphere</div>
          <div style="margin-top:6px;background:rgba(130,80,255,0.6);border-radius:6px;padding:2px 0;font-size:9px;color:#fff;font-weight:700">Install</div>
        </div>
      </div>
    </div>
  </div>

  <div class="tips" style="margin-top:16px">
    <div class="tip">
      <div class="tip-icon">⬇️</div>
      <div class="tip-text"><strong>Install to Desktop</strong> — click Install on any app and it appears as an icon on your Desktop and in the Start Menu immediately.</div>
    </div>
    <div class="tip">
      <div class="tip-icon">📥</div>
      <div class="tip-text"><strong>My Apps tab</strong> — view all your installed apps in one place. Uninstall any of them with a single click from the app card.</div>
    </div>
    <div class="tip">
      <div class="tip-icon">🔍</div>
      <div class="tip-text"><strong>Search &amp; browse</strong> — use the search bar to find apps by name or keyword, or browse by category using the left sidebar.</div>
    </div>
  </div>
</section>

<div class="divider"></div>

<section>
  <h2>🖥️ The Desktop <span class="line"></span></h2>
  <p style="font-size:13.5px;color:rgba(255,255,255,0.55);margin-bottom:16px;line-height:1.7">
    The Desktop is your home base. Files and folders saved to your <strong style="color:#fff">Desktop</strong> folder in My Files appear here automatically. 
    Right-click to create new items, change the wallpaper, or access display settings.
  </p>
  <div class="mockup">
    <div class="mockup-bar">
      <div class="dot" style="background:#ef4444"></div>
      <div class="dot" style="background:#f59e0b"></div>
      <div class="dot" style="background:#22c55e"></div>
      <span style="margin-left:8px;font-size:11px;color:rgba(255,255,255,0.3)">Desktop — ${BRANDING.name}</span>
    </div>
    <div class="mockup-content">
      <span style="color:#c4b5fd">📁</span> Desktop/  <span style="color:rgba(255,255,255,0.3)">← Files here appear on your Desktop</span><br>
      <span style="color:#c4b5fd">📁</span> Documents/<br>
      <span style="color:#c4b5fd">📁</span> Pictures/<br>
      <span style="color:#6ee7b7">📄</span> Welcome to ${BRANDING.name}.html  <span style="color:rgba(255,255,255,0.3)">← You are reading this file!</span>
    </div>
  </div>
</section>

<div class="divider"></div>

<section>
  <h2>⌨️ Keyboard Shortcuts <span class="line"></span></h2>
  <table>
    <thead><tr><th>Action</th><th>Shortcut</th><th>Context</th></tr></thead>
    <tbody>
      <tr><td>Rename selected item</td><td><kbd>F2</kbd></td><td>My Files</td></tr>
      <tr><td>Delete selected item</td><td><kbd>Del</kbd></td><td>My Files</td></tr>
      <tr><td>Select all</td><td><kbd>Ctrl</kbd> + <kbd>A</kbd></td><td>My Files</td></tr>
      <tr><td>Copy</td><td><kbd>Ctrl</kbd> + <kbd>C</kbd></td><td>My Files</td></tr>
      <tr><td>Paste</td><td><kbd>Ctrl</kbd> + <kbd>V</kbd></td><td>My Files</td></tr>
      <tr><td>Navigate up (go to parent)</td><td><kbd>Backspace</kbd></td><td>My Files</td></tr>
      <tr><td>Save file</td><td><kbd>Ctrl</kbd> + <kbd>S</kbd></td><td>Notepad, Code Editor</td></tr>
      <tr><td>Undo</td><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td><td>Notepad, Code Editor, Paint</td></tr>
      <tr><td>Redo</td><td><kbd>Ctrl</kbd> + <kbd>Y</kbd></td><td>Notepad, Code Editor, Paint</td></tr>
      <tr><td>Close window</td><td><kbd>Alt</kbd> + <kbd>F4</kbd></td><td>Any window</td></tr>
      <tr><td>Minimize window</td><td><kbd>Alt</kbd> + <kbd>–</kbd></td><td>Any window</td></tr>
      <tr><td>Clear terminal</td><td><kbd>Ctrl</kbd> + <kbd>L</kbd></td><td>Terminal</td></tr>
      <tr><td>Play / Pause</td><td><kbd>Space</kbd></td><td>Music, Video Player</td></tr>
      <tr><td>Volume up / down</td><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>Music, Video Player</td></tr>
    </tbody>
  </table>
</section>

<div class="divider"></div>

<section>
  <h2>💡 Tips &amp; Tricks <span class="line"></span></h2>
  <div class="tips">
    <div class="tip">
      <div class="tip-icon">🗂️</div>
      <div class="tip-text"><strong>Drag &amp; drop files</strong> between folders in My Files — or drag from your local machine directly into the browser window to upload.</div>
    </div>
    <div class="tip">
      <div class="tip-icon">🖱️</div>
      <div class="tip-text"><strong>Right-click contextual menus</strong> are everywhere — on the Desktop, inside My Files, and on files for quick actions like Open, Rename, Copy, Delete.</div>
    </div>
    <div class="tip">
      <div class="tip-icon">🎨</div>
      <div class="tip-text"><strong>Personalize your wallpaper</strong> any time: Open Photo Viewer with an image, then use the "Set as Wallpaper" button — or go directly to Settings.</div>
    </div>
    <div class="tip">
      <div class="tip-icon">🖥️</div>
      <div class="tip-text"><strong>Multitask freely</strong> — open as many windows as you want, drag them around, resize them. Use the Dock to switch between running apps instantly.</div>
    </div>
    <div class="tip">
      <div class="tip-icon">📁</div>
      <div class="tip-text"><strong>System folders</strong> like Documents, Pictures, Videos, Music, Downloads, and Projects are created automatically and show with unique icons in the sidebar.</div>
    </div>
    <div class="tip">
      <div class="tip-icon">☁️</div>
      <div class="tip-text"><strong>Everything is cloud-synced</strong> — your files, settings, and preferences are saved to your account and accessible from any device or browser.</div>
    </div>
    <div class="tip">
      <div class="tip-icon">🤖</div>
      <div class="tip-text"><strong>Ask the AI Assistant anything</strong> — need help coding, writing an email, explaining a concept, or getting ideas? Open the AI app and start chatting.</div>
    </div>
    <div class="tip">
      <div class="tip-icon">📦</div>
      <div class="tip-text"><strong>Archive Manager</strong> lets you zip up project folders before sharing, or unpack downloaded ZIP files to explore their contents inside ${BRANDING.name}.</div>
    </div>
  </div>
</section>

<div class="divider"></div>

<div class="footer">
  <div style="font-size:32px;margin-bottom:8px">${BRANDING.logoEmoji}</div>
  <div style="font-size:14px;color:rgba(255,255,255,0.5);margin-bottom:10px">
    <strong style="color:#fff">${BRANDING.name} v${BRANDING.version}</strong> — A cloud-native web operating system
  </div>
  <div>
    <span class="tag">⚡ React 18</span>
    <span class="tag">🎨 Tailwind CSS</span>
    <span class="tag">✨ Framer Motion</span>
    <span class="tag">☁️ Cloud Sync</span>
    <span class="tag">🔒 Secure Auth</span>
  </div>
  <div style="margin-top:16px;color:rgba(255,255,255,0.2)">
    This document was automatically created for <span style="color:#818cf8">${username}</span> on first sign-up.<br>
    You can find it in <strong style="color:rgba(255,255,255,0.4)">My Files → Home</strong>.
  </div>
</div>

</body>
</html>`
}
