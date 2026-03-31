# myaibrain.org — SEO Workflow to #1
**Target:** AI agent memory / MCP memory server niche  
**Timeline:** 90–180 days to category dominance  
**Stack:** Cloudflare Pages + PyPI + GitHub already live

---

## Asset Inventory (Current State)

| Asset | DA | Status | SEO Value |
|---|---|---|---|
| github.com/sindecker/aibrain | 95 | ✅ Live | Tier 1 backlink |
| pypi.org/project/aibrain | 91 | ✅ Live | Tier 1 backlink |
| myaibrain.org | ~1 | ✅ Live | Building |
| Structured data + sitemap + OG | — | ✅ Done | Foundation |
| Google Search Console | — | ❌ Missing | Critical |
| Blog / content | — | ❌ Missing | Primary lever |

**Key insight:** You already have two DA 90+ backlinks pointing at your domain before day one. Most new sites spend months acquiring these. Your trust baseline is unusually strong — the domain age gap is the only real constraint.

---

## Phase 0: One-Time Setup SOP (Days 0–3)

### 0.1 Google Search Console
1. Go to search.google.com/search-console
2. Add property → Domain → `myaibrain.org`
3. Verify via Cloudflare DNS TXT record (fastest method)
4. Submit sitemap: `https://myaibrain.org/sitemap.xml`
5. Request indexing on: `/`, `/docs`, `/pricing` (or whatever main pages exist)
6. Enable email alerts for coverage errors

### 0.2 Bing Webmaster Tools
1. webmaster.bing.com → Import from GSC (auto-syncs)
2. Submit sitemap
3. ~8–10% of search traffic, zero extra work after import

