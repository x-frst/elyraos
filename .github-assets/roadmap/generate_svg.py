import json
from pathlib import Path
from xml.sax.saxutils import escape

BASE_DIR = Path(__file__).parent

json_path = BASE_DIR / "roadmap.json"
svg_path = BASE_DIR / "roadmap.svg"

with open(json_path, encoding="utf-8") as f:
    data = json.load(f)

CARD_HEIGHT = 86
CARD_SPACING = 24
TOP_PADDING = 40

height = TOP_PADDING + (len(data) * (CARD_HEIGHT + CARD_SPACING)) + 40

svg = f'''<svg width="900" height="{height}" viewBox="0 0 900 {height}" xmlns="http://www.w3.org/2000/svg">

<defs>

  <!-- Background -->
  <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#f7dcff"/>
    <stop offset="25%" stop-color="#e4deff"/>
    <stop offset="50%" stop-color="#f8f8fb"/>
    <stop offset="75%" stop-color="#dfe7ff"/>
    <stop offset="100%" stop-color="#f6ddff"/>
  </linearGradient>

  <!-- Aurora -->
  <radialGradient id="leftGlow" cx="0%" cy="100%" r="70%">
    <stop offset="0%" stop-color="#ff4fd8" stop-opacity="0.28"/>
    <stop offset="100%" stop-color="#ff4fd8" stop-opacity="0"/>
  </radialGradient>

  <radialGradient id="rightGlow" cx="100%" cy="0%" r="70%">
    <stop offset="0%" stop-color="#5b8cff" stop-opacity="0.28"/>
    <stop offset="100%" stop-color="#5b8cff" stop-opacity="0"/>
  </radialGradient>

  <!-- Timeline -->
  <linearGradient id="timelineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#5b8cff"/>
    <stop offset="100%" stop-color="#d946ef"/>
  </linearGradient>

  <!-- Card Shadow -->
  <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="10" stdDeviation="18"
      flood-color="#9d8cff"
      flood-opacity="0.15"/>
  </filter>

  <!-- Node Glow -->
  <filter id="nodeGlow">
    <feGaussianBlur stdDeviation="4" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>

  <style>

    .title {{
      fill: #111827;
      font-size: 21px;
      font-weight: 700;
      font-family: Inter, Segoe UI, sans-serif;
    }}

    .desc {{
      fill: #5b6475;
      font-size: 14px;
      font-family: Inter, Segoe UI, sans-serif;
    }}

    .date {{
      fill: #3b82f6;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1.2px;
      font-family: Inter, Segoe UI, sans-serif;
    }}

    .card {{
      fill: rgba(255,255,255,0.26);
      stroke: rgba(255,255,255,0.55);
      stroke-width: 1.2;
    }}

    .cardHighlight {{
      fill: rgba(255,255,255,0.18);
    }}

    .timelineCore {{
      stroke: url(#timelineGradient);
      stroke-width: 3;
      stroke-linecap: round;
    }}

    .timelineGlow {{
      stroke: url(#timelineGradient);
      stroke-width: 10;
      opacity: 0.18;
      stroke-linecap: round;
    }}

    .completed {{
      fill: #14f195;
    }}

    .progress {{
      fill: #ffb020;
    }}

    .future {{
      fill: #b9bfd1;
    }}

    .tick {{
      stroke: white;
      stroke-width: 2.6;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }}

    .nodePulse {{
      animation: pulse 2.6s infinite;
      transform-origin: center;
    }}

    @keyframes pulse {{
      0% {{ opacity: 1; }}
      50% {{ opacity: 0.7; }}
      100% {{ opacity: 1; }}
    }}

  </style>

</defs>

<!-- Background -->
<rect width="100%" height="100%" fill="url(#bgGradient)"/>

<!-- Aurora -->
<rect width="100%" height="100%" fill="url(#leftGlow)"/>
<rect width="100%" height="100%" fill="url(#rightGlow)"/>

<!-- Timeline -->
<line x1="140" y1="70" x2="140" y2="{height - 70}" class="timelineGlow"/>
<line x1="140" y1="70" x2="140" y2="{height - 70}" class="timelineCore"/>
'''

y = 40

for item in data:
    status = escape(item["status"])
    title = escape(item["title"])
    desc = escape(item["desc"])
    date = escape(item["date"])

    center_y = y + (CARD_HEIGHT / 2)

    svg += f'''
<g filter="url(#cardShadow)">

  <!-- Card -->
  <rect x="190" y="{y}" width="620" height="{CARD_HEIGHT}" rx="24" class="card"/>
  <rect x="191" y="{y + 1}" width="618" height="28" rx="24" class="cardHighlight"/>

  <!-- Node -->
  <circle cx="140" cy="{center_y}" r="9"
          class="{status} nodePulse"
          filter="url(#nodeGlow)"/>
'''

    if status == "completed":
        tick_y = center_y

        svg += f"""
  <path d="M136 {tick_y}
           L140 {tick_y + 4}
           L147 {tick_y - 5}"
        class="tick"/>
"""

    svg += f'''

  <!-- Text -->
  <text x="225" y="{y + 22}" class="date">{date}</text>

  <text x="225" y="{y + 52}" class="title">
    {title}
  </text>

  <text x="225" y="{y + 78}" class="desc">
    {desc}
  </text>

</g>
'''

    y += CARD_HEIGHT + CARD_SPACING

svg += "</svg>"

with open(svg_path, "w", encoding="utf-8") as f:
    f.write(svg)
