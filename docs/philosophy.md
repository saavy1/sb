# Superbloom: Philosophy & Design Principles

*The north star for building a homelab that feels alive.*

---

## Vision: The Interface IS the Infrastructure

Right now, your homelab is a collection of disparate, high-friction tools:

- **Kubernetes** manages containers
- **ZFS** manages storage  
- **Jellyfin** manages media
- **Pterodactyl** manages games
- **Grafana** monitors everything

To use them, you **switch contexts**. You open a dashboard for one, SSH into another, curl an API for a third.

**Superbloom's vision** is that **Discord becomes the unified command line for your entire digital life.** 

You don't "go to Sonarr" to check a download. You ask the room, "Where is my show?" and the room answers. You don't SSH to restart a server. You say "the internet feels slow" and your homelab investigates, correlates data across systems, and tells you what's wrong.

### The Nervous System Metaphor

Your homelab is not a collection of services. It's a **living organism**.

- Media arrives, drives fill up, containers crash, friends join games
- The AI isn't there to execute commands — it's the **nervous system**
- It **senses** pain (high CPU temp, full disk, crashed container)
- It **communicates** in human terms (not error codes)
- It **remembers** what happened before (patterns, preferences, history)
- It **anticipates** problems before they happen (disk filling up, bandwidth saturation)

This is **proprioception for your infrastructure** — the system's awareness of its own state.

### Why "Superbloom"?

A superbloom is an explosion of life after a long dormancy. This project is the same:

- A monorepo where **ideas can cross-pollinate**
- An **ecosystem**, not just a codebase
- Infrastructure that **grows and adapts** with you
- Tools that **multiply each other's value** (the whole > sum of parts)

---

## Core Principle: Frictionless Competence

Every interaction should embody **Frictionless Competence**:

### Low Friction
- You shouldn't SSH to see why a drive is full
- You shouldn't open a VPN to restart a stuck server  
- You shouldn't remember URLs, ports, or exact command syntax
- **The interaction happens where you already are** (Discord, Dashboard)

### High Context
- The system knows what "the server" means (context from conversation)
- It checks player counts before stopping servers
- It correlates disk space with active downloads
- It understands **relationships between systems** (downloads affect bandwidth, transcoding affects CPU)

### The Caring Quality

The system should feel like it **cares** about its own health:

❌ **Bad:** Blindly executes "stop server" command  
✅ **Good:** "There are still 3 people on ATM-10. Want to warn them first?"

❌ **Bad:** Downloads fill disk to 100%, everything breaks  
✅ **Good:** "Disk at 90%. At current rate you'll fill up in 3 weeks. Should I slow downloads?"

The AI isn't just a command executor — it's a **responsible steward** of your infrastructure.

---

## The Progression of Agency

We are building The Machine through **four levels of increasing intelligence**:

### Level 1: The Remote Control (Starting Point)

**Interaction:**  
`/server start atm-10`

**Vibe:**  
Mechanical. You must know the exact button to press. Typos fail. You are the operator; the bot is the tool.

**Mental Load:**  
High. You remember server names, exact command syntax, check status yourself.

---

### Level 2: The Aggregator (Phase 1)

**Interaction:**  
`/ask what is running?`

**Vibe:**  
Informational. The bot sees across boundaries. It knows that Minecraft is using RAM and Jellyfin is using CPU. It connects dots you previously connected manually.

**Mental Load:**  
Medium. You still ask the right questions, but data is centralized.

**Example:**
```
You: what's using all my RAM?

Bot: Current RAM breakdown:
     • Jellyfin: 8.2GB (transcoding)
     • Minecraft atm-10: 8.0GB
     • PostgreSQL: 4.1GB
     • K3s system: 3.8GB
     Total: 28.2GB / 64GB used
```

---

### Level 3: The Agent (Phase 2)

**Interaction:**  
`/ask the internet feels slow, can you check why?`