### 0.3 Google Analytics 4
1. Create GA4 property → get Measurement ID (G-XXXXXXXXXX)
2. Add to Cloudflare Pages via `_headers` or inject via `<head>`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```
3. Set up conversion event: `purchase` (Stripe webhook → GA4 Measurement Protocol)

### 0.4 Brand Claim (Social Footprint)
Claim these now — brand searches check social presence:
- [ ] Twitter/X: @myaibrain or @aibrainorg
- [ ] Reddit: u/myaibrain (also post to r/LocalLLaMA, r/ClaudeAI)
- [ ] dev.to: myaibrain organization
- [ ] HackerNews: register `myaibrain` username
- [ ] IndieHackers: create product page
- [ ] ProductHunt: draft product (don't launch yet — save for major milestone)

### 0.5 Schema Validation
Run these and fix any errors before content push:
- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema.org validator: https://validator.schema.org
- Core Web Vitals: https://pagespeed.web.dev (target LCP < 2.5s, CLS < 0.1)

---

## Phase 1: Content Architecture (Days 3–14)

### Keyword-to-Page Mapping

**Pillar Pages (permanent, high-value)**

| URL | Primary Keyword | Secondary Keywords | Intent |
|---|---|---|---|
| `/` | ai agent memory | aibrain, myaibrain | Brand + category |
| `/docs/` | MCP memory server | persistent memory for AI agents | Technical |
| `/docs/quickstart` | how to give AI agent memory | brain for Claude Code | Tutorial |
| `/compare/` | ai brain marketplace | AgentOS vs Mem0 vs Letta | Comparison |
| `/use-cases/` | AI agent operating system | portable AI memory | Discovery |

**Blog Posts — First 90 Days**  
Order = priority. Write these in sequence, one per week minimum.

| # | Title | Target Keyword | Competition | Est. Timeline to Rank |
|---|---|---|---|---|
| 1 | How to Give Your AI Agent Persistent Memory | how to give AI agent memory | Low | 30–60 days |
| 2 | MCP Memory Server: What It Is and Why Your Agent Needs One | MCP memory server | Low-Med | 30–60 days |
| 3 | Brain for Claude Code: Long-Term Memory for Your Dev Assistant | brain for Claude Code | Low | 20–45 days |
| 4 | AI Agent That Learns: Building Persistent Intelligence | AI agent that learns | Med | 45–90 days |
| 5 | Portable AI Memory: One Brain, Every Agent | portable AI memory | Low | 30–60 days |
| 6 | AI Agent Operating System: What It Is and Who Builds It | AI agent operating system | Med | 60–90 days |
| 7 | Mem0 vs Letta vs aibrain: AI Agent Memory Compared | AI agent memory | Med-High | 90–120 days |
| 8 | SQLite vs Vector DB for AI Agent Memory | persistent memory for AI agents | Low | 45–90 days |
| 9 | Building an AI Brain Marketplace: Architecture Deep Dive | AI brain marketplace | Low | 30–60 days |
| 10 | AgentOS: The Missing Layer Between AI and Applications | AI agent brain | Med | 60–90 days |

### Content Quality Standards
Each post must have:
- **Minimum 1,500 words** (long-tail posts), **2,500+ for category pages**
- **Code examples** — your audience is developers, code = dwell time
- **H2/H3 structure** aligned to FAQ schema (target featured snippets)
- **Internal links** — every post links to `/docs/quickstart` and `/`
- **CTA** — every post ends with `pip install aibrain` or free tier signup

---

## Phase 2: Automated Python Pipeline

### File Structure
```
seo/
├── config.py           # API keys, target keywords, site URL
├── rank_tracker.py     # Daily SERP position checks
├── gsc_puller.py       # Pull GSC clicks/impressions/CTR
├── sitemap_updater.py  # Auto-update sitemap on new content
├── content_brief.py    # Generate AI-assisted content briefs
├── backlink_monitor.py # Track new/lost backlinks
├── weekly_report.py    # Aggregate weekly SEO digest
└── scheduler.py        # Cron/aibrain task runner
```

### config.py
```python
TARGET_SITE = "myaibrain.org"
TARGET_KEYWORDS = [
    "ai agent memory",
    "MCP memory server", 
    "persistent memory for AI agents",
    "how to give AI agent memory",
    "brain for Claude Code",
    "AI agent that learns",
    "portable AI memory",
    "AI agent operating system",
    "AI brain marketplace",
    "aibrain",
    "myaibrain",
]
SERPAPI_KEY = ""  # https://serpapi.com (100 free searches/month)
GSC_CREDENTIALS = "gsc_credentials.json"
SITEMAP_PATH = "/path/to/your/sitemap.xml"
SITEMAP_URL = "https://myaibrain.org/sitemap.xml"
```

### rank_tracker.py
```python
import requests
import json
import sqlite3
from datetime import date
from config import TARGET_KEYWORDS, TARGET_SITE, SERPAPI_KEY

def check_rank(keyword: str) -> dict:
    """Check Google SERP position for a keyword."""
    params = {
        "q": keyword,
        "api_key": SERPAPI_KEY,
        "num": 100,
        "gl": "us",
        "hl": "en",
    }
    resp = requests.get("https://serpapi.com/search", params=params)
    data = resp.json()
    
    position = None
    for i, result in enumerate(data.get("organic_results", []), 1):
        if TARGET_SITE in result.get("link", ""):
            position = i
            break
    
    return {
        "keyword": keyword,
        "position": position,
        "date": str(date.today()),
        "url": next(
            (r["link"] for r in data.get("organic_results", []) 
             if TARGET_SITE in r.get("link", "")),
            None
        )
    }

