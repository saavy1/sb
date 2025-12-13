# The Machine - Product Specification

**Version:** 1.0  
**Last Updated:** December 2024  
**Tagline:** Your homelab's command center

---

## Vision

The Machine is the **single starting point** for interacting with your homelab. It's your personalized portal that provides quick status visibility, launches your applications, and handles common operational tasks—without trying to replace specialized tools.

**Core Philosophy:**
- Be the **80/20 solution**: Handle the tasks you do daily, delegate deep work to specialized tools
- **Complement, don't duplicate**: Link to Capacitor/Grafana/etc. rather than rebuild them
- **Fast and focused**: Load quickly, show what matters, get out of your way
- **Purpose-built**: Designed for YOUR homelab, not generic infrastructure

---

## Problem Statement

### What You Lost
After migrating from Authentik to Authelia, you lost:
- Centralized app launcher / homepage
- Visual overview of what services are running
- Single sign-on portal experience

### What's Still Painful
- **Bookmarks everywhere**: 15+ services scattered across bookmark folders
- **No visibility**: Don't know if something's broken until you try to use it
- **SSH dependency**: Common tasks (Flux reconcile, game server management) require terminal access
- **Context switching**: Jump between Discord bot (mobile), SSH (management), and browser (services)
- **No overview**: Can't glance and know "everything is okay"

### What You Need
A **homelab dashboard** that:
1. Launches all your services from one place
2. Shows system health at a glance
3. Manages game servers via GUI
4. Performs common operations without SSH
5. Links to specialized tools when needed

---

## User Personas

### Primary User: You (Homelab Admin)
**Context:**
- Solo operator of homelab infrastructure
- Technical user comfortable with command line
- Wants GUI for convenience, not because CLI is too hard
- Values speed and efficiency over hand-holding
- Accesses from desktop (primary), mobile (secondary), tablet (occasional)

**Use Cases:**
- **Morning check**: "Is everything running?" (30 seconds)
- **Launch apps**: "I want to watch Jellyfin" (2 clicks)
- **Manage game servers**: "Start ATM10 for friends tonight" (1 minute)
- **After deployment**: "Did my Flux changes apply?" (quick check + reconcile if needed)
- **Before maintenance**: "Create snapshot, stop game servers" (2 minutes)
- **Mobile access**: "Check server status from phone" (quick glance)

**Pain Points:**
- Forgetting which services are running
- Manually typing URLs or digging through bookmarks
- SSHing just to run `flux reconcile`
- Discord bot is great for mobile but limited for complex tasks
- No single place to see "overall health"

---

## Core Features

### 1. Application Launcher

**What:** Grid-based portal to launch all homelab services.

**Why:** Replace the lost Authentik homepage. Single URL to access everything.

**Requirements:**

**Must Have:**
- Display all services as cards with icons
- Click card to open service (new tab)
- Real-time status indicator (online/offline/error)
- Group by category (Media, Infrastructure, Games, Productivity)
- Search/filter applications
- Responsive grid (desktop: 4 columns, tablet: 3, mobile: 2)

**Should Have:**
- Custom icon support (emoji or image URL)
- Reorder applications (drag-and-drop)
- Pin favorites to top
- "Internal only" badge for Tailscale-only services
- Quick action menu per app (restart, view logs)

**Could Have:**
- Add custom external links (GitHub repos, documentation)
- Usage tracking (most-used apps float to top)
- Recently used section
- Service description/notes