**Vibe:**  
Magical. The bot understands **intent**. It doesn't just run a speed test — it looks at Sabnzbd download rates, Jellyfin transcode queue, correlates with network saturation.

**Mental Load:**  
Low. You describe symptoms; the system diagnoses root cause.

**Example:**
```
You: the internet feels slow

Bot: Found it! Sabnzbd is maxing out downloads (87 MB/s).
     Also, 2 active 4K transcodes hitting CPU hard.
     
     Want me to pause downloads until transcodes finish?
```

---

### Level 4: The Nervous System (Future)

**Interaction:**  
System acts autonomously (with transparent communication).

**Vibe:**  
It feels like a **teammate**. It implies a level of "caring" about the system state.

**Mental Load:**  
Minimal. The system manages itself; you're just informed of important changes.

**Example:**
```
[Automation runs in background]

Bot: 🛑 Stopped vanilla server (empty for 15m)
     ▶️ Resumed downloads
     
     Also FYI: Disk at 85% now. Keeping an eye on it.
```

---

## The Black Box Aesthetic

There is a deeply satisfying aesthetic to the "Black Box" implementation:

### User Side (Simple)
Clean, natural language in Discord or Dashboard:

```
"Get me the movie The Substance"
"Start the server"
"Why is it so hot in here?"
```

### System Side (Complex)
A chaotic, sophisticated dance of API calls:

1. Search Jellyfin for "The Substance"
2. Not found → search Radarr  
3. Add to download queue
4. Check disk space → 95% full
5. Pause other downloads to make room
6. Start download
7. Notify user

**The user sees:**
> "I've queued that up for you, but just so you know, the disk is 95% full, so I paused the other downloads first."

### The Vibe Check

**If the bot replies with JSON or error stack traces, we have failed.**  
**If the bot replies with thoughtful, contextual English, we have succeeded.**

This is the pinnacle of homelab engineering: **turning maintenance into conversation**.

---

## Technical Principles

### 1. Durable Automations

The system can **sleep and wake** based on events and conditions:

```typescript
// Example: Smart server lifecycle
onPlayerDisconnect() {
  if (playerCount === 0) {
    this.alarm(15 * 60 * 1000); // Wake in 15 minutes
  }
}

onAlarm() {
  if (stillEmpty) {
    stopServer();
    resumeDownloads();
    notify("Stopped server (empty 15m), resumed downloads");
  }
}
```

Automations are **state machines** that persist across time. They enable:
- **Conditional waiting** (pause downloads, wait for game server to stabilize, resume)
- **Proactive monitoring** (detect patterns, act before problems happen)
- **Autonomous maintenance** (with transparent communication)

### 2. Proactive Intelligence

The system doesn't just **react** to problems — it **anticipates** them:

❌ **Reactive:** Disk fills to 100%, everything breaks  
✅ **Proactive:** At 90%, warns you: "At current rate, disk fills in 3 weeks"

❌ **Reactive:** Server crashes from OOM  
✅ **Proactive:** Detects RAM climbing, suggests stopping idle services

### 3. Multi-Tool Orchestration

Complex queries require **chaining multiple tools**:

```
You: start atm-10 but don't lag my downloads

Behind the scenes:
1. Check current download speed
2. Pause downloads if saturating bandwidth
3. Start game server
4. Wait 5 minutes for startup
5. Check server is healthy
6. Resume downloads
7. Report back to user
```

The LLM handles the orchestration logic. We just provide the tools.

---

## Autonomy & Trust

### When to Ask Permission

**Never autonomous for destructive actions:**
- Deleting data
- Stopping servers with active players
- Modifying configurations

**Ask first, then act:**
```
Bot: Disk is at 95%. I can:
     1. Pause all downloads (safe)
     2. Delete completed downloads >30 days old (frees ~50GB)
     3. Wait for you to clean up manually
     
     What should I do?
```

### When to Act Autonomously