def store_rankings(results: list[dict]):
    conn = sqlite3.connect("seo_rankings.db")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS rankings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT,
            position INTEGER,
            url TEXT,
            date TEXT
        )
    """)
    conn.executemany(
        "INSERT INTO rankings (keyword, position, url, date) VALUES (?,?,?,?)",
        [(r["keyword"], r["position"], r["url"], r["date"]) for r in results]
    )
    conn.commit()
    conn.close()

def run_daily_check():
    results = [check_rank(kw) for kw in TARGET_KEYWORDS]
    store_rankings(results)
    
    # Print summary
    ranked = [r for r in results if r["position"]]
    print(f"[{date.today()}] Ranked for {len(ranked)}/{len(results)} keywords")
    for r in sorted(ranked, key=lambda x: x["position"]):
        print(f"  #{r['position']:3d} — {r['keyword']}")
    not_ranked = [r["keyword"] for r in results if not r["position"]]
    if not_ranked:
        print(f"  Not ranking: {', '.join(not_ranked)}")

if __name__ == "__main__":
    run_daily_check()
```

### gsc_puller.py
```python
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from datetime import date, timedelta
import json
from config import GSC_CREDENTIALS, TARGET_SITE

def get_gsc_service():
    creds = Credentials.from_service_account_file(
        GSC_CREDENTIALS,
        scopes=["https://www.googleapis.com/auth/webmasters.readonly"]
    )
    return build("searchconsole", "v1", credentials=creds)

def pull_top_queries(days: int = 28) -> list[dict]:
    """Pull top queries by clicks from GSC."""
    service = get_gsc_service()
    end_date = date.today() - timedelta(days=3)  # GSC has 3-day lag
    start_date = end_date - timedelta(days=days)
    
    response = service.searchanalytics().query(
        siteUrl=f"sc-domain:{TARGET_SITE}",
        body={
            "startDate": str(start_date),
            "endDate": str(end_date),
            "dimensions": ["query"],
            "rowLimit": 100,
        }
    ).execute()
    
    return [
        {
            "query": row["keys"][0],
            "clicks": row["clicks"],
            "impressions": row["impressions"],
            "ctr": round(row["ctr"] * 100, 2),
            "position": round(row["position"], 1),
        }
        for row in response.get("rows", [])
    ]

def pull_coverage_issues() -> list[dict]:
    """Pull URL coverage errors."""
    service = get_gsc_service()
    response = service.urlInspection().index().inspect(
        body={"inspectionUrl": f"https://{TARGET_SITE}/", "siteUrl": f"sc-domain:{TARGET_SITE}"}
    ).execute()
    return response

if __name__ == "__main__":
    queries = pull_top_queries()
    print(f"Top queries (last 28 days):")
    for q in queries[:20]:
        print(f"  pos {q['position']:5.1f} | {q['clicks']:4d} clicks | {q['ctr']:5.1f}% CTR | {q['query']}")
```

### sitemap_updater.py
```python
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path
import requests
from config import SITEMAP_PATH, SITEMAP_URL, TARGET_SITE

def add_url_to_sitemap(url: str, priority: float = 0.7, changefreq: str = "weekly"):
    """Add a new URL to sitemap.xml."""
    tree = ET.parse(SITEMAP_PATH)
    root = tree.getroot()
    ns = "http://www.sitemaps.org/schemas/sitemap/0.9"
    
    # Check if URL already exists
    existing = [url_el.find(f"{{{ns}}}loc").text for url_el in root.findall(f"{{{ns}}}url")]
    if url in existing:
        print(f"URL already in sitemap: {url}")
        return
    
    url_el = ET.SubElement(root, f"{{{ns}}}url")
    ET.SubElement(url_el, f"{{{ns}}}loc").text = url
    ET.SubElement(url_el, f"{{{ns}}}lastmod").text = str(date.today())
    ET.SubElement(url_el, f"{{{ns}}}changefreq").text = changefreq
    ET.SubElement(url_el, f"{{{ns}}}priority").text = str(priority)
    
    ET.indent(tree, space="  ")
    tree.write(SITEMAP_PATH, xml_declaration=True, encoding="utf-8")
    print(f"Added to sitemap: {url}")

def ping_search_engines():
    """Notify Google and Bing of sitemap update."""
    google = f"https://www.google.com/ping?sitemap={SITEMAP_URL}"
    bing = f"https://www.bing.com/ping?sitemap={SITEMAP_URL}"
    for engine, url in [("Google", google), ("Bing", bing)]:
        r = requests.get(url)
        print(f"Pinged {engine}: {r.status_code}")

if __name__ == "__main__":
    # Example: add a new blog post
    add_url_to_sitemap(
        f"https://{TARGET_SITE}/blog/how-to-give-ai-agent-memory",
        priority=0.8,
        changefreq="monthly"
    )
    ping_search_engines()
```

### weekly_report.py
```python
from rank_tracker import check_rank, TARGET_KEYWORDS
from gsc_puller import pull_top_queries
from datetime import date
import sqlite3

def generate_weekly_report() -> str:
    lines = [f"# SEO Weekly Report — {date.today()}", ""]
    
    # Rankings
    lines.append("## Rank Tracker")
    current = [check_rank(kw) for kw in TARGET_KEYWORDS]
    
    conn = sqlite3.connect("seo_rankings.db")
    lines.append(f"{'Keyword':<45} {'Now':>5} {'7d ago':>7} {'Delta':>6}")
    lines.append("-" * 65)
    for r in sorted(current, key=lambda x: x["position"] or 999):
        # Get last week's position
        row = conn.execute(
            "SELECT position FROM rankings WHERE keyword=? ORDER BY date DESC LIMIT 1 OFFSET 7",
            (r["keyword"],)
        ).fetchone()
        prev = row[0] if row else None
        pos = r["position"] or "-"
        delta = ""
        if r["position"] and prev:
            diff = prev - r["position"]  # positive = improved
            delta = f"{'▲' if diff > 0 else '▼'}{abs(diff)}" if diff != 0 else "—"
        lines.append(f"{r['keyword']:<45} {str(pos):>5} {str(prev or '-'):>7} {delta:>6}")
    conn.close()
    
    # GSC top queries
    lines.append("\n## Top GSC Queries (last 28 days)")
    try:
        queries = pull_top_queries()[:10]
        for q in queries:
            lines.append(f"  #{q['position']:5.1f} | {q['clicks']:4d}c | {q['ctr']:4.1f}% CTR | {q['query']}")
    except Exception as e:
        lines.append(f"  GSC pull failed: {e}")
    
    report = "\n".join(lines)
    print(report)
    
    # Save report
    with open(f"reports/seo_{date.today()}.md", "w") as f:
        f.write(report)
    
    return report

if __name__ == "__main__":
    generate_weekly_report()
```

### scheduler.py (Run as aibrain recurring task)
```python
import schedule
import time
from rank_tracker import run_daily_check
from weekly_report import generate_weekly_report
from sitemap_updater import ping_search_engines

# Daily: rank check
schedule.every().day.at("06:00").do(run_daily_check)

# Weekly: full report
schedule.every().monday.at("07:00").do(generate_weekly_report)

# Weekly: sitemap ping (keep fresh in Google's index)
schedule.every().wednesday.at("08:00").do(ping_search_engines)

if __name__ == "__main__":
    print("SEO scheduler running...")
    while True:
        schedule.run_pending()
        time.sleep(60)
```

### Dependencies
```
pip install requests google-api-python-client google-auth schedule serpapi
```

---

## Phase 3: Backlink Acquisition SOP

### Tier 1 — Already Owned (DA 90+)
| Source | Status | Action |
|---|---|---|
| pypi.org/project/aibrain | ✅ Live | Ensure description links to myaibrain.org with anchor "AI agent memory" |
| github.com/sindecker/aibrain | ✅ Live | README: prominent link to myaibrain.org, badge linking to docs |

**Immediate fix on both:** Check that the linked URLs use exact anchor text containing target keywords, not just bare URLs.

### Tier 2 — Quick Wins (Week 1–2)
| Source | DA | Method | Anchor Text Target |
|---|---|---|---|
| dev.to | 76 | Publish "How to Give Your AI Agent Memory" article → canonical to your blog | "persistent memory for AI agents" |
| HackerNews | 88 | Show HN: "I built a persistent memory OS for AI agents" | bare URL |
| Reddit r/LocalLLaMA | 91 | "I built an MCP memory server..." post with GitHub link | bare URL |
| Reddit r/ClaudeAI | 91 | "Brain for Claude Code" post | bare URL |
| IndieHackers | 72 | Product page, milestone posts | "AI agent memory" |
| awesome-mcp-servers (GitHub) | 95 | Submit PR to any active awesome-mcp list | "MCP memory server" |

### Tier 3 — Build Over 90 Days
| Source | DA | Method |
|---|---|---|
| awesome-ai-agents (GitHub) | 90+ | PR to add aibrain to agent memory section |
| Hugging Face | 95 | Create a Space or dataset card mentioning aibrain |
| ProductHunt | 81 | Full launch (coordinate with v1.0 milestone) |
| dev.to weekly digest | 76 | 1 article/week cross-posted (canonical = your site) |
| Stack Overflow | 98 | Answer questions about "AI agent memory" → link to docs |
| Medium | 95 | Cross-post articles (canonical = your site) |

### Backlink Outreach Template (Email/DM)
```
Subject: aibrain — MCP memory server for [their agent/tool]

Hey [name],

I noticed [their project] doesn't have a persistent memory layer — I just 
shipped aibrain (pip install aibrain), an MCP-native memory OS for AI agents.

One integration, any agent has: session memory, long-term recall, 
knowledge graphs, cross-session learning.

Repo: github.com/sindecker/aibrain
Docs: myaibrain.org/docs

Happy to add a [their project] integration guide if useful.
— Decker
```

---

## Phase 4: aibrain as Its Own SEO Agent

Dogfood the product. Wire these as recurring aibrain tasks:

### Task 1: Daily Rank Monitor
```python
# aibrain task: "seo_rank_check"
# Schedule: daily 06:00
# Description: Run rank_tracker.py, store results, alert if position changes > 3

task = {
    "name": "seo_rank_check",
    "schedule": "0 6 * * *",
    "command": "python seo/rank_tracker.py",
    "alert_on": "position_delta > 3",
    "memory_tag": "seo_rankings"
}
```

### Task 2: Content Brief Generator
```python
# When you're ready to write the next blog post:
# aibrain task: "seo_content_brief"
# Input: target keyword
# Output: brief with H2 structure, FAQ schema questions, internal link suggestions

CONTENT_BRIEF_PROMPT = """
You are an SEO content strategist for myaibrain.org (AI agent memory, MCP memory server).