**Won't Have:**
- SSO integration (Authelia handles this)
- User permissions (single-user system)
- App installation/management (that's Flux/NixOS)

**API Endpoints:**
```typescript
GET  /api/apps              // List all applications with status
POST /api/apps              // Add custom application
PUT  /api/apps/:id          // Update application config
DELETE /api/apps/:id        // Remove custom application
GET  /api/apps/:id/health   // Check application health
```

**Configuration:**
```typescript
interface Application {
  id: string;
  name: string;
  url: string;
  icon: string;              // emoji or URL
  category: string;
  internal: boolean;         // Tailscale-only
  description?: string;
  status: "online" | "offline" | "error" | "unknown";
  statusChecked?: string;    // ISO timestamp
}
```

**Success Metrics:**
- Can access any service in <3 clicks from landing
- Health checks run every 30s, cached for performance
- Load time <500ms

---

### 2. System Health Dashboard

**What:** Overview page showing homelab status at a glance.

**Why:** Answer "is everything okay?" in 5 seconds without SSH.

**Requirements:**

**Must Have:**
- K3s cluster status (node count, health, pod count)
- Storage usage (used/total, percentage, visual indicator)
- Service count (running/total)
- Overall health indicator (🟢 all good, 🟡 warnings, 🔴 critical issues)
- Recent activity feed (last 10 events)
- Quick action buttons (Reconcile Flux, Create Snapshot)

**Should Have:**
- Critical service status (Jellyfin, game servers, DNS)
- Flux reconciliation status (last run, current commit)
- Resource usage (CPU/memory at cluster level)
- Uptime indicator
- Link to detailed views (Grafana for metrics, Capacitor for Flux)

**Could Have:**
- Weather widget (because why not)
- Custom widgets/metrics
- Customizable layout

**Won't Have:**
- Historical metrics (use Grafana)
- Custom dashboards (overkill)
- Alert configuration (use existing monitoring)

**API Endpoints:**
```typescript
GET /api/health                    // Overall system health
GET /api/health/k3s                // K3s cluster details
GET /api/health/storage            // Storage status
GET /api/health/services           // Service health summary
GET /api/activity                  // Recent events
```

**Layout:**
```
┌─────────────────────────────────────────┐
│ System Health              🟢           │
├─────────────────────────────────────────┤
│ [K3s] [Storage] [Services] (3 columns)  │
│                                         │
│ Applications (grid, top 8)              │
│ [See All →]                             │
│                                         │
│ Game Servers (compact list)             │
│ [Manage →]                              │
│                                         │
│ Quick Actions                           │
│ [Reconcile Flux] [Snapshot] [Logs]     │
│                                         │
│ Recent Activity (last 5)                │
│ [View All →]                            │
└─────────────────────────────────────────┘
```

**Success Metrics:**
- Dashboard loads in <1 second
- Health status updates every 30s via polling (or WebSocket)
- All critical info visible without scrolling (on desktop)

---

### 3. Game Server Management

**What:** Full GUI for managing Minecraft and other game servers.

**Why:** Your unique use case. Discord bot is mobile-friendly, dashboard is power-user interface.

**Requirements:**

**Must Have:**
- List all game servers with status
- Create new server (form: name, modpack, resource limits)
- Start/stop/restart individual servers
- View server details (players online, uptime, port, resources)
- Delete server (with confirmation)
- Real-time status updates

**Should Have:**
- Bulk actions (stop all, restart all)
- Player list (who's online)
- Resource limit configuration (memory, CPU)
- Server console (read-only logs)
- Quick filters (running/stopped, by game type)
- "Preparing for maintenance" mode (stop all with one click)

**Could Have:**
- Interactive console (send commands)
- Backup/restore points
- Modpack version management
- Server templates (quick create from preset)
- Player whitelist management
- Scheduled start/stop

**Won't Have:**
- In-game admin tools (use game's native tools)
- Player analytics (overkill)
- Multi-server orchestration (e.g., proxy networks)

**API Endpoints:**
```typescript
GET    /api/game-servers           // List all servers
POST   /api/game-servers           // Create server
GET    /api/game-servers/:name     // Get server details
PUT    /api/game-servers/:name     // Update server config
DELETE /api/game-servers/:name     // Delete server
POST   /api/game-servers/:name/start
POST   /api/game-servers/:name/stop
POST   /api/game-servers/:name/restart
GET    /api/game-servers/:name/logs
GET    /api/game-servers/:name/players
```

**Views:**

**List View:**
```
Game Servers                    [+ Create Server]

┌────┬──────────┬──────────┬─────────┬─────────┐
│ •  │ Name     │ Type     │ Players │ Actions │
├────┼──────────┼──────────┼─────────┼─────────┤
│ 🟢 │ atm10    │ MC/ATM10 │ 3/20    │ [⋮]    │
│ 🔴 │ necesse  │ Necesse  │ -       │ [⋮]    │
│ 🟢 │ vanilla  │ MC       │ 1/10    │ [⋮]    │
└────┴──────────┴──────────┴─────────┴─────────┘

[Stop All] [Restart All]
```

**Detail View:**
```
← Back                    [Stop] [Restart] [Delete]

atm10                                          🟢
Minecraft • All The Mods 10

┌────────────┐ ┌────────────┐ ┌────────────┐
│ Players    │ │  Memory    │ │  Uptime    │
│   3 / 20   │ │ 8GB / 16GB │ │ 2d 4h 32m  │
└────────────┘ └────────────┘ └────────────┘

Details
  Port:       25565
  Modpack:    all-the-mods-10
  Created:    2024-12-10 by @saavy

Players Online
  • Steve (2h 15m)
  • Alex (45m)
  • Herobrine (1h 3m)

Console (last 50 lines)              [View Full]
  [12:34:56] Server started
  [12:35:02] Steve joined
  [12:36:14] Chunk loaded at [x,y,z]
```

**Success Metrics:**
- Create server: <2 minutes from click to running
- Start/stop: <5 seconds response time
- Status updates: real-time (WebSocket) or <10s polling

---

### 4. Storage Management

**What:** ZFS pool overview and snapshot management.

**Why:** Snapshots are critical for safe operations. SSH every time is annoying.

**Requirements:**

**Must Have:**
- Pool usage (used/total, visual progress)
- Pool health status (ONLINE/DEGRADED/FAULTED)
- List snapshots (name, size, created)
- Create snapshot (with custom name)
- Delete snapshot (with confirmation)

**Should Have:**
- Scrub status and last run time
- Dataset breakdown (which datasets use most space)
- Snapshot space usage
- Quick snapshot templates ("pre-maintenance", "weekly", "manual")

**Could Have:**
- Schedule snapshot creation
- Automatic snapshot cleanup (keep last N)
- Rollback to snapshot (dangerous, needs safeguards)

**Won't Have:**
- Pool creation/destruction
- Disk management
- ZFS send/receive
- SMART data

**API Endpoints:**
```typescript
GET    /api/storage                // Pool overview
GET    /api/storage/snapshots      // List snapshots
POST   /api/storage/snapshots      // Create snapshot
DELETE /api/storage/snapshots/:name // Delete snapshot
GET    /api/storage/datasets       // Dataset usage
GET    /api/storage/scrub          // Scrub status
```

**Layout:**
```
Storage                                    🟢

Pool: tank
2.1 TB / 20 TB used (10.5%)
▓▓▓░░░░░░░░░░░░░░░░░

Health:     ONLINE
Last scrub: 7d ago (no errors)
Next scrub: in 23d

Datasets
  jellyfin:     800 GB
  minecraft:    500 GB
  downloads:    400 GB
  other:        400 GB

Snapshots (12)              [Create Snapshot]
┌────────────────────────────────────────────┐
│ tank@auto-2024-12-12  12GB  2h ago    [×] │
│ tank@pre-migration    8GB   1d ago    [×] │
│ tank@weekly-2024-12   15GB  7d ago    [×] │
└────────────────────────────────────────────┘
```

**Success Metrics:**
- Create snapshot: <10 seconds
- List snapshots: <1 second load
- Visual indication if approaching capacity (>80%)

---

### 5. Flux Integration

**What:** Quick Flux operations and link to Capacitor for details.

**Why:** Daily task is "did my changes deploy?" Not rebuilding Capacitor.

**Requirements:**

**Must Have:**
- Overall Flux status (healthy/reconciling/failed)
- Last reconciliation time
- Current Git commit deployed
- Reconcile buttons (all, or per kustomization)
- Link to Capacitor for details

**Should Have:**
- List kustomizations with individual status
- Show reconciliation errors if any
- Git branch info
- Link to GitHub commit

**Could Have:**
- Suspend/resume reconciliation
- Reconciliation history (last 10)

**Won't Have:**
- Kustomization editor (use Git + Capacitor)
- Flux configuration (use NixOS config)
- Source management (use Capacitor)

**API Endpoints:**
```typescript
GET  /api/flux/status              // Overall status
GET  /api/flux/kustomizations      // List with status
POST /api/flux/reconcile           // Reconcile (all or specific)
```

**Layout:**
```
Flux GitOps                    🟢  [Open Capacitor →]

Status:     Healthy
Last sync:  2m ago
Commit:     a1b2c3d (main)

[Reconcile All]

Kustomizations
┌──────────────────────────────────────────────┐
│ 🟢 apps            • Synced 2m ago           │
│    12 resources    [Reconcile]               │
├──────────────────────────────────────────────┤
│ 🟢 infrastructure  • Synced 5m ago           │
│    5 resources     [Reconcile]               │
└──────────────────────────────────────────────┘
```

**Success Metrics:**
- Reconcile triggers in <2 seconds
- Status updates every 30s
- Clear error visibility if reconciliation fails

---

### 6. Activity Feed

**What:** Recent events across the homelab.

**Why:** Quick audit trail. "What changed?" "What broke?"

**Requirements:**

**Must Have:**
- Last 20 events, reverse chronological
- Event types: Flux reconcile, pod restart, game server start/stop, snapshot created
- Timestamp (relative: "2m ago")
- Event source (which service/component)

**Should Have:**
- Filter by type
- Filter by time range
- Event details on click
- Severity levels (info/warning/error)

**Could Have:**
- Export to CSV
- Search events
- Subscribe to events (notifications)

**Won't Have:**
- Long-term storage (that's for log aggregation tools)
- Complex querying

**API Endpoints:**
```typescript
GET /api/activity                  // Recent events
GET /api/activity?type=flux        // Filter by type
GET /api/activity?since=1h         // Time filter
```

**Layout:**
```
Recent Activity                        [View All]

• Flux reconciled apps (2m ago)
• atm10 started by @saavy (15m ago)
• jellyfin restarted (OOMKilled) (18m ago)
• Snapshot created: tank@auto (1h ago)
• necesse stopped (4h ago)
• Flux reconciled infrastructure (6h ago)
```

**Success Metrics:**
- Load instantly (<500ms)
- Events appear in real-time (WebSocket or <30s polling)

---

## Navigation & Information Architecture

### Primary Navigation (Sidebar)

```
The Machine

├─ Home (dashboard + app launcher)
├─ Game Servers
│  ├─ All Servers (list view)
│  └─ [Individual server pages]
├─ Storage
│  ├─ Overview
│  └─ Snapshots
├─ Activity (event feed)
└─ Settings
   ├─ Applications (manage app launcher)
   ├─ Preferences
   └─ About
```

### Quick Links (Header)

```
[Search/CMD+K]  [Notifications]  [User Menu]
                                  ├─ Settings
                                  ├─ Open Capacitor
                                  ├─ Open Grafana
                                  └─ Sign Out
```

### External Links

**Infrastructure Tools:**
- Capacitor (Flux management)
- Grafana (metrics/monitoring)
- Uptime Kuma (uptime monitoring)

**Services:**
- All services via app launcher

---

## User Flows

### Flow 1: Morning Check
1. Load `https://machine.yourdomain.com`
2. Dashboard shows: 🟢 All systems operational
3. Scan app launcher - all services online
4. Check game servers - see who's playing
5. Done (30 seconds)

### Flow 2: Start Game Server for Friends
1. Navigate to Game Servers (or use CMD+K)
2. Find "atm10" in list
3. Click [Start] button
4. See status change: 🔴 Stopped → 🟡 Starting → 🟢 Running
5. Copy IP/port or share with friends
6. Done (1 minute)

### Flow 3: Deploy Infrastructure Change
1. Push changes to GitHub
2. Load The Machine
3. See Flux status: "Reconciling..."
4. Click [Reconcile apps] if impatient
5. Watch status: 🟡 Reconciling → 🟢 Synced
6. Check Activity feed for confirmation
7. Done (2 minutes)

### Flow 4: Pre-Maintenance Snapshot
1. Navigate to Storage
2. Click [Create Snapshot]
3. Enter name: "pre-maintenance-2024-12-12"
4. Confirm
5. See new snapshot appear in list
6. Done (30 seconds)

### Flow 5: Launch Service
1. Load home page
2. See app launcher
3. Click "Jellyfin" card
4. Opens in new tab
5. Done (2 clicks, 5 seconds)

---

## Non-Functional Requirements

### Performance
- **Page load**: <1 second (dashboard)
- **Time to interactive**: <2 seconds
- **API response**: <500ms for reads, <2s for writes
- **Real-time updates**: 30s polling or WebSocket
- **Works on slow connection**: Functional on 3G

### Reliability
- **Uptime**: 99.9% (runs in K3s with restart policies)
- **Graceful degradation**: If K3s API is down, show cached data + warning
- **Error handling**: User-friendly messages, not stack traces

### Security
- **Authentication**: Required (via Authelia SSO)
- **Authorization**: Single user (you), no RBAC needed
- **API security**: Bearer token or session cookie
- **HTTPS only**: No HTTP allowed
- **CSRF protection**: Standard token-based
- **Input validation**: All user inputs sanitized

### Accessibility
- **Keyboard navigation**: Full support
- **Screen reader**: Semantic HTML, ARIA labels
- **Color contrast**: WCAG AA minimum
- **Focus indicators**: Visible on all interactive elements
- **No motion for critical info**: Status can be determined without animations

### Browser Support
- **Modern browsers**: Chrome/Edge/Firefox/Safari (last 2 versions)
- **Mobile browsers**: iOS Safari, Android Chrome
- **No IE11 support**: Not needed

### Responsive Design
- **Desktop**: 1024px+ (primary target)
- **Tablet**: 768px-1023px (functional)
- **Mobile**: 375px-767px (critical features only)

### Data & Privacy
- **No external tracking**: No Google Analytics, no third-party scripts
- **Local only**: All data stays in homelab
- **No telemetry**: No phone-home behavior

---

## Technical Architecture

### Backend (Elysia API)

**Responsibilities:**
- Serve API endpoints
- Health checks for applications
- K3s API interactions (via kubectl/client library)
- ZFS operations (via shell commands)
- Flux operations (via flux CLI)
- WebSocket server for real-time updates
- Session management

**Technology:**
- Bun runtime
- Elysia framework
- SQLite for persistence (app configs, activity log)
- Eden Treaty for type-safe client

### Frontend (React + TanStack Router)

**Responsibilities:**
- User interface
- Real-time updates (WebSocket or polling)
- Form handling
- State management
- Routing

**Technology:**
- Vite build tool
- React 18
- TanStack Router (file-based routing)
- TanStack Query (data fetching)
- shadcn/ui components
- Tailwind CSS
- Eden Treaty client

### Database (SQLite)

**Tables:**
- `applications`: User-configured apps in launcher
- `activity_log`: Recent events (last 1000 entries)
- `settings`: User preferences
- `game_servers`: Server configurations (or from K8s state?)

**Notes:**
- Lightweight, embedded, no separate DB server needed
- Persisted in K3s PVC or host path

### Integration Points

**K3s API:**
- Node status
- Pod list/status
- Events
- Apply manifests (for game servers)

**Flux CLI:**
- `flux get kustomizations`
- `flux reconcile kustomization <name>`

**ZFS:**
- `zfs list` (pools, datasets, snapshots)
- `zfs snapshot`
- `zfs destroy`

**Health Checks:**
- HTTP HEAD/GET requests to service URLs
- Timeout: 5s
- Cached: 30s

---

## Success Criteria

### MVP Success (Phase 1)
- ✅ Can launch any homelab service in <3 clicks
- ✅ Can see system health status in <5 seconds
- ✅ Can start/stop game servers without SSH
- ✅ Can reconcile Flux without SSH
- ✅ Dashboard loads in <2 seconds
- ✅ Works on mobile (responsive)

### Full Success (Phase 2)
- ✅ Used daily as primary homelab interface
- ✅ SSH usage reduced by 80% for routine tasks
- ✅ No bookmarks needed for homelab services
- ✅ Can perform all common operations from GUI
- ✅ Real-time status updates working

### Long-term Success (Phase 3)
- ✅ Power-user features (CMD+K, keyboard shortcuts)
- ✅ Never need to SSH except for deep debugging
- ✅ Friends/family could use it to manage game servers
- ✅ Showcase-quality interface (proud to demo)

---

## Out of Scope

### Explicitly NOT Building

**Monitoring & Metrics:**
- Time-series metrics (use Grafana)
- Custom dashboards (use Grafana)
- Alerting (use existing monitoring)
- Historical data analysis

**Log Management:**
- Log aggregation (use Loki)
- Full-text log search (use Grafana/Loki)
- Long-term log storage

**Infrastructure Provisioning:**
- K3s node management
- NixOS configuration editing
- Service installation/uninstallation

**User Management:**
- Multi-user support
- Permissions/roles
- User invitations

**Advanced Features:**
- CI/CD pipelines
- Backup orchestration (beyond snapshots)
- Network configuration
- Certificate management
- DNS management

**Why?** These are either:
1. Better handled by specialized tools (Grafana, Capacitor)
2. Should stay in declarative config (NixOS, Flux)
3. Overkill for single-user homelab
4. Out of scope for "control center" concept

---

## Future Considerations

### Potential Phase 4+ Features

**Mobile App:**
- Native iOS/Android app
- Push notifications for alerts
- Quick actions (start server from notification)

**Voice Control:**
- "Hey Siri, start ATM10 server"
- Via HomeKit/Shortcuts integration

**Automation:**
- Scheduled game server start/stop
- Auto-snapshot before Flux reconcile
- Auto-restart failed services

**Advanced Game Server Features:**
- Mod management
- World backups
- Performance metrics
- Player analytics

**Collaboration:**
- Share read-only dashboard link
- Guest access for friends (view game servers only)
- Discord webhook integration

**API Extensions:**
- Public API for third-party integrations
- Webhook receivers
- CLI tool (machine-cli)

---

## Design Constraints

### Must Respect
- Single-user system (you)
- Runs in K3s (not bare metal service)
- Uses existing auth (Authelia)
- Declarative infrastructure (Flux/NixOS)
- Limited compute resources (don't be a resource hog)

### Must Avoid
- Rebuilding existing tools (Capacitor, Grafana)
- Becoming a monitoring platform
- Requiring manual sync/maintenance
- Breaking GitOps principles
- Complexity creep

---

## Metrics & Analytics

### Usage Metrics (Internal Only)
- Page views (which pages are used most)
- Feature usage (which quick actions clicked)
- API call frequency
- Load times
- Error rates

**Purpose:** Understand what's valuable, what's not used

**Privacy:** Local only, no external tracking

---

## Deployment

### Installation
- Docker image published to GHCR
- Deployed via Flux (like other apps)
- SQLite database in PVC
- Environment variables for config

### Configuration
```yaml
env:
  - name: ELYSIA_API_URL
    value: http://localhost:3000
  - name: DATABASE_PATH
    value: /data/machine.db
  - name: K3S_CONFIG
    value: /etc/rancher/k3s/k3s.yaml
```

### Updates
- Git push to main
- Flux reconciles
- Rolling update (zero downtime)

---

## Documentation

### User Documentation
- README with screenshots
- Quick start guide
- Common tasks (how to add app, create server, etc.)

### Developer Documentation
- API reference (auto-generated from Eden Treaty types)
- Architecture overview
- Contributing guide (even though it's just you)

---

## Risk & Mitigation

### Risk 1: K3s API Changes Break Integration
**Likelihood:** Low  
**Impact:** High  
**Mitigation:** Use official client libraries, version pinning, integration tests

### Risk 2: Health Checks Overwhelm Services
**Likelihood:** Medium  
**Impact:** Low  
**Mitigation:** Aggressive caching (30s), timeout limits, rate limiting

### Risk 3: WebSocket Scaling Issues
**Likelihood:** Low (single user)  
**Impact:** Medium  
**Mitigation:** Fallback to polling, connection limits

### Risk 4: Security Vulnerability in Dependencies
**Likelihood:** Medium  
**Impact:** High  
**Mitigation:** Dependabot, regular updates, minimal dependencies

### Risk 5: Feature Creep
**Likelihood:** High  
**Impact:** Medium  
**Mitigation:** This spec. Stick to it. Say no to scope creep.

---

## Appendix A: API Reference

See separate API documentation (auto-generated from Eden Treaty types).

---

## Appendix B: Wireframes

See Design Specification document for detailed component mockups.

---

## Appendix C: Comparison to Alternatives

### vs. Heimdall/Homer/Organizr
**Them:** Static app launchers  
**The Machine:** Dynamic status, integrated controls, game server management

### vs. Portainer
**Them:** Docker/K8s generic management  
**The Machine:** Purpose-built for YOUR homelab, integrated with Flux/game servers

### vs. Grafana
**Them:** Metrics and monitoring  
**The Machine:** Operations and control, links to Grafana for metrics

### vs. Rancher
**Them:** Enterprise K8s platform  
**The Machine:** Lightweight, homelab-focused, opinionated

---

**End of Product Specification**

---

## Quick Reference Card

**What The Machine IS:**
- Your homelab homepage
- App launcher with status
- Game server control panel
- Quick operations dashboard
- Link hub to specialized tools

**What The Machine is NOT:**
- Monitoring platform (use Grafana)
- Flux UI (use Capacitor)
- Infrastructure provisioner (use NixOS/Flux)
- Multi-user platform
- Enterprise tool

**Success = You stop using SSH for 80% of tasks and bookmarks for 100% of services.**