**Safe, reversible optimizations:**
- Stopping empty game servers after 15min
- Resuming paused downloads when bandwidth frees
- Adjusting thermostat within configured range

**The rule:**  
If the action is **reversible** and **within established parameters**, act autonomously.  
If it's **destructive** or **outside normal bounds**, ask first.

### Transparent Communication

**Every autonomous action must be communicated:**

```
✅ "Stopped vanilla (empty 15m), resumed downloads"
✅ "Paused downloads (disk 95%), please free up space"
✅ "Lowered AC to 68°F (room was 76°F, you were gaming)"
```

**Autonomy without communication is just mysterious failures.**

This requires a **dedicated notifications channel** (Discord, Dashboard alerts, push notifications) where the system reports what it's doing and why.

---

## The Taste Test

Every feature must pass these criteria:

### 1. Is it frictionless?
Can I ask in plain English from Discord without context-switching?

### 2. Is it competent?
Does it check context before acting? (player counts, disk space, active streams)

### 3. Does it care?
Does it warn me about consequences? Does it offer alternatives?

### 4. Is the output human?
No JSON. No error codes. Just natural conversation.

### Examples

❌ **Fails taste test:**
```
You: stop the server
Bot: Error: MultipleServersRunning
     Required: server_name: string
```

✅ **Passes taste test:**
```
You: stop the server
Bot: You have 3 servers running:
     • atm-10 (2 players) 
     • vanilla (empty)
     • necesse (1 player)
     
     Want me to stop vanilla since it's empty?
```

---

## Real-World Scenarios

### Game Server Management

```
You: my friend wants to join ATM-10, how do they connect?

Bot: To join atm-10:
     1. Install "ATM 10" modpack (CurseForge)
     2. Connect to: play.saavylab.dev:30001
     
     Current status: 2/20 players online
     Server is running version 1.2.4 (347 mods)
```

### Media Automation

```
You: get me the movie The Substance

Bot: Adding "The Substance (2024)" to Radarr...
     
     Heads up: Disk is 95% full. I paused your other downloads 
     to make room. Should arrive in about 30 minutes.
```

### Proactive System Health

```
[Automation detects pattern]

Bot: 📊 FYI: Your vanilla server has been empty every weeknight 
     for the past 2 weeks. Want me to auto-stop it at 11 PM on 
     weekdays to save resources?
```

### Home Automation

```
You: it's too hot in here

Bot: Yeah, 76°F right now (target: 70°F). I checked why:
     
     • Outside: 95°F (AC is fighting uphill)
     • Your game servers: generating ~400W of heat
     • ATM-10 & vanilla: idle for 3 hours
     
     I can stop the idle servers (will drop temp ~2°F in 20 min).
     Want me to do that?
```

---

## The Path Forward

### Phase 1: Foundation (Now)
- Natural language control via Discord/Dashboard
- Multi-domain visibility (games, media, system, apps)
- Basic tool use with DeepSeek V3.2 Exp

### Phase 2: Intelligence (3-6 months)
- Multi-tool orchestration (chain operations intelligently)
- Context checking (player counts, disk space, bandwidth)
- Protective logic (refuse dangerous ops, offer alternatives)

### Phase 3: Autonomy (6-12 months)
- Durable automations (sleep/wake on events)
- Proactive monitoring (anticipate problems)
- Pattern learning (remember preferences)

### Phase 4: Ecosystem (Future)
- Home automation integration
- Self-healing infrastructure
- Autonomous maintenance (with approval)

---

## Closing Thoughts

We are not building a bot. We are building a **homelab operating system** where the interface and the infrastructure are one.

Where maintenance becomes conversation.  
Where your Discord channel is your terminal.  
Where the system cares about its own health.  
Where intelligence emerges from simple principles.

**This is Superbloom.**

An explosion of life. An ecosystem. A nervous system for your digital home.

---

*When in doubt, ask: "Does this feel like talking to a caring teammate, or like using a vending machine?"*

*If it's the latter, we're not done yet.*