Target keyword: {keyword}
Site context: myaibrain.org — open-source persistent memory OS for AI agents, 
               pip install aibrain, MCP-native, SQLite-backed.

Generate a content brief with:
1. Title (H1) with exact keyword
2. Meta description (155 chars max)
3. H2 outline (6-8 sections)
4. FAQ schema questions (5 questions a featured snippet would answer)
5. Internal links to suggest (from existing pages)
6. Competing URLs to research
7. Estimated word count
"""
```

### Task 3: GSC Anomaly Alert
```python
# Weekly: pull GSC data, compare to prior week
# Alert if: clicks drop > 20%, new impressions spike (new ranking opportunity)
```

### Task 4: Weekly SEO Digest
```python
# Every Monday: run weekly_report.py, store summary in aibrain memory
# Tag: "seo_weekly_YYYY-MM-DD"
# Use for: tracking trajectory toward #1 positions
```

---

## Milestone Tracker

| Milestone | Target Date | Success Metric |
|---|---|---|
| GSC live + sitemap indexed | Day 3 | All pages indexed |
| First blog post live | Day 7 | URL in GSC |
| Brand terms ranking | Day 14–30 | #1–3 for "myaibrain", "aibrain" |
| Long-tail first rankings | Day 30–60 | Top 20 for how-to keywords |
| 5 Tier 2 backlinks acquired | Day 30 | GSC shows referring domains |
| Long-tail in top 10 | Day 60–90 | 3+ keywords in positions 1–10 |
| Category terms top 20 | Day 90 | "AI agent memory" positions 1–20 |
| ProductHunt launch | Day 90+ | Coordinate with v1.0 |
| Category terms top 5 | Day 120–180 | "MCP memory server" top 5 |

---

## Quick Wins Checklist (Do This Week)

- [ ] Set up Google Search Console + submit sitemap
- [ ] Fix PyPI description to include anchor text links to myaibrain.org
- [ ] Fix GitHub README: link to docs with keyword anchor text
- [ ] Submit PR to at least one awesome-mcp-servers list
- [ ] Publish first blog post: "How to Give Your AI Agent Persistent Memory"
- [ ] Post Show HN
- [ ] Post to r/LocalLLaMA and r/ClaudeAI
- [ ] Deploy `seo/rank_tracker.py` as an aibrain daily task
- [ ] Set up `seo/weekly_report.py` as Monday morning task
